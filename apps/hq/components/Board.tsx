"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ownsKeys } from "@/lib/keys";
import { OUTCOMES } from "@/lib/leads";
import { Detail } from "./Detail";

export interface Row {
  key: string;
  title: string;
  meta?: string;
  right?: string;
  /** A lead where a call can be logged: shows the 1-4 outcome buttons / select. */
  canLog?: boolean;
  /** Lead's current owner, for the `a` key. */
  assigned?: string;
  /** Grid sections: one cell per column (the first is the title). */
  cells?: ReactNode[];
}
export interface Section {
  id: string;
  title: string;
  rows: Row[];
  /** Count badge in the accent colour (things waiting on a human). */
  hot?: boolean;
  sub?: string;
  /** Renders the section as a table; header links carry the sort (server-rendered from the URL). */
  columns?: { label: string; href?: string; mark?: string }[];
  /** "show all" style link after the count. */
  more?: { href: string; label: string };
}

/**
 * Sections -> rows -> detail pane, driven from the keyboard:
 * j/k move, enter opens, esc leaves, 1-4 pick an outcome for the focused row.
 * Nothing here knows about leads: pages hand in sections, per-row detail bodies
 * and callbacks (server actions or client functions).
 */
export function Board(props: {
  head: ReactNode;
  sections: Section[];
  /** Detail body per row key. */
  details?: Record<string, ReactNode>;
  /** Detail pane content when nothing is selected. */
  idle?: ReactNode;
  emptyText?: string;
  onOpen?: (row: Row) => void;
  onLeave?: () => void;
  onOutcome?: (n: 1 | 2 | 3 | 4, row: Row) => void;
  /** Any other key on the selected row (n, a ...); return true when handled. */
  onKey?: (key: string, row: Row) => boolean;
  /** Pinned above the key hints (e.g. the consult-time prompt). */
  bar?: ReactNode;
  /** Extra key hints in the footer. */
  hints?: ReactNode;
}) {
  const { head, sections, details, idle, emptyText, onOpen, onLeave, onOutcome, onKey, bar, hints } = props;
  const rows = sections.flatMap((s) => s.rows);
  const [sel, setSel] = useState<string | null>(null);
  const current = rows.find((r) => r.key === sel) ?? null;
  const detailRef = useRef<HTMLElement>(null);
  const handlers = useRef({ rows, current, onOpen, onLeave, onOutcome, onKey });
  handlers.current = { rows, current, onOpen, onLeave, onOutcome, onKey };
  const lastIdx = useRef(0);
  if (current) lastIdx.current = rows.indexOf(current);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ownsKeys(e.target as HTMLElement | null, e.key)) return;
      const { rows, current, onOpen, onLeave, onOutcome, onKey } = handlers.current;
      const i = current ? rows.indexOf(current) : -1;
      if (e.key === "j" || e.key === "k") {
        if (!rows.length) return;
        // after a nav click focus sits on the link: blur it so Enter opens the row, not the link
        const a = document.activeElement;
        if (a instanceof HTMLElement && a.closest("a,button,[role=button],summary")) a.blur();
        const next = e.key === "j" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0);
        setSel(rows[next]?.key ?? null);
      } else if (e.key === "Enter" && current) {
        onOpen?.(current);
        detailRef.current?.focus();
      } else if (e.key === "Escape") {
        setSel(null);
        onLeave?.();
      } else if (current && ["1", "2", "3", "4"].includes(e.key)) {
        onOutcome?.(Number(e.key) as 1 | 2 | 3 | 4, current);
      } else if (current && onKey?.(e.key, current)) {
        // handled by the page
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the selected row left the list (an outcome moved it): land on the one that took its place
  useEffect(() => {
    if (sel && !rows.some((r) => r.key === sel)) setSel(rows[Math.min(lastIdx.current, rows.length - 1)]?.key ?? null);
  }, [rows, sel]);

  useEffect(() => {
    document.querySelector(".row.f")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <>
      <div className="cols">
        <section className="lst" aria-label="Queue">
          <div className="lpad">
            {head}
            {sections.map((s) => (
              <section className="sx" key={s.id}>
                <div className="sh">
                  <h2>{s.title}</h2>
                  <span className={`cnt${s.hot && s.rows.length ? " hot" : ""}`}>
                    {s.rows.length}
                  </span>
                  {s.sub ? <span className="sub">{s.sub}</span> : null}
                  {s.more ? (
                    <Link className="more lnkb" href={s.more.href} scroll={false}>
                      {s.more.label}
                    </Link>
                  ) : null}
                </div>
                <div className="card">
                  {!s.rows.length ? (
                    <div className="empty">{emptyText ?? "Nothing here."}</div>
                  ) : s.columns ? (
                    <table className="grid">
                      <thead>
                        <tr>
                          {s.columns.map((c) => (
                            <th key={c.label} scope="col">
                              {c.href ? (
                                <Link href={c.href} scroll={false}>
                                  {c.label}
                                  {c.mark ? ` ${c.mark}` : ""}
                                </Link>
                              ) : (
                                c.label
                              )}
                            </th>
                          ))}
                          <th scope="col">Log</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map((r) => (
                          <tr
                            key={r.key}
                            className={`row${r.key === sel ? " f" : ""}`}
                            onClick={() => setSel(r.key)}
                            aria-current={r.key === sel ? "true" : undefined}
                          >
                            {(r.cells ?? [r.title]).map((c, i) => (
                              <td key={i} className={i === 0 ? "rt" : undefined}>
                                {c}
                              </td>
                            ))}
                            <td>
                              {r.canLog && onOutcome ? (
                                <select
                                  aria-label={`Log outcome for ${r.title}`}
                                  value=""
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    if (n) onOutcome(n as 1 | 2 | 3 | 4, r);
                                  }}
                                >
                                  <option value="">Log...</option>
                                  {([1, 2, 3, 4] as const).map((n) => (
                                    <option key={n} value={n}>
                                      {n} {OUTCOMES[n].label}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    s.rows.map((r) => (
                      <div
                        key={r.key}
                        className={`row${r.key === sel ? " f" : ""}`}
                        onClick={() => setSel(r.key)}
                        aria-current={r.key === sel ? "true" : undefined}
                      >
                        <div className="rb">
                          <div className="r1">
                            <span className="rt">{r.title}</span>
                            {r.right ? <span className="rm">{r.right}</span> : null}
                          </div>
                          {r.meta ? <div className="r2">{r.meta}</div> : null}
                          {r.canLog && onOutcome ? (
                            <div className="r3 fo">
                              {([1, 2, 3, 4] as const).map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  className={`btn sm${n === 4 ? " neg" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOutcome(n, r);
                                  }}
                                >
                                  <b className="k">{n}</b> {OUTCOMES[n].label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>
        <main className="detail" aria-label="Details" tabIndex={-1} ref={detailRef}>
          <Detail
            row={current}
            body={current ? details?.[current.key] : null}
            idle={idle}
            onOutcome={onOutcome}
          />
        </main>
      </div>
      {bar}
      <footer className="keys">
        <span>
          <b className="k">j</b>
          <b className="k">k</b> move
        </span>
        <span>
          <b className="k">enter</b> open
        </span>
        <span>
          <b className="k">1–4</b> outcome
        </span>
        <span>
          <b className="k">esc</b> leave
        </span>
        {hints}
      </footer>
    </>
  );
}
