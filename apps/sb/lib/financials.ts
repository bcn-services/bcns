/**
 * financials.ts — the pure logic behind the home Financial Information panel
 * and the /financials page: manual-entry validation, records_v1 shaping, the
 * daily merge of Shopify / Meta / manual figures, and the profit identity
 * DESIGN.md fixes as
 *
 *     profit = revenue + manual income − ad spend − manual expenses
 *
 * Everything here is pure except `financialRecordsQuery`, which only builds a
 * PostgREST query (the caller awaits it). Covered by tests/financials.test.mjs.
 */

import type { DataClient } from "@bcn-services/data-client";
import { isValidYmd, pctDeltaOrNull } from "./overview";

export const FINANCIAL_ENTRY_KIND = "financial_entry";
export const FINANCIAL_ENTRY_SOURCE = "dashboard";

/** Manual entries are hand-typed; a client with a decade of them still fits.
 *  ponytail: one page of rows, no cursor — add paging if a range ever exceeds
 *  this many entries. */
export const ENTRY_ROW_LIMIT = 500;

export const MAX_CATEGORY_CHARS = 64;
export const MAX_NOTE_CHARS = 500;
/** Largest accepted amount in major units (DESIGN.md), i.e. 1e11 cents. */
export const MAX_AMOUNT_MAJOR = 1_000_000_000;

export type EntryType = "income" | "expense";

/* ------------------------------------------------------------------ *
 * Validation — the server-side gate. The form's own attributes are only
 * convenience; every rule below is re-checked before any RPC is issued.
 * ------------------------------------------------------------------ */

export type EntryErrorCode = "date" | "type" | "category" | "amount" | "note" | "missing" | "save" | "delete";

const ERROR_MESSAGES: Record<EntryErrorCode, string> = {
  date: "Pick a valid date (YYYY-MM-DD).",
  type: "Choose either Income or Expense.",
  category: `Category is required and must be ${MAX_CATEGORY_CHARS} characters or fewer.`,
  amount: `Amount must be a positive number with at most 2 decimals, up to ${MAX_AMOUNT_MAJOR.toLocaleString("en-US")}.`,
  note: `Note must be ${MAX_NOTE_CHARS} characters or fewer.`,
  missing: "That entry could not be found.",
  save: "Could not save the entry. Please try again.",
  delete: "Could not delete the entry. Please try again.",
};

/** Message for an `?error=` code. Unknown codes render nothing, so a crafted
 *  query string cannot put arbitrary text on the page. */
export function entryErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code as EntryErrorCode] ?? null;
}

/** Positive decimal with at most 2 places -> integer cents. null when the
 *  string is not exactly that (empty, signed, 3+ decimals, exponent, NaN,
 *  zero, or over the cap). Parsed digit-wise so no float rounding is involved. */
export function parseAmountToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const major = Number(m[1]);
  const cents = major * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  if (cents > MAX_AMOUNT_MAJOR * 100) return null;
  return cents;
}

export interface EntryDraft {
  date: string;
  type: EntryType;
  category: string;
  amountCents: number;
  note: string | null;
}

export type EntryParseResult = { ok: true; value: EntryDraft } | { ok: false; code: EntryErrorCode };

/** The whole server-side gate for a manual entry. Field order is the form's,
 *  so the first thing a user sees flagged is the first thing they typed. */
export function parseEntryInput(input: {
  date?: unknown;
  type?: unknown;
  category?: unknown;
  amount?: unknown;
  note?: unknown;
}): EntryParseResult {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!isValidYmd(date)) return { ok: false, code: "date" };

  const type = typeof input.type === "string" ? input.type.trim() : "";
  if (type !== "income" && type !== "expense") return { ok: false, code: "type" };

  const category = typeof input.category === "string" ? input.category.trim() : "";
  if (category.length < 1 || category.length > MAX_CATEGORY_CHARS) return { ok: false, code: "category" };

  const amountCents = parseAmountToCents(typeof input.amount === "string" ? input.amount : "");
  if (amountCents === null) return { ok: false, code: "amount" };

  const noteRaw = typeof input.note === "string" ? input.note.trim() : "";
  if (noteRaw.length > MAX_NOTE_CHARS) return { ok: false, code: "note" };

  return { ok: true, value: { date, type, category, amountCents, note: noteRaw || null } };
}

