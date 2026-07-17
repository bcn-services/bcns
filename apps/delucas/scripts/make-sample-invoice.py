#!/usr/bin/env python3
"""
make-sample-invoice.py — fabricate a simple one-page invoice PDF for e2e testing.

Fallback test data for the PDF->LLM leg when no real invoice is handy. Uses only
the Python standard library (no reportlab) and the built-in Helvetica font, which
pdfjs renders. NEVER use a real client document as a fixture (per PLAN guardrails).

Usage:
    python3 scripts/make-sample-invoice.py [out.pdf]

Default output: napoli-invoice.pdf  (Napoli Foods, dated, with a clear total)
"""
import sys
import zlib  # noqa: F401  (kept for future compression; unused for readability)

LINES = [
    (72, 720, 20, "Napoli Foods, Inc."),
    (72, 700, 10, "123 Wooster Street, New Haven, CT 06511"),
    (72, 686, 10, "napolifoods.example  |  (203) 555-0142"),
    (72, 650, 14, "INVOICE"),
    (72, 630, 11, "Invoice #: NF-20874"),
    (72, 614, 11, "Invoice date: 2026-07-09"),
    (72, 598, 11, "Bill to: DeLuca's Pizza"),
    (72, 560, 11, "Qty   Description                              Amount"),
    (72, 544, 11, "10    00 Caputo flour (25kg)                   420.00"),
    (72, 528, 11, "6     Whole peeled tomatoes (case)             186.50"),
    (72, 512, 11, "4     Fresh mozzarella (5lb)                   168.00"),
    (72, 496, 11, "1     Delivery                                  25.00"),
    (72, 470, 12, "Subtotal:                                     799.50"),
    (72, 454, 12, "Tax (0%):                                       0.00"),
    (72, 434, 14, "Total due: $799.50"),
    (72, 400, 10, "Terms: Net 15. Thank you for your business."),
]


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_content() -> bytes:
    parts = ["BT", "/F1 11 Tf"]
    for x, y, size, text in LINES:
        parts.append(f"/F1 {size} Tf")
        parts.append(f"1 0 0 1 {x} {y} Tm")
        parts.append(f"({esc(text)}) Tj")
    parts.append("ET")
    return ("\n".join(parts)).encode("latin-1")


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "napoli-invoice.pdf"
    content = build_content()

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += b"%d 0 obj\n" % i
        pdf += body
        pdf += b"\nendobj\n"

    xref_pos = len(pdf)
    n = len(objects) + 1
    pdf += b"xref\n0 %d\n" % n
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += b"%010d 00000 n \n" % off
    pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\n" % n
    pdf += b"startxref\n%d\n%%%%EOF\n" % xref_pos

    with open(out, "wb") as f:
        f.write(pdf)
    print(f"Wrote {out} ({len(pdf)} bytes) — Napoli Foods, 2026-07-09, total $799.50")


if __name__ == "__main__":
    main()
