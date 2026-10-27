import type { ReactNode } from "react";
import type { Row } from "./Board";

/** Right-hand pane: the selected row's title and sub-line, then whatever body the page supplied. */
export function Detail({
  row,
  body,
  idle,
}: {
  row: Row | null;
  body?: ReactNode;
  idle?: ReactNode;
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
      {body}
    </div>
  );
}
