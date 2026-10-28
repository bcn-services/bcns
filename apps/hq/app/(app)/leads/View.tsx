"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HintBar } from "@/components/HintBar";
import { LeadDrawer, stageChip, type DrawerTab } from "@/components/LeadDrawer";
import type { Deliverable } from "@/lib/deliverables";
import { ownsKeys } from "@/lib/keys";
import type { LeadItem } from "@/lib/leads";
import { logOutcome, reassign } from "./actions";

export interface Col {
  key: string;
  label: string;
  href: string;
  mark?: string;
}
export interface Filters {
  q: string;
  stage: string;
  assigned: string;
  trade: string;
}

/**
 * The Leads page (v2-leads variant A): a full-width 9-column table and a 540px drawer that pushes it
 * (Trade and Consult hide while it is open). Keys: j/k move, enter open, esc close, 1-4 log a call,
 * n note, a reassign. The server page renders the per-lead Details / Calls bodies and hands them in as slots.
 */
export function LeadsView(props: {
  items: LeadItem[];
  cols: Col[];
  filters: Filters;
  stages: { value: string; label: string }[];
  trades: string[];
  sub: string;
  sort: string;
  dir: string;
  details: Record<string, ReactNode>;
  calls: Record<string, ReactNode>;
  rows: Record<string, Deliverable[]>;
}) {
  const { items, cols, filters, stages, trades, sub, sort, dir, details, calls, rows } = props;
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("details");
  const [consultOpen, setConsultOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const focusNote = useRef(false);

  const current = items.find((l) => l.id === sel) ?? null;
  const drawer = open && current ? current : null;
  const h = useRef({ items, current, drawer, tab, pending });
  h.current = { items, current, drawer, tab, pending };

  // a different lead starts on Details with no prompt and no old error
  useEffect(() => {
    setTab("details");
    setConsultOpen(false);
    setMsg("");
  }, [sel]);

  // a thrown action (network, 5xx) becomes the message, not Next's error page
  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    start(async () => {
      try {
        const r = await fn();
        setMsg(r.ok ? "" : r.error);
        if (r.ok) onOk?.();
      } catch {
        setMsg("Could not reach the server. Check the lead before trying again.");
      }
    });
  }

  // the note box belongs to the open lead: only use its text for that lead's outcome
  function noteFor(id: string): string {
    const t = document.getElementById("note");
    const form = t?.closest("form");
    return t instanceof HTMLTextAreaElement && form?.querySelector<HTMLInputElement>("input[name=id]")?.value === id ? t.value : "";
  }

  function log(l: LeadItem, n: 1 | 2 | 3 | 4, consultLocal?: string) {
    const note = noteFor(l.id);
    act(
      () => logOutcome(l.id, n, { consultLocal, note }),
      () => {
        setConsultOpen(false);
        const t = document.getElementById("note");
        if (t instanceof HTMLTextAreaElement) t.value = ""; // the note went into the call
      }
    );
  }
  const logRef = useRef(log);
  logRef.current = log;
  const actRef = useRef(act);
  actRef.current = act;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ownsKeys(e.target as HTMLElement | null, e.key)) return;
      const { items, current, drawer, tab, pending } = h.current;
      const i = current ? items.indexOf(current) : -1;
      if (e.key === "j" || e.key === "k") {
        if (!items.length) return;
        // after a nav click focus sits on the link: blur it so Enter opens the row, not the link
        const a = document.activeElement;
        if (a instanceof HTMLElement && a.closest("a,button,[role=button],summary")) a.blur();
        setSel(items[e.key === "j" ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)]?.id ?? null); // the drawer follows the cursor once open
      } else if (e.key === "Enter" && current) {
        setOpen(true);
      } else if (e.key === "Escape") {
        if (drawer) setOpen(false);
        else setSel(null);
      } else if (drawer && tab === "details" && ["1", "2", "3", "4"].includes(e.key)) {
        if (!drawer.canLog || pending) return;
        if (e.key === "3") setConsultOpen(true);
        else logRef.current(drawer, Number(e.key) as 1 | 2 | 4);
      } else if (drawer && e.key === "n") {
        focusNote.current = true;
        setTab("details");
        document.getElementById("note")?.focus(); // already on Details
      } else if (current && e.key === "a") {
        actRef.current(() => reassign(current.id, current.assigned === "brandon" ? "nate" : "brandon"));
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (focusNote.current && tab === "details") {
      focusNote.current = false;
      document.getElementById("note")?.focus();
    }
  }, [tab]);
  useEffect(() => {
    document.querySelector("tr.f")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function submit(form: HTMLFormElement) {
    const p = new URLSearchParams();
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string" && v) p.set(k, v);
    });
    router.push(`/leads?${p}`);
  }
  const cls = (k: string) => (k === "trade" ? "c-trade" : k === "consult" ? "c-consult" : k === "fit" ? "n" : undefined);

  return (
    <div className="lx">
      <div className={`lx-body${drawer ? " dr" : ""}`}>
        <main className="lx-main">
          <h1>Leads</h1>
          <p className="sub">{sub}</p>
          <form
            className="lx-filters"
            action="/leads"
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget);
            }}
            onChange={(e) => {
              if (e.target instanceof HTMLSelectElement) submit(e.currentTarget);
            }}
          >
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
            <input name="q" defaultValue={filters.q} placeholder="Search business or town" aria-label="Search business or town" />
            <select name="stage" defaultValue={filters.stage} aria-label="Stage">
              {stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select name="assigned" defaultValue={filters.assigned} aria-label="Owner">
              <option value="">Anyone</option>
              <option value="brandon">Brandon</option>
              <option value="nate">Nate</option>
            </select>
            <select name="trade" defaultValue={filters.trade} aria-label="Trade">
              <option value="">Any trade</option>
              {trades.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </form>
          {items.length ? (
            <div className="card">
              <table className="lx-table">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} scope="col" className={cls(c.key)}>
                        <Link href={c.href} scroll={false}>
                          {c.label}
                          {c.mark ? ` ${c.mark}` : ""}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr
                      key={l.id}
                      className={l.id === sel ? "f" : undefined}
                      aria-current={l.id === sel ? "true" : undefined}
                      onClick={() => {
                        setSel(l.id);
                        setOpen(true);
                      }}
                    >
                      <td>
                        <b>{l.name}</b>
                      </td>
                      <td className="c-trade">{l.trade}</td>
                      <td>{l.town}</td>
                      <td>{stageChip(l.stage, l.stageLabel)}</td>
                      <td className="n">
                        <b>{l.fit ?? "—"}</b>
                      </td>
                      <td>
                        <span className={`chip ${l.assigned}`}>{l.assigned}</span>
                      </td>
                      <td>{l.last || "—"}</td>
                      <td>{l.next.today ? <span className="chip warn">today</span> : l.next.text || "—"}</td>
                      <td className="c-consult">{l.consult}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card">
              <div className="empty">No leads match.</div>
            </div>
          )}
        </main>
        {drawer ? (
          <LeadDrawer
            key={drawer.id}
            lead={drawer}
            tab={tab}
            onTab={setTab}
            onClose={() => setOpen(false)}
            onLog={(n, local) => log(drawer, n, local)}
            pending={pending}
            msg={msg}
            consultOpen={consultOpen}
            onConsultOpen={setConsultOpen}
            rows={rows[drawer.id] ?? []}
            details={details[drawer.id]}
            calls={calls[drawer.id]}
          />
        ) : null}
      </div>
      <HintBar
        hints={[
          [["j", "k"], "move"],
          [["enter"], "open"],
          [["1–4"], "log call"],
          [["n"], "note"],
          [["a"], "reassign"],
          [["esc"], "close"],
        ]}
      />
    </div>
  );
}
