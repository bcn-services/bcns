import { formatCell, detailsText, safeHref } from "@/lib/data-format";
import type { ViewConfig } from "@/lib/data-views";

/** Right-align numbers so digits line up. */
const NUMERIC = new Set(["money", "number", "bytes"]);

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
      className="tablewrap"
    >
      <table>
        <caption className="sr-only">{cfg.label}</caption>
        <thead>
          <tr>
            {cfg.columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={NUMERIC.has(col.type) ? "r" : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${String(row[cfg.tieBreak] ?? "")}-${i}`}>
              {cfg.columns.map((col) => (
                <td key={col.key} className={NUMERIC.has(col.type) ? "r" : undefined}>
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
      <a href={href} target="_blank" rel="noopener noreferrer" className="ul">
        Open<span className="sr-only"> {col.label} (new tab)</span>
      </a>
    ) : (
      <span className="mu">—</span>
    );
  }
  if (col.type === "details") {
    const text = detailsText(row[col.key]);
    return text ? (
      <details>
        <summary>
          Show details<span className="sr-only"> for {col.label}</span>
        </summary>
        <pre>{text}</pre>
      </details>
    ) : (
      <span className="mu">—</span>
    );
  }
  const text = formatCell(col, row);
  return text ? <>{text}</> : <span className="mu">—</span>;
}
