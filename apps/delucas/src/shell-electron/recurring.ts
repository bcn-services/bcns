/**
 * recurring.ts — Idempotent materializer for recurring transaction rules.
 *
 * For each active recurring rule, generates one transaction per calendar
 * month between the rule's start_date and the given `throughMonth`.
 * Uses `source_ref` to deduplicate — running twice produces no duplicates.
 *
 * source_ref format: "recurring:<ruleId>:<YYYY-MM>"
 */

import type Database from "better-sqlite3";
import { getRecurringRules, insertTransaction } from "./db/queries";

const REF_PREFIX = "recurring";

/**
 * Build the canonical source_ref for a recurring rule in a given month.
 */
function makeSourceRef(ruleId: number, month: string): string {
  return `${REF_PREFIX}:${ruleId}:${month}`;
}

/**
 * Build the ISO 8601 date string for a recurring rule firing in a given month.
 * Clamps day_of_month to the last day of the month to avoid invalid dates
 * (e.g. rule with day=31 in February → 2024-02-28).
 */
function buildDate(year: number, month: number, dayOfMonth: number): string {
  const mm = month.toString().padStart(2, "0");
  // Days in each month (non-leap year is fine for clamping heuristic)
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.min(dayOfMonth, daysInMonth);
  const dd = day.toString().padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse "YYYY-MM" → [year, month] as integers.
 */
function parseYearMonth(ym: string): [number, number] {
  return [parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10)];
}

/**
 * Extract "YYYY-MM" from an ISO 8601 date string.
 */
function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Advance [year, month] by one month.
 */
function nextMonth(year: number, month: number): [number, number] {
  if (month === 12) return [year + 1, 1];
  return [year, month + 1];
}

/**
 * Materialize all outstanding recurring transactions through `throughMonth`
 * (inclusive, "YYYY-MM").
 *
 * Idempotent: if a transaction with the same source_ref already exists,
 * it is skipped.
 */
export function materializeRecurring(
  db: Database.Database,
  throughMonth: string
): void {
  const rules = getRecurringRules(db);
  if (rules.length === 0) return;

  // Prepared statement to check for existing materialized transactions
  const existsStmt = db.prepare<[string], { id: number }>(
    "SELECT id FROM transactions WHERE source = 'recurring' AND source_ref = ?"
  );

  const [endYear, endMonth] = parseYearMonth(throughMonth);

  for (const rule of rules) {
    const ruleStartMonth = toYearMonth(rule.start_date);
    const ruleEndMonth = rule.end_date !== null ? toYearMonth(rule.end_date) : null;

    let [y, m] = parseYearMonth(ruleStartMonth);

    // Walk month by month from the rule's start to throughMonth
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const monthKey = `${y}-${m.toString().padStart(2, "0")}`;

      // Stop if rule has an end date and we've passed it
      if (ruleEndMonth !== null && monthKey > ruleEndMonth) break;

      const sourceRef = makeSourceRef(rule.id, monthKey);

      // Idempotency check — skip if already materialized
      if (existsStmt.get(sourceRef) === undefined) {
        insertTransaction(db, {
          date: buildDate(y, m, rule.day_of_month),
          amount_cents: rule.amount_cents,
          direction: rule.direction,
          category: rule.category,
          vendor: rule.vendor,
          source: "recurring",
          source_ref: sourceRef,
        });
      }

      [y, m] = nextMonth(y, m);
    }
  }
}
