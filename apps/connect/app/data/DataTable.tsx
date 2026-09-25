import { formatCell, detailsText, safeHref } from "@/lib/data-format";
import type { ViewConfig } from "@/lib/data-views";

/** Right-align numbers so digits line up. */
const NUMERIC = new Set(["money", "number", "bytes"]);

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The one table every view renders through. Columns and labels come from lib/data-views.ts.
 * The wrapper scrolls sideways on its own (keyboard-focusable) so a wide table never widens the page.
 */
export function DataTable({ cfg, rows }: { cfg: ViewConfig; rows: Record<string, unknown>[] }) {
  return (
    <div
      role="region"
      aria-label={`${cfg.label} table`}
      tabIndex={0}
      className={`overflow-x-auto rounded-xl border border-border bg-card ${FOCUS}`}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{cfg.label}</caption>
        <thead className="bg-muted text-left text-muted-foreground">
          <tr>
            {cfg.columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2 font-medium ${NUMERIC.has(col.type) ? "text-right" : ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${String(row[cfg.tieBreak] ?? "")}-${i}`} className="border-t border-border align-top hover:bg-muted/50">
              {cfg.columns.map((col) => (
                <td key={col.key} className={`px-4 py-2 ${NUMERIC.has(col.type) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  <Cell col={col} row={row} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ col, row }: { col: ViewConfig["columns"][number]; row: Record<string, unknown> }) {
  if (col.type === "link") {
    const href = safeHref(row[col.key]);
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`rounded-sm text-primary underline underline-offset-4 ${FOCUS}`}
      >
        Open<span className="sr-only"> {col.label} (new tab)</span>
      </a>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (col.type === "details") {
    const text = detailsText(row[col.key]);
    return text ? (
      <details>
        <summary className={`cursor-pointer rounded-sm text-primary ${FOCUS}`}>
          Show details<span className="sr-only"> for {col.label}</span>
        </summary>
        <pre className="mt-2 max-h-64 max-w-md overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{text}</pre>
      </details>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  const text = formatCell(col, row);
  return text ? <>{text}</> : <span className="text-muted-foreground">—</span>;
}
