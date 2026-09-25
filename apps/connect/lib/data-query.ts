/**
 * data-query.ts — request params -> a filtered `api.*_v1` query, shared by the
 * /data page and the CSV export so both apply exactly the same filters.
 *
 * ACCESS RULE: the only handle in here is the signed-in user's own `api` client.
 * There is deliberately no `client_id` anywhere — not a parameter, not a filter.
 * `security_invoker` views + RLS decide which client's rows come back, and any
 * `client` / `client_id` in the URL is never read.
 */

import type { ApiSchema } from "./session";
import { selectKeys, type ViewConfig } from "./data-views";
import { addDays, parseIsoDate, cleanSearch, searchFilter } from "./data-format";

export const PAGE_SIZE = 50;
export const MAX_PAGE = 100_000;

/** The slice of the PostgREST builder this feature uses; lets tests inject a fake. */
export interface QueryLike {
  eq(column: string, value: string): this;
  is(column: string, value: null): this;
  gte(column: string, value: string): this;
  lte(column: string, value: string): this;
  lt(column: string, value: string): this;
  or(filters: string): this;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this;
  range(from: number, to: number): this;
}

export interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
}

export interface DataApi {
  from(view: string): {
    select(columns: string, options?: { count: "exact" }): QueryLike & PromiseLike<QueryResult>;
  };
}

/** The one place the real supabase-js schema client is narrowed to what this feature needs. */
export function toDataApi(api: ApiSchema): DataApi {
  // The real builder is a structural superset of DataApi; its generics are what won't unify.
  return api as unknown as DataApi;
}

export interface DataParams {
  from: string | null;
  to: string | null;
  q: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Junk in, defaults out. Reads only source-independent keys: never `client` or `client_id`. */
export function parseParams(raw: RawParams): DataParams {
  const page = Number.parseInt(first(raw.page) ?? "", 10);
  return {
    from: parseIsoDate(first(raw.from)),
    to: parseIsoDate(first(raw.to)),
    q: cleanSearch(first(raw.q)),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** First value of a repeated param, like the page's `first()` — so page and CSV agree on `?from=a&from=b`. */
export function paramsFromUrl(url: URL): RawParams {
  const out: RawParams = {};
  for (const [k, v] of url.searchParams) if (!(k in out)) out[k] = v;
  return out;
}

/** Everything a view's filters do. `client_id` is not on this list on purpose. */
export function applyFilters<Q extends QueryLike>(query: Q, cfg: ViewConfig, p: DataParams): Q {
  let q = query.eq("source", cfg.source);
  if (cfg.extra) q = q.eq(cfg.extra.column, cfg.extra.value);
  if (cfg.liveOnly) q = q.is("deleted_at", null);
  if (p.from) q = q.gte(cfg.dateColumn, p.from);
  if (p.to) q = cfg.dateKind === "date" ? q.lte(cfg.dateColumn, p.to) : q.lt(cfg.dateColumn, addDays(p.to, 1));
  const search = searchFilter(p.q, cfg.searchColumns);
  if (search) q = q.or(search);
  // Newest first; nulls last so an empty date never floats to the top. Tie-break keeps pages stable.
  return q.order(cfg.dateColumn, { ascending: false, nullsFirst: false }).order(cfg.tieBreak, { ascending: true });
}

/** One page of rows plus the exact filtered count. */
export async function fetchPage(api: DataApi, cfg: ViewConfig, p: DataParams) {
  const start = (p.page - 1) * PAGE_SIZE;
  const { data, error, count } = await applyFilters(
    api.from(cfg.view).select(selectKeys(cfg).join(","), { count: "exact" }),
    cfg,
    p
  ).range(start, start + PAGE_SIZE - 1);
  return { rows: data ?? [], count: count ?? 0, error: error?.message ?? null, start };
}

/* ------------------------------------------------------------ header stats */

export interface SummaryRow {
  orders?: number | string | null;
  revenue_minor?: number | string | null;
  currency?: string | null;
}

export interface Last30 {
  orders: number;
  /** Revenue per currency: a store that changed currency mid-window is not summed across codes. */
  revenue: { currency: string | null; minor: number }[];
}

/** First day of the "last 30 days" window: today minus 29, i.e. 30 calendar days including today (UTC). */
export function last30Cutoff(now: Date): string {
  return addDays(now.toISOString().slice(0, 10), -29);
}

export function summarizeLast30(rows: readonly SummaryRow[] | null | undefined): Last30 {
  let orders = 0;
  const byCurrency = new Map<string | null, number>();
  for (const row of rows ?? []) {
    const o = Number(row.orders);
    const r = Number(row.revenue_minor);
    if (Number.isFinite(o)) orders += o;
    if (Number.isFinite(r)) byCurrency.set(row.currency ?? null, (byCurrency.get(row.currency ?? null) ?? 0) + r);
  }
  return { orders, revenue: [...byCurrency].map(([currency, minor]) => ({ currency, minor })) };
}

/** A failed read is reported, not zeroed: the page says "Totals unavailable" instead of "0 orders". */
export async function fetchLast30(api: DataApi, now: Date): Promise<{ totals: Last30 | null; error: string | null }> {
  const { data, error } = await api
    .from("daily_summary_v1")
    .select("day,orders,revenue_minor,currency")
    .gte("day", last30Cutoff(now))
    .order("day", { ascending: false });
  if (error) return { totals: null, error: error.message };
  return { totals: summarizeLast30(data as SummaryRow[] | null), error: null };
}

/* -------------------------------------------------------------------- hrefs */

/** A `/data` link carrying only non-default params. Values are URL-encoded by URLSearchParams. */
export function dataHref(
  path: "/data" | "/data/export",
  parts: { source: string; view: string; page?: number; from?: string | null; to?: string | null; q?: string }
): string {
  const sp = new URLSearchParams({ source: parts.source, view: parts.view });
  if (parts.page && parts.page > 1) sp.set("page", String(parts.page));
  if (parts.from) sp.set("from", parts.from);
  if (parts.to) sp.set("to", parts.to);
  if (parts.q) sp.set("q", parts.q);
  return `${path}?${sp.toString()}`;
}
