"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requestPitchStep } from "@/app/(app)/leads/actions";
import {
  PROTOS,
  consultBooked,
  fileHref,
  leadSlug,
  pathExt,
  pathFor,
  pitchState,
  withPrint,
  type Deliverable,
  type Proto,
  type Step,
} from "@/lib/deliverables";
import { consultTitle, googleCalendarUrl } from "@/lib/ics";
import { fmtET, type LeadItem } from "@/lib/leads";

const POLL_MS = 5000; // the job ticks every minute; refresh while a row is queued or running

/** "Prototype A" etc. The names the /demo skill gives them live in the files, not in the row. */
const protoName = (p: Proto) => `Prototype ${p.toUpperCase()}`;

/** Row status -> the chip beside a step. */
function StatusChip({ row }: { row: Deliverable | undefined }) {
  if (!row) return null;
  const cls = { queued: "", running: "acc", done: "ok", failed: "bad" }[row.status];
  return <span className={`chip ${cls}`.trim()}>{row.status[0]!.toUpperCase() + row.status.slice(1)}</span>;
}

/**
 * Opens the deck in a print stylesheet and calls window.print(): the HTML (model-written) is fetched here
 * and loaded into a hidden sandboxed iframe (scripts + modals only, no allow-same-origin), so it stays an
 * opaque origin that cannot read HQ's cookies; withPrint() adds the print CSS and the print() call.
 */
async function printDeck(href: string): Promise<void> {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok) throw new Error("deck not found");
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts allow-modals");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;left:-9999px;top:0;width:1100px;height:800px;border:0";
  f.srcdoc = withPrint(await res.text());
  const done = () => {
    removeEventListener("message", onMsg);
    f.remove();
  };
  const onMsg = (e: MessageEvent) => {
    if (e.source === f.contentWindow && e.data === "hq-print-done") done();
  };
  addEventListener("message", onMsg);
  setTimeout(done, 120_000);
  document.body.append(f);
}

function Files({
  rows,
  dir,
}: {
  rows: { label: string; view: string | null; pdf?: { href: string; print: boolean } | null }[];
  dir: string;
}) {
  const [err, setErr] = useState("");
  return (
    <>
      {rows.map((f) => (
        <div className="file" key={f.label}>
          <b>{f.label}</b>
          {f.view ? (
            <a className="btn" href={fileHref(f.view)} target="_blank" rel="noopener noreferrer">
              View ↗
            </a>
          ) : (
            <span className="muted">not recorded</span>
          )}
          {f.pdf ? (
            f.pdf.print ? (
              <button
                className="btn"
                type="button"
                onClick={() => printDeck(f.pdf!.href).catch(() => setErr("Could not open the file to print."))}
              >
                PDF ↓
              </button>
            ) : (
              <a className="btn" href={f.pdf.href} target="_blank" rel="noopener noreferrer">
                PDF ↓
              </a>
            )
          ) : null}
        </div>
      ))}
      {err ? <div className="pmsg">{err}</div> : null}
      <div className="path">saved to os · {dir}</div>
    </>
  );
}

const Run = ({ children }: { children: ReactNode }) => (
  <div className="run">
    <span className="spin" />
    {children}
  </div>
);

/**
 * The Pitch tab: call went well -> 3 prototypes -> pick + feedback -> final deck -> consult booked -> quote.
 * Each button inserts one `deliverables` row (requestPitchStep); what shows is read back from the rows.
 */
