import type { ReactNode } from "react";
import type { Row } from "./Board";
import { OUTCOMES } from "@/lib/leads";

/** Right-hand pane: the selected row's title and sub-line, then whatever body the page supplied. */
export function Detail({
  row,
  body,
  idle,
  onOutcome,
}: {
  row: Row | null;
  body?: ReactNode;
  idle?: ReactNode;
  onOutcome?: (n: 1 | 2 | 3 | 4, row: Row) => void;
}) {
  if (!row)
    return (
      <div className="dwrap">
        {idle ?? <p className="hint">Press j or click a row to open it here.</p>}
      </div>
    );
  return (
    <div className="dwrap">
      <h1>{row.title}</h1>
      {row.meta ? <p className="sub2">{row.meta}</p> : null}
      {row.canLog && onOutcome ? (
        <div className="sec">
          <h3>Log outcome</h3>
          <div className="outs">
            {([1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`btn${n === 4 ? " neg" : ""}`}
                onClick={() => onOutcome(n, row)}
              >
                <b className="k">{n}</b> {OUTCOMES[n].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {body}
    </div>
  );
}
