import { consultTitle, googleCalendarUrl } from "@/lib/ics";
import {
  OUTCOME_LABEL,
  fitOf,
  fmtET,
  parseResearch,
  stageLabel,
  stageOptions,
  type Extras,
  type Lead,
} from "@/lib/leads";
import { addNote, saveLead } from "@/app/(app)/leads/actions";

const chip = (t: string, c = "") => (
  <span className={`chip ${c}`} key={t}>
    {t}
  </span>
);

/**
 * Detail body for a lead (server-rendered, handed to Board per row): research facts, signals, consult
 * links, call history, notes, links, and the stage / assign / note forms (server actions, via='ui').
 */
export function LeadBody({ lead: l, x }: { lead: Lead; x: Extras | undefined }) {
  const r = parseResearch(l);
  const fit = fitOf(l);
  const facts = Array.isArray(r.facts) ? r.facts.filter((f) => typeof f === "string") : [];
  const signals = Object.entries(r.signals ?? {}).filter(([, v]) => v === true);
  const stages = stageOptions();
  if (!stages.includes(l.stage)) stages.unshift(l.stage); // a lead already in a late stage keeps its label
  return (
    <>
      <div className="chips">
        {chip(stageLabel(l.stage), "stage")}
        {fit != null ? (
          <>
            <span className="fit" title={`Fit ${fit}/100`}>
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={i < Math.round(fit / 10) ? "on" : ""} />
              ))}
            </span>
            <span className="muted">Fit {fit}</span>
          </>
        ) : null}
        {l.deal_value_cents ? chip(`$${(l.deal_value_cents / 100).toLocaleString()}`, "ok") : null}
      </div>
      <p className="sub2">{[l.trade, [l.town, l.state].filter(Boolean).join(", "), l.domain].filter(Boolean).join(" · ")}</p>
      {l.phone ? (
        <div className="phone">
          <span className="num">{l.phone}</span>
        </div>
      ) : null}
      <p className="fine">
        {x?.calls.length ?? 0} call{x?.calls.length === 1 ? "" : "s"}
        {l.next_contact_at ? ` · next ${fmtET(l.next_contact_at)}` : ""}
        {l.waiting_on ? ` · waiting on ${l.waiting_on}` : ""}
      </p>

      {l.consult_at ? (
        <div className="sec">
          <h3>Consult</h3>
          <p>{fmtET(l.consult_at, true)} ET</p>
          <div className="acts">
            <a
              className="btn"
              href={googleCalendarUrl({ title: consultTitle(l.name), start: new Date(l.consult_at) })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Google Calendar
            </a>
            <a className="btn" href={`/api/ics/${l.id}`}>
              Download .ics
            </a>
          </div>
        </div>
      ) : null}

      <div className="sec">
        <h3>Note (n)</h3>
        <form action={addNote}>
          <input type="hidden" name="id" value={l.id} />
          {/* keyed on what it just saved: a new note or call remounts it empty */}
          <textarea key={(x?.notes.length ?? 0) + (x?.calls.length ?? 0)} id="note" name="body" rows={3} placeholder="Note, saved with the outcome if you press 1-4. Esc leaves the field." />
          <div className="acts" style={{ marginTop: 8 }}>
            <button className="btn" type="submit">
              Add note
            </button>
          </div>
        </form>
      </div>

      <div className="sec">
        <h3>Stage and owner</h3>
        <form action={saveLead} className="acts">
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="stage_was" value={l.stage} />
          <input type="hidden" name="assigned_was" value={l.assigned_to} />
          <select name="stage" defaultValue={l.stage} aria-label="Stage">
            {stages.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}
              </option>
            ))}
          </select>
          <select name="assigned_to" defaultValue={l.assigned_to} aria-label="Assigned to">
            <option value="brandon">Brandon</option>
            <option value="nate">Nate</option>
          </select>
          <button className="btn" type="submit">
            Save
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            a flips the owner
          </span>
        </form>
      </div>

      {typeof r.reason === "string" && r.reason ? (
        <div className="sec">
          <h3>Why this lead</h3>
          <p>{r.reason}</p>
        </div>
      ) : null}
      <div className="sec">
        <h3>What we know</h3>
        {facts.length ? (
          <ul>
            {facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing recorded.</p>
        )}
      </div>
      {signals.length ? (
        <div className="sec">
          <h3>Signals</h3>
          <div className="chips">{signals.map(([k]) => chip(k))}</div>
        </div>
      ) : null}
      {x?.links.length ? (
        <div className="sec">
          <h3>Links</h3>
          {x.links
            .filter((k) => k.url?.startsWith("https://"))
            .map((k, i) => (
              <div key={i}>
                <a href={k.url ?? ""} target="_blank" rel="noopener noreferrer">
                  {k.label || k.url}
                </a>
              </div>
            ))}
        </div>
      ) : null}
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
      {x?.notes.length ? (
        <div className="sec">
          <h3>Notes</h3>
          <ul className="hist">
            {x.notes.map((n, i) => (
              <li key={i}>
                <b>{fmtET(n.created_at)}</b> {n.body}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
