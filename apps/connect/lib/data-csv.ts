/**
 * data-csv.ts — the CSV export behind app/data/export/route.ts.
 *
 * The route is a thin wrapper: it passes `getSession`, this does the rest, so the
 * whole thing runs in a unit test with a fake `api`. Same filters as the page
 * (data-query.ts), streamed in chunks so a big export never sits in memory, and
 * capped so one request cannot walk a whole table.
 */

import { findView, selectKeys, type Column, type ViewConfig } from "./data-views";
import { applyFilters, paramsFromUrl, parseParams, type DataApi, type DataParams } from "./data-query";
import { csvCell, csvField } from "./data-format";

export const EXPORT_ROW_CAP = 50_000;
/** PostgREST's default max rows per request. */
export const EXPORT_CHUNK = 1000;

export function truncationNote(cap: number = EXPORT_ROW_CAP): string {
  return `Export truncated at ${cap.toLocaleString("en-US")} rows. Narrow the date range to export the rest.`;
}

export interface ExportSession {
  api: DataApi;
}

export interface ExportOptions {
  /** Signed-in user's session, or null. Injected so tests never touch Next or Supabase. */
  getSession: () => Promise<ExportSession | null>;
  cap?: number;
  chunk?: number;
}

/** Page columns, plus each money column's currency code (kept next to the major-unit amounts). */
export function exportColumns(cfg: ViewConfig): Column[] {
  const cols = [...cfg.columns];
  const have = new Set(cols.map((c) => c.key));
  for (const c of cfg.columns) {
    if (c.currencyKey && !have.has(c.currencyKey)) {
      have.add(c.currencyKey);
      cols.push({ key: c.currencyKey, label: "Currency", type: "text" });
    }
  }
  return cols;
}

function exportFilename(cfg: ViewConfig, p: DataParams): string {
  return `${cfg.source}-${cfg.id}-${p.from ?? "all"}_${p.to ?? "all"}.csv`;
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function handleExport(request: Request, opts: ExportOptions): Promise<Response> {
  const cap = opts.cap ?? EXPORT_ROW_CAP;
  const chunk = opts.chunk ?? EXPORT_CHUNK;

  // 401, never a redirect: this is fetched as a download, and no query runs before this line.
  const session = await opts.getSession();
  if (!session) return text(401, "Sign in to export.");

  const url = new URL(request.url);
  const cfg = findView(url.searchParams.get("source"), url.searchParams.get("view"));
  if (!cfg) return text(404, "Unknown source or view.");
  const params = parseParams(paramsFromUrl(url));
  const cols = exportColumns(cfg);
  const select = selectKeys(cfg).join(",");

  const { api } = session;
  const view = cfg; // narrowed const: the closures below would lose the null check
  const sizeAt = (offset: number) => Math.min(chunk, cap + 1 - offset);

  // Rows [offset, offset+size) in the page's order. The one row past the cap is the "there is more" probe.
  async function fetchChunk(offset: number): Promise<Record<string, unknown>[]> {
    const { data, error } = await applyFilters(api.from(view.view).select(select), view, params).range(
      offset,
      offset + sizeAt(offset) - 1
    );
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // First chunk is fetched before responding so a query failure is a real 502, not a broken 200.
  let first: Record<string, unknown>[];
  try {
    first = await fetchChunk(0);
  } catch {
    return text(502, "Export failed. Try again.");
  }

  const encoder = new TextEncoder();
  async function* lines(): AsyncGenerator<string> {
    yield `${cols.map((c) => csvField(c.label)).join(",")}\r\n`;
    let offset = 0;
    let rows = first;
    for (;;) {
      const room = cap - offset;
      const take = rows.slice(0, room);
      if (take.length) yield take.map((row) => `${cols.map((c) => csvCell(c, row)).join(",")}\r\n`).join("");
      if (rows.length > room) {
        yield `# ${truncationNote(cap)}\r\n`;
        return;
      }
      // Only an empty chunk (or the cap probe above) ends the export: a short chunk can just be
      // PostgREST's max_rows clamping the request below our chunk size.
      if (rows.length === 0) return;
      offset += rows.length;
      rows = await fetchChunk(offset);
    }
  }

  const gen = lines();
  const body = new ReadableStream<Uint8Array>({
    // A throw in the generator rejects pull, which errors the stream: the client sees a failed
    // download instead of a file that looks complete but stops short.
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await gen.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${exportFilename(cfg, params)}`,
      "Cache-Control": "no-store",
    },
  });
}