/** The exact `save_record` attributes DESIGN.md specifies. */
export function entryAttributes(draft: EntryDraft) {
  return {
    date: draft.date,
    type: draft.type,
    category: draft.category,
    amount_cents: draft.amountCents,
    note: draft.note,
  };
}

/* ------------------------------------------------------------------ *
 * records_v1 -> entries
 * ------------------------------------------------------------------ */

export interface RecordLike {
  id?: string | null;
  kind?: string | null;
  source?: string | null;
  external_id?: string | null;
  title?: string | null;
  body?: string | null;
  attributes?: unknown;
  occurred_at?: string | null;
  updated_at?: string | null;
}

export interface FinancialEntry {
  id: string;
  date: string;
  type: EntryType;
  category: string;
  amountCents: number;
  note: string | null;
  updatedAt: string | null;
}

function attr(row: RecordLike): Record<string, unknown> {
  return row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
    ? (row.attributes as Record<string, unknown>)
    : {};
}

/** One records_v1 row -> an entry, or null when it is not a well-formed
 *  dashboard financial entry. Rows are platform data, so nothing here trusts
 *  a field's presence or type. */
export function toFinancialEntry(row: RecordLike): FinancialEntry | null {
  if (!row.id || row.kind !== FINANCIAL_ENTRY_KIND) return null;
  const a = attr(row);
  // No occurred_at fallback: financialRecordsQuery filters on attributes->>date,
  // so a row without one never reaches here.
  const date = typeof a.date === "string" ? a.date : "";
  if (!isValidYmd(date)) return null;
  const type = a.type === "income" || a.type === "expense" ? a.type : null;
  if (!type) return null;
  // Another save_record caller (an agent tool) could write a financial_entry
  // that never passed the form's rules, so re-apply them here.
  const amountCents = Number(a.amount_cents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_MAJOR * 100) return null;
  const category = typeof a.category === "string" && a.category.trim() ? a.category.trim() : (row.title ?? "Uncategorised");
  return {
    id: row.id,
    date,
    type,
    category,
    amountCents,
    note: typeof a.note === "string" && a.note.trim() ? a.note.trim() : null,
    updatedAt: row.updated_at ?? null,
  };
}

/** Entries inside [from, to] (inclusive, on the entry's own `date`), newest
 *  first, ties broken by last write then id so the order is stable. */
export function shapeEntries(rows: RecordLike[], from: string, to: string): FinancialEntry[] {
  return rows
    .map(toFinancialEntry)
    .filter((e): e is FinancialEntry => e !== null && e.date >= from && e.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.id.localeCompare(b.id));
}

export interface EntryTotals {
  incomeMinor: number;
  expensesMinor: number;
  count: number;
}

export function sumEntries(entries: FinancialEntry[]): EntryTotals {
  let incomeMinor = 0;
  let expensesMinor = 0;
  for (const e of entries) {
    if (e.type === "income") incomeMinor += e.amountCents;
    else expensesMinor += e.amountCents;
  }
  return { incomeMinor, expensesMinor, count: entries.length };
}

/* ------------------------------------------------------------------ *
 * Totals, tiles and the daily table
 * ------------------------------------------------------------------ */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of the present components; null only when every one is absent. A
 *  missing Shopify connection must not turn into a fake $0 line. */
function sumPresent(...parts: (number | null | undefined)[]): number | null {
  let total = 0;
  let any = false;
  for (const p of parts) {
    if (typeof p === "number" && Number.isFinite(p)) {
      total += p;
      any = true;
    }
  }
  return any ? total : null;
}

function neg(v: number | null): number | null {
  return v === null ? null : -v;
}

