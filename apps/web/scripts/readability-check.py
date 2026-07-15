#!/usr/bin/env python3
"""
Flesch-Kincaid grade-level check for apps/web/lib/content.ts.

Extracts body copy strings (description, bio, body, answer fields — not titles,
labels, tags, prices, or single words), concatenates them, and computes the
FK grade level using textstat.

Usage:
    python3 apps/web/scripts/readability-check.py

Exit code 0 = PASS (grade <= 8), Exit code 1 = FAIL (grade > 8).
"""

import re
import sys
import os

try:
    import textstat
except ImportError:
    print("ERROR: textstat not installed. Run: pip install textstat")
    sys.exit(2)

CONTENT_TS = os.path.join(
    os.path.dirname(__file__), "..", "lib", "content.ts"
)

# Keys whose string values are body copy (not structural labels/titles/prices/tags)
BODY_KEYS = {
    "description",
    "bio",
    "body",
    "answer",
    "subheadline",
    "outcome",
    "whyBcns",
}

def extract_body_strings(path: str) -> list[tuple[str, str]]:
    """
    Return [(key, value), ...] for all string literals in content.ts where
    the immediately preceding key name is in BODY_KEYS.
    """
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()

    # Match: key: "value"  or  key: `value`  (single-line strings only)
    # Also matches multi-line template literals but we only grab the first line.
    pattern = re.compile(
        r'\b(' + '|'.join(re.escape(k) for k in BODY_KEYS) + r')'
        r'\s*:\s*'
        r'(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)',
        re.DOTALL,
    )

    results = []
    for m in pattern.finditer(source):
        key = m.group(1)
        val = m.group(2) if m.group(2) is not None else m.group(3)
        # Strip escape sequences and [INPUT:...] placeholders
        val = val.replace("\\n", " ").replace('\\"', '"').replace("\\'", "'")
        val = re.sub(r'\[INPUT:[^\]]*\]', '', val).strip()
        if len(val.split()) >= 5:  # skip very short strings
            results.append((key, val))
    return results


def main():
    if not os.path.isfile(CONTENT_TS):
        print(f"ERROR: cannot find {CONTENT_TS}")
        sys.exit(2)

    entries = extract_body_strings(CONTENT_TS)
    if not entries:
        print("ERROR: no body copy strings found — check extraction logic")
        sys.exit(2)

    # Concatenate all body copy
    corpus = " ".join(v for _, v in entries)

    grade = textstat.flesch_kincaid_grade(corpus)
    word_count = len(corpus.split())

    print(f"Body copy extracted: {len(entries)} strings, {word_count} words")
    print(f"Flesch-Kincaid grade level: {grade:.1f}")

    # Per-key breakdown for debugging
    print("\nPer-key breakdown:")
    by_key: dict[str, list[str]] = {}
    for k, v in entries:
        by_key.setdefault(k, []).append(v)

    for key, vals in sorted(by_key.items()):
        combined = " ".join(vals)
        key_grade = textstat.flesch_kincaid_grade(combined)
        print(f"  {key}: {key_grade:.1f} ({len(vals)} strings)")

    print()
    threshold = 8.0
    if grade <= threshold:
        print(f"PASS: FK grade {grade:.1f} <= {threshold}")
        sys.exit(0)
    else:
        print(f"FAIL: FK grade {grade:.1f} > {threshold} — simplify the highest-scoring sections above")
        sys.exit(1)


if __name__ == "__main__":
    main()
