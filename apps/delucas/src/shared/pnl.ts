/**
 * pnl.ts — Pure-function P&L computation module.
 *
 * NO imports from electron or node:* — this file is safe to import from the
 * renderer, from the shell, and from headless unit tests.
 *
 * All monetary values are in cents (integer). Month keys are "YYYY-MM" strings.
 */

import type {
  Transaction,
  MonthPnl,
  CategoryBreakdown,
  TransactionCategory,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ZERO_CATEGORIES: CategoryBreakdown = {
  food: 0,
  beverage: 0,
  utilities: 0,
  rent: 0,
  labor: 0,
  other: 0,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract "YYYY-MM" from an ISO 8601 date string ("YYYY-MM-DD").
 * Pure string operation — no Date parsing, no timezone concerns.
 */
function extractMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Format a month key "YYYY-MM" into "Month YYYY" (e.g. "January 2024").
 */
function formatMonthLabel(monthKey: string): string {
  const year = monthKey.slice(0, 4);
  const monthIndex = parseInt(monthKey.slice(5, 7), 10) - 1;
  const monthName = MONTH_NAMES[monthIndex] ?? monthKey;
  return `${monthName} ${year}`;
}

/**
 * Format cents as a dollar string with commas, no decimal for whole dollars.
 * e.g. 150025 → "$1,500.25", 150000 → "$1,500"
 */
function formatDollars(cents: number): string {
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remaining = absCents % 100;
  const dollarsFormatted = dollars.toLocaleString("en-US");
  if (remaining === 0) {
    return `$${dollarsFormatted}`;
  }
  const centsStr = remaining.toString().padStart(2, "0");
  return `$${dollarsFormatted}.${centsStr}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bucket a flat list of transactions into a map keyed by "YYYY-MM".
 * Transactions with the same YYYY-MM prefix land in the same bucket
 * regardless of their time component.
 */
export function bucketByMonth(
  transactions: readonly Transaction[]
): Map<string, Transaction[]> {
  const buckets = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const month = extractMonth(tx.date);
    const existing = buckets.get(month);
    if (existing !== undefined) {
      existing.push(tx);
    } else {
      buckets.set(month, [tx]);
    }
  }
  return buckets;
}

/**
 * Compute P&L for a single calendar month from its transactions.
 */
export function computeMonthPnl(
  month: string,
  transactions: readonly Transaction[]
): MonthPnl {
  let revenue = 0;
  let expense = 0;
  const byCategory: CategoryBreakdown = { ...ZERO_CATEGORIES };

  for (const tx of transactions) {
    if (tx.direction === "revenue") {
      revenue += tx.amount_cents;
    } else {
      expense += tx.amount_cents;
      const cat: TransactionCategory = tx.category;
      byCategory[cat] += tx.amount_cents;
    }
  }

  return {
    month,
    revenue_cents: revenue,
    expense_cents: expense,
    profit_cents: revenue - expense,
    expense_by_category: byCategory,
  };
}

/**
 * Compute a 12-month P&L series ending with the given month (inclusive).
 *
 * @param endMonth "YYYY-MM" — the most recent month in the window
 * @param transactions All transactions — only those within the 12-month
 *   window are included; others are silently ignored.
 */
export function compute12MonthSeries(
  endMonth: string,
  transactions: readonly Transaction[]
): MonthPnl[] {
  // Build the ordered list of 12 months: [startMonth, ..., endMonth]
  const months = buildMonthRange(endMonth, 12);
  const monthSet = new Set(months);

  // Filter transactions to the window and bucket
  const windowTxs = transactions.filter((tx) =>
    monthSet.has(extractMonth(tx.date))
  );
  const buckets = bucketByMonth(windowTxs);

  return months.map((month) =>
    computeMonthPnl(month, buckets.get(month) ?? [])
  );
}

/**
 * Generate a plain-English summary sentence for a MonthPnl.
 *
 * Format:
 *   profit > 0: "You made $X more than you spent in <Month YYYY>."
 *   profit < 0: "You spent $X more than you took in in <Month YYYY>."
 *   profit = 0: "Revenue and expenses were equal in <Month YYYY>."
 */
export function generateSummary(pnl: MonthPnl): string {
  const label = formatMonthLabel(pnl.month);
  if (pnl.profit_cents > 0) {
    return `You made ${formatDollars(pnl.profit_cents)} more than you spent in ${label}.`;
  }
  if (pnl.profit_cents < 0) {
    return `You spent ${formatDollars(pnl.profit_cents)} more than you took in in ${label}.`;
  }
  return `Revenue and expenses were equal in ${label}.`;
}

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

/**
 * Build an ordered array of `count` consecutive "YYYY-MM" strings ending
 * at `endMonth` (inclusive). Pure arithmetic — no Date object needed.
 */
function buildMonthRange(endMonth: string, count: number): string[] {
  const endYear = parseInt(endMonth.slice(0, 4), 10);
  const endMonthNum = parseInt(endMonth.slice(5, 7), 10); // 1-12

  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let m = endMonthNum - i;
    let y = endYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const mm = m.toString().padStart(2, "0");
    months.push(`${y}-${mm}`);
  }
  return months;
}
