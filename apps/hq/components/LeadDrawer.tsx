"use client";

import { useState, type ReactNode } from "react";
import { OUTCOMES, type LeadItem } from "@/lib/leads";
import type { Deliverable } from "@/lib/deliverables";
import { PitchTab } from "./PitchTab";

export type DrawerTab = "details" | "calls" | "pitch";
const TABS: [DrawerTab, string][] = [
  ["details", "Details"],
  ["calls", "Calls"],
  ["pitch", "Pitch"],
];
export const stageChip = (s: string, label: string) => (
  <span className={`chip ${s === "consult_scheduled" || s === "quoting" ? "ok" : s === "reached" ? "acc" : s === "attempted" ? "warn" : ""}`.trim()}>{label}</span>
);

/**
 * The 540px lead drawer (v2-leads variant A + v2-pitch tabs): head, Details / Calls / Pitch. Details has the
 * phone, the facts and Log a call (1-4) before the server-rendered rest; Calls and Details bodies come in as slots.
 */
export function LeadDrawer(props: {
  lead: LeadItem;
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  onClose: () => void;
  onLog: (n: 1 | 2 | 3 | 4, consultLocal?: string) => void;
  pending: boolean;
  msg: string;
  consultOpen: boolean;
  onConsultOpen: (open: boolean) => void;
  rows: Deliverable[];
  pitchError: string;
  details: ReactNode;
  calls: ReactNode;
}) {
  const { lead: l, tab, onTab, onClose, onLog, pending, msg, consultOpen, onConsultOpen, rows, pitchError, details, calls } = props;
  const [local, setLocal] = useState("");
  const [copied, setCopied] = useState(false);
  const where = [l.trade, l.town, l.fit != null ? `fit ${l.fit}` : ""].filter(Boolean).join(" · ");

  return (
    <aside className="lx-drawer" aria-label={`${l.name} details`}>
      <div className="muted">{where}</div>
      <h1>{l.name}</h1>
      <button className="btn x" type="button" onClick={onClose} aria-label="Close">
        ✕ <span className="k">esc</span>
      </button>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => onTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {msg ? (
        <div className="pmsg" role="alert">
          {msg}
        </div>
      ) : null}

      {tab === "details" ? (
        <>
          {l.phone ? (
            <div className="phone">
              <b className="num">{l.phone}</b>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(l.phone).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }, () => {});
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
          <dl>
            <dt>Stage</dt>
            <dd>{stageChip(l.stage, l.stageLabel)}</dd>
            <dt>Owner</dt>
            <dd>
              <span className={`chip ${l.assigned}`.trim()}>{l.assigned}</span>
            </dd>
            {l.town || l.state ? (
              <>
                <dt>Where</dt>
                <dd>{[l.town, l.state].filter(Boolean).join(", ")}</dd>
              </>
            ) : null}
            {l.domain ? (
              <>
                <dt>Website</dt>
                <dd>{l.domain}</dd>
              </>
            ) : null}
            <dt>Last call</dt>
            <dd>{l.last || "—"}</dd>
            <dt>Next contact</dt>
            <dd>{l.next.text || "—"}</dd>
            {l.consult ? (
              <>
                <dt>Consult</dt>
                <dd>{l.consult}</dd>
              </>
            ) : null}
          </dl>
          <h2>Log a call</h2>
          <div className="outs">
            {([1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`btn${n === 4 ? " neg" : ""}`}
                disabled={!l.canLog || pending}
                onClick={() => (n === 3 ? onConsultOpen(true) : onLog(n))}
              >
                <span className="k">{n}</span>
                {OUTCOMES[n].label}
              </button>
            ))}
          </div>
          {!l.canLog ? <p className="fine">Calls are logged on Call due, Attempted and Reached leads.</p> : null}
          {consultOpen && l.canLog ? (
            <form
              className="consultform"
              onSubmit={(e) => {
                e.preventDefault();
                if (local) onLog(3, local);
              }}
            >
              <label>
                Consult time (New York)
                <input
                  type="datetime-local"
                  required
                  autoFocus
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      onConsultOpen(false);
                    }
                  }}
                />
              </label>
              <button className="btn pri" type="submit" disabled={pending}>
                Book
              </button>
              <button className="btn" type="button" onClick={() => onConsultOpen(false)}>
                Cancel
              </button>
            </form>
          ) : null}
          {details}
        </>
      ) : tab === "calls" ? (
        calls
      ) : (
        <PitchTab
          lead={l}
          rows={rows}
          loadError={pitchError}
          onBookConsult={() => {
            onTab("details");
            onConsultOpen(true);
          }}
        />
      )}
    </aside>
  );
}