/** DESIGN.md: profit = revenue + manual income − ad spend − manual expenses. */
export function computeProfit(
  revenueMinor: number | null | undefined,
  manualIncomeMinor: number | null | undefined,
  adSpendMinor: number | null | undefined,
  manualExpensesMinor: number | null | undefined,
): number | null {
  return sumPresent(revenueMinor ?? null, manualIncomeMinor ?? null, neg(adSpendMinor ?? null), neg(manualExpensesMinor ?? null));
}

export interface SummaryRowLike {
  day?: string | null;
  revenue_minor?: unknown;
  orders?: unknown;
  currency?: unknown;
}

export interface SpendRowLike {
  day?: string | null;
  spend_minor?: unknown;
  currency?: unknown;
}

export interface FinancialTotals {
  revenueMinor: number | null;
  orders: number | null;
  aovMinor: number | null;
  adSpendMinor: number | null;
  manualIncomeMinor: number | null;
  manualExpensesMinor: number | null;
  profitMinor: number | null;
}

/** Period totals for the seven tiles. A source with no rows in the period
 *  stays null (renders "—"); manual figures are null only when the period has
 *  no entries at all, since the dashboard always knows that answer. */
export function computeFinancialTotals(
  summaryRows: SummaryRowLike[],
  spendRows: SpendRowLike[],
  entries: FinancialEntry[],
): FinancialTotals {
  const revenueMinor = summaryRows.length ? summaryRows.reduce((a, r) => a + num(r.revenue_minor), 0) : null;
  const orders = summaryRows.length ? summaryRows.reduce((a, r) => a + num(r.orders), 0) : null;
  const adSpendMinor = spendRows.length ? spendRows.reduce((a, r) => a + num(r.spend_minor), 0) : null;
  const totals = sumEntries(entries);
  const manualIncomeMinor = totals.count ? totals.incomeMinor : null;
  const manualExpensesMinor = totals.count ? totals.expensesMinor : null;
  return {
    revenueMinor,
    orders,
    aovMinor: revenueMinor !== null && orders ? revenueMinor / orders : null,
    adSpendMinor,
    manualIncomeMinor,
    manualExpensesMinor,
    profitMinor: computeProfit(revenueMinor, manualIncomeMinor, adSpendMinor, manualExpensesMinor),
  };
}

export type FinancialTileKey = "revenue" | "orders" | "aov" | "adSpend" | "manualIncome" | "manualExpenses" | "profit";

export interface FinancialTile {
  key: FinancialTileKey;
  label: string;
  /** Which connector the figure comes from — drives the not-connected state. */
  origin: "shopify" | "meta" | "manual" | "mixed";
  format: "money" | "count";
  value: number | null;
  deltaPct: number | null;
}

const TILE_SPECS: {
  key: FinancialTileKey;
  label: string;
  origin: FinancialTile["origin"];
  format: FinancialTile["format"];
  pick: (t: FinancialTotals) => number | null;
}[] = [
  { key: "revenue", label: "Revenue", origin: "shopify", format: "money", pick: (t) => t.revenueMinor },
  { key: "orders", label: "Orders", origin: "shopify", format: "count", pick: (t) => t.orders },
  { key: "aov", label: "AOV", origin: "shopify", format: "money", pick: (t) => t.aovMinor },
  { key: "adSpend", label: "Ad Spend", origin: "meta", format: "money", pick: (t) => t.adSpendMinor },
  { key: "manualIncome", label: "Manual Income", origin: "manual", format: "money", pick: (t) => t.manualIncomeMinor },
  { key: "manualExpenses", label: "Manual Expenses", origin: "manual", format: "money", pick: (t) => t.manualExpensesMinor },
  { key: "profit", label: "Profit", origin: "mixed", format: "money", pick: (t) => t.profitMinor },
];

/** The seven /financials tiles in DESIGN.md order, with a delta against the
 *  previous period wherever both sides have a figure. */
export function computeFinancialTiles(current: FinancialTotals, previous: FinancialTotals): FinancialTile[] {
  return TILE_SPECS.map(({ key, label, origin, format, pick }) => ({
    key,
    label,
    origin,
    format,
    value: pick(current),
    deltaPct: pctDeltaOrNull(pick(current), pick(previous)),
  }));
}