export function PitchTab({
  lead,
  rows,
  onBookConsult,
}: {
  lead: LeadItem;
  rows: Deliverable[];
  /** "Consult booked": opens the consult-time prompt of Log a call. */
  onBookConsult: () => void;
}) {
  const router = useRouter();
  const st = pitchState(rows, { stage: lead.stage, consult_at: lead.consultIso });
  const slug = leadSlug({ os_slug: lead.slug }) ?? "";
  const [pick, setPick] = useState<Proto>(st.picked ?? "a");
  const [fb, setFb] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!st.busy) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [st.busy, router]);

  function go(step: Step, extra: { pick?: Proto; feedback?: string } = {}) {
    start(async () => {
      try {
        const r = await requestPitchStep(lead.id, step, extra);
        setMsg(r.ok ? "" : r.error);
      } catch {
        setMsg("Could not reach the server. Check the lead before trying again.");
      }
    });
  }
  const btn = (label: string, step: Step, pri = false, extra: { pick?: Proto; feedback?: string } = {}) => (
    <button className={`btn${pri ? " pri" : ""}`} type="button" disabled={pending || !st.can[step]} onClick={() => go(step, extra)}>
      {label}
    </button>
  );
  const failed = (r: Deliverable | undefined) =>
    r?.status === "failed" ? <div className="perr">Failed: {r.error || "no reason recorded"}</div> : null;

  const { protos, deck, quote } = st;
  const good = !!protos && protos.status !== "failed";
  const review = protos?.status === "done" && (!deck || deck.status === "failed");
  const consulted = consultBooked({ stage: lead.stage, consult_at: lead.consultIso });
  const cls = (done: boolean, cur: boolean) => (done ? "done" : cur ? "cur" : "off");
  const deckHref = (file: string) => {
    const p = pathFor(slug, deck, file, "demo");
    return p && slug ? p : null;
  };
  const deckHtml = deckHref("demo.html");
  const quoteHtml = pathExt(slug, quote, ".html");
  const quotePdf = pathExt(slug, quote, ".pdf");

  return (
    <div className="pitch">
      {msg ? (
        <div className="pmsg" role="alert">
          {msg}
        </div>
      ) : null}

      <div className={`step ${cls(good, !good)}`}>
        <h3>
          <span className="n">{good ? "✓" : 1}</span>Call went well
        </h3>
        {good ? (
          <div className="muted">Marked good · {fmtET(protos!.created_at, true)} ET</div>
        ) : (
          <>
            <div className="muted">{lead.stageLabel} · wants to see something</div>
            <div className="sact">{btn("✓ Good call → make pitch prototypes", "prototypes", true)}</div>
          </>
        )}
      </div>

      <div className={`step ${cls(deck?.status === "done" || deck?.status === "queued" || deck?.status === "running", good)}`}>
        <h3>
          <span className="n">{deck && deck.status !== "failed" ? "✓" : 2}</span>Pitch prototypes
          <StatusChip row={protos} />
        </h3>
        {!protos ? (
          <div className="muted">After a good call</div>
        ) : protos.status === "queued" || protos.status === "running" ? (
          <Run>Claude is building 3 prototypes from their site and reviews · ~4 min · you can close this</Run>
        ) : protos.status === "failed" ? (
          failed(protos)
        ) : (
          <>
            <div className="protos">
              {PROTOS.map((p) => {
                const path = slug ? pathFor(slug, protos, `demo-${p}.html`, "demo") : null;
                return (
                  <div
                    key={p}
                    className={`pc${p === (st.picked ?? pick) ? " pick" : ""}`}
                    onClick={() => review && setPick(p)}
                  >
                    <div className="th">{protoName(p).toLowerCase()}</div>
                    <div className="ft">
                      <span>{protoName(p)}</span>
                      {path ? (
                        <a
                          className="btn"
                          href={fileHref(path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="opens in a new tab"
                          aria-label={`Open ${protoName(p)} in a new tab`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {review ? (
              <>
                {failed(deck)}
                <textarea
                  placeholder="Feedback for the final deck: what to keep, cut, change…"
                  aria-label="Feedback for the final deck"
                  maxLength={2000}
                  value={fb}
                  onChange={(e) => setFb(e.target.value)}
                />
                <div className="sact">
                  {btn(`Make final deck from #${PROTOS.indexOf(pick) + 1}`, "deck", true, { pick, feedback: fb })}
                  {btn("Redo prototypes with feedback", "redo", false, { feedback: fb })}
                </div>
              </>
            ) : st.picked ? (
              <div className="muted pnote">Picked #{PROTOS.indexOf(st.picked) + 1} · feedback sent</div>
            ) : null}
          </>
        )}
      </div>

      <div className={`step ${cls(deck?.status === "done", !!deck && deck.status !== "done")}`}>
        <h3>
          <span className="n">{deck?.status === "done" ? "✓" : 3}</span>Final pitch deck
          <StatusChip row={deck} />
        </h3>
        {!deck || deck.status === "failed" ? (
          <div className="muted">After you review the prototypes</div>
        ) : deck.status !== "done" ? (
          <Run>Claude is building the deck + video guide · ~3 min</Run>
        ) : (
          <>
            <Files
              dir={`clients/${slug}/demo/`}
              rows={[
                {
                  label: "Pitch deck",
                  view: deckHtml,
                  pdf: deckHtml ? { href: fileHref(deckHtml), print: true } : null,
                },
                { label: "Video guide", view: deckHref("video-guide.md") },
              ]}
            />
            {!consulted ? (
              <div className="sact">
                <button className="btn" type="button" onClick={onBookConsult}>
                  Consult booked →
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className={`step ${cls(quote?.status === "done", deck?.status === "done")}`}>
        <h3>
          <span className="n">{quote?.status === "done" ? "✓" : 4}</span>Quote
          <StatusChip row={quote} />
        </h3>
        {quote && quote.status !== "failed" ? (
          quote.status === "done" ? (
            <Files
              dir={`clients/${slug}/quote/`}
              rows={[
                {
                  label: "Quote",
                  view: quoteHtml ?? pathExt(slug, quote, ".md"),
                  pdf: quotePdf
                    ? { href: fileHref(quotePdf), print: false }
                    : quoteHtml
                      ? { href: fileHref(quoteHtml), print: true }
                      : null,
                },
              ]}
            />
          ) : (
            <Run>Claude is drafting the quote · ~3 min</Run>
          )
        ) : consulted && deck?.status === "done" ? (
          <>
            {failed(quote)}
            {lead.consultIso ? (
              <div className="muted">
                Consult {fmtET(lead.consultIso, true)} ET ·{" "}
                <a
                  href={googleCalendarUrl({ title: consultTitle(lead.name), start: new Date(lead.consultIso) })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Google Calendar
                </a>
              </div>
            ) : null}
            <div className="sact">{btn("✓ Consult went well → draft quote", "quote", true)}</div>
          </>
        ) : (
          <div className="muted">After a good consult</div>
        )}
      </div>
    </div>
  );
}
