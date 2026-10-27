"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ownsKeys } from "@/lib/keys";
import { Detail } from "./Detail";

export interface Row {
  key: string;
  title: string;
  meta?: string;
  right?: string;
}
export interface Section {
  id: string;
  title: string;
  rows: Row[];
  /** Count badge in the accent colour (things waiting on a human). */
  hot?: boolean;
  sub?: string;
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
}) {
  const { head, sections, details, idle, emptyText, onOpen, onLeave, onOutcome } = props;
  const rows = sections.flatMap((s) => s.rows);
  const [sel, setSel] = useState<string | null>(null);
  const current = rows.find((r) => r.key === sel) ?? null;
  const detailRef = useRef<HTMLElement>(null);
  const handlers = useRef({ rows, current, onOpen, onLeave, onOutcome });
  handlers.current = { rows, current, onOpen, onLeave, onOutcome };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ownsKeys(e.target as HTMLElement | null)) return;
      const { rows, current, onOpen, onLeave, onOutcome } = handlers.current;
      const i = current ? rows.indexOf(current) : -1;
      if (e.key === "j" || e.key === "k") {
        if (!rows.length) return;
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
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
                </div>
                <div className="card">
                  {s.rows.length ? (
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
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty">{emptyText ?? "Nothing here."}</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>
        <main className="detail" aria-label="Details" tabIndex={-1} ref={detailRef}>
          <Detail row={current} body={current ? details?.[current.key] : null} idle={idle} />
        </main>
      </div>
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
      </footer>
    </>
  );
}
