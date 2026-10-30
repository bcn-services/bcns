"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createLeadAction } from "@/app/(app)/leads/actions";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "+ New lead": a business typed in by hand (a call, a referral). Esc or the scrim closes it; `onCreated` gets the new id. */
export function NewLeadModal(props: {
  trades: string[];
  stages: { value: string; label: string }[];
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const { trades, stages, onClose, onCreated } = props;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    start(async () => {
      try {
        const r = await createLeadAction({
          name: s("name"),
          trade: s("trade") || null,
          town: s("town") || null,
          state: s("state") || null,
          phone: s("phone") || null,
          domain: s("domain") || null,
          stage: s("stage"),
          assigned_to: s("assigned_to") === "brandon" ? "brandon" : "nate",
          note: s("note") || null,
        });
        if (r.ok) onCreated(r.id, s("name").trim());
        else setMsg(r.error);
      } catch {
        setMsg("Could not reach the server. Check the Leads list before trying again.");
      }
    });
  }

  return (
    <div className="wk-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="wk-modal"
        role="dialog"
        aria-modal="true"
        aria-label="New lead"
        onSubmit={submit}
      >
        <div className="wk-hdr">
          <h2>New lead</h2>
          <button type="button" className="btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          name="name"
          className="wk-title-in"
          placeholder="Business name"
          aria-label="Business name"
          required
          autoFocus
        />
        <div className="wk-g">
          <input name="trade" list="new-lead-trades" placeholder="Trade" aria-label="Trade" />
          <datalist id="new-lead-trades">
            {trades.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <input name="town" placeholder="Town" aria-label="Town" />
          <input name="state" placeholder="State" aria-label="State" />
          <input name="phone" type="tel" placeholder="Phone" aria-label="Phone" />
          <input name="domain" placeholder="Website" aria-label="Website" />
          <select name="stage" aria-label="Stage" defaultValue="reached">
            {stages.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="assigned_to" aria-label="Owner" defaultValue="nate">
            {["nate", "brandon"].map((o) => (
              <option key={o} value={o}>
                {cap(o)}
              </option>
            ))}
          </select>
        </div>
        <textarea name="note" placeholder="Note (optional)" aria-label="Note" />
        {msg ? (
          <p className="note err" role="alert">
            {msg}
          </p>
        ) : null}
        <div className="wk-acts end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            Create lead
          </button>
        </div>
      </form>
    </div>
  );
}