export interface DailyFinancialRow {
  day: string;
  revenueMinor: number | null;
  orders: number | null;
  adSpendMinor: number | null;
  manualIncomeMinor: number | null;
  manualExpensesMinor: number | null;
  profitMinor: number | null;
}

/** One row per day that any source has something for, newest first. Days with
 *  nothing at all are omitted (DESIGN.md); a cell whose source has no row that
 *  day stays null so it renders "—" rather than $0. */
export function computeDailyRows(
  summaryRows: SummaryRowLike[],
  spendRows: SpendRowLike[],
  entries: FinancialEntry[],
  from: string,
  to: string,
): DailyFinancialRow[] {
  const inRange = (day: string | null | undefined): day is string => Boolean(day) && day! >= from && day! <= to;
  const byDay = new Map<string, { revenue: number | null; orders: number | null; spend: number | null; income: number | null; expenses: number | null }>();
  const slot = (day: string) => {
    let s = byDay.get(day);
    if (!s) {
      s = { revenue: null, orders: null, spend: null, income: null, expenses: null };
      byDay.set(day, s);
    }
    return s;
  };

  for (const r of summaryRows) {
    if (!inRange(r.day)) continue;
    const s = slot(r.day);
    s.revenue = (s.revenue ?? 0) + num(r.revenue_minor);
    s.orders = (s.orders ?? 0) + num(r.orders);
  }
  for (const r of spendRows) {
    if (!inRange(r.day)) continue;
    const s = slot(r.day);
    s.spend = (s.spend ?? 0) + num(r.spend_minor);
  }
  for (const e of entries) {
    if (!inRange(e.date)) continue;
    const s = slot(e.date);
    if (e.type === "income") s.income = (s.income ?? 0) + e.amountCents;
    else s.expenses = (s.expenses ?? 0) + e.amountCents;
  }

  return [...byDay.entries()]
    .map(([day, s]) => ({
      day,
      revenueMinor: s.revenue,
      orders: s.orders,
      adSpendMinor: s.spend,
      manualIncomeMinor: s.income,
      manualExpensesMinor: s.expenses,
      profitMinor: computeProfit(s.revenue, s.income, s.spend, s.expenses),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Currency for the page: whatever the platform rows report, else USD. */
export function pickCurrency(...rowSets: { currency?: unknown }[][]): string {
  for (const rows of rowSets) {
    const hit = rows.find((r) => typeof r.currency === "string" && r.currency);
    if (hit) return hit.currency as string;
  }
  return "USD";
}

/* ------------------------------------------------------------------ *
 * Home panel rows
 * ------------------------------------------------------------------ */

export interface FinancialInputs {
  /** Shopify revenue for the period, minor units. */
  revenueMinor: number | null;
  /** Meta ad spend for the period, minor units. */
  adSpendMinor: number | null;
  /** Manual income from records_v1, minor units. */
  manualIncomeMinor?: number | null;
  /** Manual expenses from records_v1, minor units. */
  manualExpensesMinor?: number | null;
}

export interface FinancialRow {
  key: "revenue" | "adSpend" | "expenses" | "profit";
  label: string;
  valueMinor: number | null;
  deltaPct: number | null;
}

/** Revenue / Ad Spend / Expenses / Profit for a period, with deltas against
 *  the previous one. DESIGN.md: Expenses is the manual expenses alone (ad
 *  spend already has its own row) and Profit = revenue + manual income − ad
 *  spend − manual expenses. */
export function computeFinancialRows(current: FinancialInputs, previous: FinancialInputs): FinancialRow[] {
  return ([
    ["revenue", "Revenue", (i: FinancialInputs) => i.revenueMinor],
    ["adSpend", "Ad Spend", (i: FinancialInputs) => i.adSpendMinor],
    ["expenses", "Expenses", (i: FinancialInputs) => i.manualExpensesMinor ?? null],
    [
      "profit",
      "Profit",
      (i: FinancialInputs) => computeProfit(i.revenueMinor, i.manualIncomeMinor, i.adSpendMinor, i.manualExpensesMinor),
    ],
  ] as const).map(([key, label, pick]) => ({
    key,
    label,
    valueMinor: pick(current),
    deltaPct: pctDeltaOrNull(pick(current), pick(previous)),
  }));
}

/* ------------------------------------------------------------------ *
 * The one read both pages need (query only — the caller awaits it).
 * ------------------------------------------------------------------ */

/** Dashboard-sourced financial entries whose own `date` attribute falls in
 *  [from, to]. Filtering on the attribute, not `occurred_at`, keeps the range
 *  in the client's timezone rather than UTC. */
export function financialRecordsQuery(client: DataClient, from: string, to: string) {
  return client.views
    .records_v1("id,kind,source,title,attributes,occurred_at,updated_at")
    .eq("kind", FINANCIAL_ENTRY_KIND)
    .eq("source", FINANCIAL_ENTRY_SOURCE)
    .gte("attributes->>date", from)
    .lte("attributes->>date", to)
    .order("occurred_at", { ascending: false })
    .limit(ENTRY_ROW_LIMIT);
}

/* ========================================================================
 * QuickBooks quarterly budget + recent transactions
 *
 * Worker-written qbo_expense records (source='quickbooks') are read-only
 * here. Sector budgets and sector assignments are dashboard records
 * (source='dashboard', same as financial_entry), written through
 * api.save_record and never through delete_record — an unassign is a plain
 * update to `{ sector: null }`, so it upserts onto the same row and survives
 * every worker re-sync, which only ever touches source='quickbooks' rows.
 * ======================================================================== */

export const QBO_SOURCE = "quickbooks";
export const QBO_EXPENSE_KIND = "qbo_expense";
export const SECTOR_BUDGET_KIND = "sector_budget";
export const SECTOR_ASSIGNMENT_KIND = "sector_assignment";

/** `Purchase:123` or `Bill:456` — the worker's own external_id shape. */
export const TXN_EXTERNAL_ID_RE = /^(Purchase|Bill):[0-9]+$/;
export const QUARTER_RE = /^\d{4}Q[1-4]$/;

// ponytail: capped, no paging — a quarter's worth of QBO expenses or a
// client's whole assignment history comfortably fits. Upgrade to a paged
// read if either ever grows past this.
export const QBO_QUARTER_ROW_LIMIT = 5000;
export const QBO_RECENT_LIMIT = 50;
export const SECTOR_BUDGET_ROW_LIMIT = 50;
export const SECTOR_ASSIGNMENT_ROW_LIMIT = 5000;

/** Default sectors shown even with zero budget/spend, per the mockup. Sector
 *  ids beyond these can still appear (see collectSectorIds) if a budget or
 *  assignment already names one — there is no sector editor UI to create one. */
export const DEFAULT_SECTOR_IDS = ["marketing", "operations", "meta_ads", "sales", "inventory"] as const;

const SECTOR_LABELS: Record<string, string> = {
  marketing: "Marketing",
  operations: "Operations",
  meta_ads: "Meta Ads",
  sales: "Sales",
  inventory: "Inventory",
};

/** Display name for a sector id: the known map, else title-cased from its slug. */
export function sectorLabel(id: string): string {
  return SECTOR_LABELS[id] ?? id.split("_").filter(Boolean).map((w) => (w[0] ?? "").toUpperCase() + w.slice(1)).join(" ");
}

/** The only sectors a write is allowed to name — the default five. There is no
 *  sector editor UI, so this is the whole enumerable set for setSectorBudget /
 *  assignTransaction. (collectSectorIds separately unions in anything already
 *  on a budget or assignment row, so older/foreign data still renders.) */
export function isKnownSectorId(id: unknown): id is string {
  return typeof id === "string" && (DEFAULT_SECTOR_IDS as readonly string[]).includes(id);
}

/** Calendar quarter of a YYYY-MM-DD date, as 'YYYYQn'. */
export function quarterOf(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const q = Math.floor(((m ?? 1) - 1) / 3) + 1;
  return `${y}Q${q}`;
}

/** [start, endExclusive) for a 'YYYYQn' quarter, both YYYY-MM-DD. null for a
 *  malformed quarter string. */
export function quarterBounds(quarter: string): { start: string; endExclusive: string } | null {
  const m = QUARTER_RE.exec(quarter);
  if (!m) return null;
  const year = Number(quarter.slice(0, 4));
  const q = Number(quarter[5]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 3;
  const endYear = endMonth > 12 ? year + 1 : year;
  const endMonthNorm = endMonth > 12 ? endMonth - 12 : endMonth;
  return {
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    endExclusive: `${endYear}-${String(endMonthNorm).padStart(2, "0")}-01`,
  };
}

export interface QboTxn {
  externalId: string;
  date: string;
  amountCents: number;
  currency: string;
  vendor: string;
  memo: string | null;
  txnType: "Purchase" | "Bill";
}

/** One records_v1 row -> a QBO expense txn, or null when it is not a
 *  well-formed source='quickbooks' qbo_expense row. */
export function toQboTxn(row: RecordLike): QboTxn | null {
  if (!row.external_id || row.kind !== QBO_EXPENSE_KIND || row.source !== QBO_SOURCE) return null;
  if (!TXN_EXTERNAL_ID_RE.test(row.external_id)) return null;
  const a = attr(row);
  const date = typeof a.date === "string" ? a.date : "";
  if (!isValidYmd(date)) return null;
  const amountCents = Number(a.amount_cents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null;
  const txnType = a.txn_type === "Purchase" || a.txn_type === "Bill" ? a.txn_type : null;
  if (!txnType) return null;
  return {
    externalId: row.external_id,
    date,
    amountCents,
    currency: typeof a.currency === "string" && a.currency ? a.currency : "USD",
    vendor: typeof a.vendor === "string" && a.vendor.trim() ? a.vendor.trim() : (row.title ?? "Unknown vendor"),
    memo: typeof a.memo === "string" && a.memo.trim() ? a.memo.trim() : (typeof row.body === "string" && row.body.trim() ? row.body.trim() : null),
    txnType,
  };
}

export interface SectorBudget {
  quarter: string;
  sector: string;
  budgetCents: number;
}

/** One records_v1 row -> a sector_budget, or null when malformed. */
export function toSectorBudget(row: RecordLike): SectorBudget | null {
  if (row.kind !== SECTOR_BUDGET_KIND || row.source !== FINANCIAL_ENTRY_SOURCE) return null;
  const a = attr(row);
  const quarter = typeof a.quarter === "string" ? a.quarter : "";
  if (!QUARTER_RE.test(quarter)) return null;
  const sector = typeof a.sector === "string" && a.sector ? a.sector : "";
  if (!sector) return null;
  const budgetCents = Number(a.budget_cents);
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 0) return null;
  return { quarter, sector, budgetCents };
}

export interface SectorAssignment {
  txn: string;
  sector: string | null;
}

/** One records_v1 row -> a sector_assignment, or null when malformed. A
 *  `sector` of exactly `null` is a deliberate unassign, not a missing field. */
export function toSectorAssignment(row: RecordLike): SectorAssignment | null {
  if (row.kind !== SECTOR_ASSIGNMENT_KIND || row.source !== FINANCIAL_ENTRY_SOURCE) return null;
  const a = attr(row);
  const txn = typeof a.txn === "string" ? a.txn : "";
  if (!TXN_EXTERNAL_ID_RE.test(txn)) return null;
  if (a.sector !== null && typeof a.sector !== "string") return null;
  return { txn, sector: a.sector === null ? null : (a.sector as string) };
}

/** txn external_id -> current sector (or null), one row per txn by
 *  construction (save_record upserts on external_id). */
export function toAssignmentMap(assignments: SectorAssignment[]): Map<string, string | null> {
  return new Map(assignments.map((a) => [a.txn, a.sector]));
}

/** Sectors = the default five, unioned with any sector a budget or assignment
 *  already names (defensive: nothing in the UI can write an unknown sector,
 *  but older or foreign data might still carry one). */
export function collectSectorIds(budgets: SectorBudget[], assignments: SectorAssignment[]): string[] {
  const ids = new Set<string>(DEFAULT_SECTOR_IDS);
  for (const b of budgets) ids.add(b.sector);
  for (const a of assignments) if (a.sector) ids.add(a.sector);
  return [...ids];
}

export interface SectorTotal {
  id: string;
  label: string;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  pctUsed: number;
}

export interface SectorTotalsResult {
  sectors: SectorTotal[];
  totalBudgetCents: number;
  totalSpentCents: number;
  totalRemainingCents: number;
}

/** Per-sector budget/spent/remaining/% for one quarter, plus header totals.
 *  Spent counts only a txn whose own `date` falls inside [quarter start,
 *  quarter end) AND whose assignment (keyed on the txn's external_id, never
 *  its row id) names that sector. */
export function sectorTotals({
  txns,
  assignments,
  budgets,
  quarter,
  sectors,
}: {
  txns: QboTxn[];
  assignments: SectorAssignment[];
  budgets: SectorBudget[];
  quarter: string;
  sectors: string[];
}): SectorTotalsResult {
  const bounds = quarterBounds(quarter);
  const assignBySectorTxn = toAssignmentMap(assignments);
  const spentBySector = new Map<string, number>();
  if (bounds) {
    for (const t of txns) {
      if (t.date < bounds.start || t.date >= bounds.endExclusive) continue;
      const sector = assignBySectorTxn.get(t.externalId);
      if (!sector) continue;
      spentBySector.set(sector, (spentBySector.get(sector) ?? 0) + t.amountCents);
    }
  }
  const budgetBySector = new Map(budgets.filter((b) => b.quarter === quarter).map((b) => [b.sector, b.budgetCents]));

  const result: SectorTotal[] = sectors.map((id) => {
    const budgetCents = budgetBySector.get(id) ?? 0;
    const spentCents = spentBySector.get(id) ?? 0;
    const remainingCents = budgetCents - spentCents;
    const pctUsed = budgetCents > 0 ? (spentCents / budgetCents) * 100 : spentCents > 0 ? 100 : 0;
    return { id, label: sectorLabel(id), budgetCents, spentCents, remainingCents, pctUsed };
  });

  const totalBudgetCents = result.reduce((sum, s) => sum + s.budgetCents, 0);
  const totalSpentCents = result.reduce((sum, s) => sum + s.spentCents, 0);
  return { sectors: result, totalBudgetCents, totalSpentCents, totalRemainingCents: totalBudgetCents - totalSpentCents };
}

/* ---------------------------------------------------------- parse* gates */

export type SectorErrorCode = "sector" | "quarter" | "txn" | "budget";
export type SectorParseResult<T> = { ok: true; value: T } | { ok: false; code: SectorErrorCode };

export interface SetSectorBudgetInput {
  quarter: string;
  sector: string;
  budgetCents: number;
}

/** The whole server-side gate for setSectorBudget. */
export function parseSectorBudgetInput(input: { quarter?: unknown; sector?: unknown; budget?: unknown }): SectorParseResult<SetSectorBudgetInput> {
  const quarter = typeof input.quarter === "string" ? input.quarter : "";
  if (!QUARTER_RE.test(quarter)) return { ok: false, code: "quarter" };
  if (!isKnownSectorId(input.sector)) return { ok: false, code: "sector" };
  const budgetCents = parseAmountToCents(typeof input.budget === "string" ? input.budget : "");
  if (budgetCents === null) return { ok: false, code: "budget" };
  return { ok: true, value: { quarter, sector: input.sector, budgetCents } };
}

export interface AssignTxnInput {
  txn: string;
  sector: string | null;
}

/** The whole server-side gate for assignTransaction (a null/empty `sector`
 *  parses as an explicit unassign). */
export function parseAssignInput(input: { txn?: unknown; sector?: unknown }): SectorParseResult<AssignTxnInput> {
  const txn = typeof input.txn === "string" ? input.txn : "";
  if (!TXN_EXTERNAL_ID_RE.test(txn)) return { ok: false, code: "txn" };
  const sectorRaw = input.sector;
  if (sectorRaw === null || sectorRaw === undefined || sectorRaw === "") return { ok: true, value: { txn, sector: null } };
  if (!isKnownSectorId(sectorRaw)) return { ok: false, code: "sector" };
  return { ok: true, value: { txn, sector: sectorRaw } };
}

/** The whole server-side gate for unassignTransaction: only the txn id needs
 *  validating, since the sector is always null. */
export function parseUnassignInput(input: { txn?: unknown }): SectorParseResult<{ txn: string }> {
  const txn = typeof input.txn === "string" ? input.txn : "";
  if (!TXN_EXTERNAL_ID_RE.test(txn)) return { ok: false, code: "txn" };
  return { ok: true, value: { txn } };
}

export interface BulkAssignInput {
  txns: string[];
  sector: string | null;
}

/** The whole server-side gate for bulkAssign: every txn id must be well-formed
 *  (malformed ones are dropped, not fatal — a stale checkbox shouldn't sink
 *  the rest of the selection) and at least one must remain. */
export function parseBulkAssignInput(input: { txns?: unknown[]; sector?: unknown }): SectorParseResult<BulkAssignInput> {
  const txns = Array.isArray(input.txns) ? input.txns.filter((t): t is string => typeof t === "string" && TXN_EXTERNAL_ID_RE.test(t)) : [];
  if (!txns.length) return { ok: false, code: "txn" };
  const sectorRaw = input.sector;
  if (sectorRaw === null || sectorRaw === undefined || sectorRaw === "") return { ok: true, value: { txns, sector: null } };
  if (!isKnownSectorId(sectorRaw)) return { ok: false, code: "sector" };
  return { ok: true, value: { txns, sector: sectorRaw } };
}

/** save_record's exact shapes for the two dashboard record kinds above. */
export function sectorBudgetExternalId(quarter: string, sector: string): string {
  return `sector_budget:${quarter}:${sector}`;
}
export function sectorBudgetAttributes(v: SetSectorBudgetInput) {
  return { quarter: v.quarter, sector: v.sector, budget_cents: v.budgetCents };
}
export function sectorAssignmentExternalId(txn: string): string {
  return `sector_assignment:${txn}`;
}
export function sectorAssignmentAttributes(txn: string, sector: string | null) {
  return { txn, sector };
}

/* ------------------------------------------------------- read queries */

export function qboQuarterTxnsQuery(client: DataClient, quarterStart: string, quarterEndExclusive: string) {
  return client.views
    .records_v1("id,kind,source,external_id,title,body,attributes,occurred_at,updated_at")
    .eq("kind", QBO_EXPENSE_KIND)
    .eq("source", QBO_SOURCE)
    .gte("attributes->>date", quarterStart)
    .lt("attributes->>date", quarterEndExclusive)
    .limit(QBO_QUARTER_ROW_LIMIT);
}

export function qboRecentTxnsQuery(client: DataClient) {
  return client.views
    .records_v1("id,kind,source,external_id,title,body,attributes,occurred_at,updated_at")
    .eq("kind", QBO_EXPENSE_KIND)
    .eq("source", QBO_SOURCE)
    .order("occurred_at", { ascending: false })
    .limit(QBO_RECENT_LIMIT);
}

export function sectorBudgetsQuery(client: DataClient, quarter: string) {
  return client.views
    .records_v1("id,kind,source,attributes,updated_at")
    .eq("kind", SECTOR_BUDGET_KIND)
    .eq("source", FINANCIAL_ENTRY_SOURCE)
    .eq("attributes->>quarter", quarter)
    .limit(SECTOR_BUDGET_ROW_LIMIT);
}

export function sectorAssignmentsQuery(client: DataClient) {
  return client.views
    .records_v1("id,kind,source,attributes,updated_at")
    .eq("kind", SECTOR_ASSIGNMENT_KIND)
    .eq("source", FINANCIAL_ENTRY_SOURCE)
    .limit(SECTOR_ASSIGNMENT_ROW_LIMIT);
}
