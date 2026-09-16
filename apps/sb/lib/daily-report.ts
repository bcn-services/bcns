/**
 * daily-report.ts — the Daily Financial Report: yesterday's revenue, orders,
 * AOV (daily_summary_v1), ad spend (campaign_daily_v1) and manual entries
 * (records_v1 financial_entry), in the client's timezone. Deterministic, no
 * AI. The home panel computes it live; `pnpm briefing` prints it.
 *
 * Pure except `loadDailyReport`, which issues the three reads. Covered by
 * tests/daily-report.test.mjs.
 */

import type { DataClient } from "@bcn-services/data-client";
import { addDaysYmd, formatCount, formatMoney, todayInTimezone } from "./overview";
import {
  computeFinancialTotals,
  financialRecordsQuery,
  pickCurrency,
  shapeEntries,
  type FinancialTotals,
  type RecordLike,
  type SpendRowLike,
  type SummaryRowLike,
} from "./financials";

/** "Yesterday" as YYYY-MM-DD in an IANA timezone. */
export function yesterdayInTimezone(timezone: string, now: Date = new Date()): string {
  return addDaysYmd(todayInTimezone(timezone, now), -1);
}

export interface DailyReport {
  day: string;
  currency: string;
  totals: FinancialTotals;
  /** False when no source has anything for the day → "No data yet". */
  hasData: boolean;
}

/** The report for `day` from raw view rows. Rows for other days are ignored,
 *  so callers may pass a wider read. */
export function computeDailyReport(
  day: string,
  summaryRows: SummaryRowLike[],
  spendRows: SpendRowLike[],
  entryRows: RecordLike[],
): DailyReport {
  const summary = summaryRows.filter((r) => r.day === day);
  const spend = spendRows.filter((r) => r.day === day);
  const totals = computeFinancialTotals(summary, spend, shapeEntries(entryRows, day, day));
  const hasData =
    totals.revenueMinor !== null ||
    totals.adSpendMinor !== null ||
    totals.manualIncomeMinor !== null ||
    totals.manualExpensesMinor !== null;
  return { day, currency: pickCurrency(summary, spend), totals, hasData };
}

export interface DailyReportLine {
  key: keyof FinancialTotals;
  label: string;
  value: string;
}

/** The seven label/value pairs in /financials tile order; "—" where the
 *  source has no row for the day. */
export function dailyReportLines(report: DailyReport): DailyReportLine[] {
  const { totals: t, currency } = report;
  const money = (v: number | null) => formatMoney(v, currency);
  return [
    { key: "revenueMinor", label: "Revenue", value: money(t.revenueMinor) },
    { key: "orders", label: "Orders", value: formatCount(t.orders) },
    { key: "aovMinor", label: "AOV", value: money(t.aovMinor) },
    { key: "adSpendMinor", label: "Ad Spend", value: money(t.adSpendMinor) },
    { key: "manualIncomeMinor", label: "Manual Income", value: money(t.manualIncomeMinor) },
    { key: "manualExpensesMinor", label: "Manual Expenses", value: money(t.manualExpensesMinor) },
    { key: "profitMinor", label: "Profit", value: money(t.profitMinor) },
  ];
}

/** Plain-text report for the script's stdout. */
export function formatDailyReportText(report: DailyReport): string {
  const head = `Daily Financial Report — ${report.day}`;
  if (!report.hasData) return `${head}\nNo data yet.`;
  return [head, ...dailyReportLines(report).map((l) => `${l.label}: ${l.value}`)].join("\n");
}

/** Reads the three sources for `day` and computes the report. A failed read
 *  counts as "no rows" for that source and is named in `errors`, so one
 *  broken view never blanks the others. */
export async function loadDailyReport(client: DataClient, day: string): Promise<{ report: DailyReport; errors: string[] }> {
  const [summaryR, spendR, recordsR] = await Promise.allSettled([
    client.views.daily_summary_v1("day,revenue_minor,orders,currency").eq("day", day),
    client.views.campaign_daily_v1("day,spend_minor,currency").eq("day", day),
    financialRecordsQuery(client, day, day),
  ]);
  const errors: string[] = [];
  const rows = <T>(name: string, r: PromiseSettledResult<{ data: T[] | null; error: unknown }>): T[] => {
    if (r.status === "fulfilled" && !r.value.error) return r.value.data ?? [];
    errors.push(name);
    return [];
  };
  const report = computeDailyReport(
    day,
    rows<SummaryRowLike>("daily_summary_v1", summaryR),
    rows<SpendRowLike>("campaign_daily_v1", spendR),
    rows<RecordLike>("records_v1", recordsR),
  );
  return { report, errors };
}
