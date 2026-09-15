/**
 * qa-daily-report.test.mjs — QA supplement to tests/daily-report.test.mjs for
 * item B1 (Daily Financial Report): timezone edge cases (invalid tz, +13/+14
 * offsets), malformed/non-USD currency, null/NaN row values, and loader
 * failure combinations not covered by the engineer's own suite.
 * Run with: corepack pnpm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDailyReport, dailyReportLines, formatDailyReportText, loadDailyReport, yesterdayInTimezone } from "../lib/daily-report.ts";
import { isValidTimezone, todayInTimezone } from "../lib/overview.ts";

const DAY = "2026-09-13";

const entry = (id, date, type, amount_cents) => ({
  id,
  kind: "financial_entry",
  source: "dashboard",
  attributes: { date, type, category: "Misc", amount_cents },
});

/* ------------------------------------------------------------- timezones */

test("an invalid IANA timezone is rejected so the shell falls back to the default", () => {
  // client_v1.timezone is free text; lib/header.ts only accepts it when
  // isValidTimezone passes, because Intl throws a RangeError on a bad name.
  assert.equal(isValidTimezone("America/New_York"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Not/AZone"), false);
  assert.equal(isValidTimezone("America/New_Yrk"), false);
  assert.equal(isValidTimezone(""), false);
  assert.throws(() => todayInTimezone("Not/AZone", new Date("2026-09-14T03:00:00Z")), RangeError);
});

test("yesterday is correct at the +14 and -11 extremes of the IANA offset range", () => {
  const now = new Date("2026-01-01T10:00:00Z"); // 10:00 UTC Jan 1
  // Kiritimati is UTC+14: local time is already Jan 2, so yesterday is Jan 1.
  assert.equal(yesterdayInTimezone("Pacific/Kiritimati", now), "2026-01-01");
  // Niue is UTC-11: local time is still Dec 31, so yesterday is Dec 30.
  assert.equal(yesterdayInTimezone("Pacific/Niue", now), "2025-12-30");
});

test("yesterday is correct across a DST fall-back transition", () => {
  // 2026-11-01 is the US fall-back date; local wall-clock date arithmetic
  // must still land on the calendar day before, not be perturbed by the
  // repeated hour.
  const now = new Date("2026-11-01T12:00:00Z"); // 08:00 EDT / 07:00 EST
  assert.equal(yesterdayInTimezone("America/New_York", now), "2026-10-31");
});

/* -------------------------------------------------------------- currency */

test("non-USD currency (0-decimal JPY) formats correctly through the daily lines", () => {
  const r = computeDailyReport(DAY, [{ day: DAY, revenue_minor: 12345, orders: 3, currency: "JPY" }], [], []);
  assert.equal(r.currency, "JPY");
  const lines = dailyReportLines(r);
  // JPY has 0 minor units per Intl, so 12345 "minor" is treated as 12345 yen.
  assert.equal(lines[0].value, "¥12,345");
});

test("a malformed currency code from a row degrades every money line to '—' instead of throwing", () => {
  const r = computeDailyReport(DAY, [{ day: DAY, revenue_minor: 5000, orders: 1, currency: "12" }], [], []);
  assert.equal(r.currency, "12");
  assert.doesNotThrow(() => formatDailyReportText(r));
  const lines = dailyReportLines(r);
  assert.equal(lines.find((l) => l.label === "Revenue").value, "—");
  assert.equal(lines.find((l) => l.label === "AOV").value, "—");
});

/* --------------------------------------------------------- dirty numbers */

test("null/NaN/string numeric fields are treated as 0, not NaN or a thrown error", () => {
  const r = computeDailyReport(
    DAY,
    [{ day: DAY, revenue_minor: null, orders: "not-a-number", currency: "USD" }],
    [{ day: DAY, spend_minor: undefined, currency: "USD" }],
    [],
  );
  assert.equal(r.hasData, true); // the day HAS a row from summary/spend, even though all-zero
  assert.equal(r.totals.revenueMinor, 0);
  assert.equal(r.totals.orders, 0);
  assert.equal(r.totals.adSpendMinor, 0);
  assert.equal(r.totals.aovMinor, null); // orders is 0 → no AOV, not 0/0 = NaN
  assert.equal(Number.isNaN(r.totals.profitMinor), false);
});

test("a financial entry with a non-finite amount_cents is dropped, not summed as NaN", () => {
  // toFinancialEntry requires Number.isSafeInteger(amountCents); NaN and
  // Infinity both fail that and the row is silently excluded.
  const r = computeDailyReport(DAY, [], [], [entry("a", DAY, "income", NaN), entry("b", DAY, "income", 100)]);
  assert.equal(r.totals.manualIncomeMinor, 100);
});

/* ------------------------------------------------------- entries by date */

test("entries dated other days returned by a wider query never leak into the day's totals", () => {
  // financialRecordsQuery's own from/to filter narrows what's fetched, but
  // computeDailyReport must ALSO re-filter defensively (its own doc comment
  // says callers may pass a wider read) - simulate the wider read directly.
  const wide = [entry("a", "2026-09-10", "income", 999999), entry("b", DAY, "income", 200), entry("c", "2026-09-20", "expense", 999999)];
  const r = computeDailyReport(DAY, [], [], wide);
  assert.equal(r.totals.manualIncomeMinor, 200);
  // Manual figures are null only when the day has NO entries at all
  // (computeFinancialTotals); with one in-range income entry present,
  // expenses is a real 0, not "-".
  assert.equal(r.totals.manualExpensesMinor, 0);
});

/* -------------------------------------------------------------- loader */

test("all three source reads failing yields 'No data yet' and all three named, not a throw", async () => {
  const failingClient = {
    calls: {},
    views: {
      daily_summary_v1: () => ({ eq: () => ({ then: (_r, rej) => Promise.resolve({ data: null, error: { message: "x" } }).then(_r, rej) }) }),
      campaign_daily_v1: () => ({ eq: () => ({ then: (r) => Promise.resolve({ data: null, error: { message: "x" } }).then(r) }) }),
      records_v1: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => ({ order: () => ({ limit: () => ({ then: (r) => Promise.resolve({ data: null, error: { message: "x" } }).then(r) }) }) }),
            }),
          }),
        }),
      }),
    },
  };
  const { report, errors } = await loadDailyReport(failingClient, DAY);
  assert.deepEqual(errors.sort(), ["campaign_daily_v1", "daily_summary_v1", "records_v1"]);
  assert.equal(report.hasData, false);
  assert.equal(formatDailyReportText(report), `Daily Financial Report — ${DAY}\nNo data yet.`);
});

test("a rejected promise (thrown network error), not just an {error} result, still counts as no rows", async () => {
  const rejectingClient = {
    views: {
      daily_summary_v1: () => ({ eq: () => Promise.reject(new Error("network down")) }),
      campaign_daily_v1: () => ({ eq: () => ({ then: (r) => Promise.resolve({ data: [{ day: DAY, spend_minor: 300 }], error: null }).then(r) }) }),
      records_v1: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({ lte: () => ({ order: () => ({ limit: () => ({ then: (r) => Promise.resolve({ data: [], error: null }).then(r) }) }) }) }),
          }),
        }),
      }),
    },
  };
  const { report, errors } = await loadDailyReport(rejectingClient, DAY);
  assert.deepEqual(errors, ["daily_summary_v1"]);
  assert.equal(report.totals.revenueMinor, null);
  assert.equal(report.totals.adSpendMinor, 300);
});
