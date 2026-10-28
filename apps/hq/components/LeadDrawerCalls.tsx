import { OUTCOME_LABEL, fmtET, type Extras } from "@/lib/leads";

/** The Calls tab: call history and notes for one lead (server-rendered, handed to the drawer). */
export function LeadDrawerCalls({ x }: { x: Extras | undefined }) {
  return (
    <>
      <div className="sec">
        <h3>Call history</h3>
        {x?.calls.length ? (
          <ul className="hist">
            {x.calls.map((c, i) => (
              <li key={i}>
                <b>{fmtET(c.at, true)}</b> · {c.by ?? "?"} · {OUTCOME_LABEL[c.outcome ?? ""] ?? c.outcome}
                {c.note ? <span className="muted"> — {c.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No calls logged yet.</p>
        )}
      </div>
      <div className="sec">
        <h3>Notes</h3>
        {x?.notes.length ? (
          <ul className="hist">
            {x.notes.map((n, i) => (
              <li key={i}>
                <b>{fmtET(n.created_at)}</b> {n.body}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No notes yet.</p>
        )}
      </div>
    </>
  );
}
