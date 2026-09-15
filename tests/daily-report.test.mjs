/**
 * daily-report.test.mjs — lib/daily-report.ts: client-local "yesterday", the
 * one-day merge of Shopify / Meta / manual figures, the "No data yet" state,
 * the text the script prints, and the loader against a fake data client.
 * Run with: corepack pnpm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDailyReport,
  dailyReportLines,
  formatDailyReportText,
  loadDailyReport,
  yesterdayInTimezone,
} from "../lib/daily-report.ts";

const DAY = "2026-09-13";

const entry = (id, date, type, amount_cents) => ({
  id,
  kind: "financial_entry",
  source: "dashboard",
  attributes: { date, type, category: "Misc", amount_cents },
});

test("yesterday follows the client's timezone, not UTC", () => {
  // 03:00 UTC on Sep 14 is still Sep 13 in New York.
  const now = new Date("2026-09-14T03:00:00Z");
  assert.equal(yesterdayInTimezone("America/New_York", now), "2026-09-12");
  assert.equal(yesterdayInTimezone("UTC", now), "2026-09-13");
  assert.equal(yesterdayInTimezone("Asia/Tokyo", now), "2026-09-13");
});

test("yesterday crosses month and leap-year boundaries", () => {
  assert.equal(yesterdayInTimezone("UTC", new Date("2026-03-01T12:00:00Z")), "2026-02-28");
  assert.equal(yesterdayInTimezone("UTC", new Date("2028-03-01T12:00:00Z")), "2028-02-29");
  assert.equal(yesterdayInTimezone("UTC", new Date("2027-01-01T12:00:00Z")), "2026-12-31");
});

test("merges the day's revenue, orders, AOV, ad spend and manual entries", () => {
  const r = computeDailyReport(
    DAY,
    [
      { day: DAY, revenue_minor: 30000, orders: 3, currency: "USD" },
      { day: "2026-09-12", revenue_minor: 99999, orders: 9, currency: "USD" },
    ],
    [
      { day: DAY, spend_minor: 4000, currency: "USD" },
      { day: DAY, spend_minor: 1000, currency: "USD" },
      { day: "2026-09-14", spend_minor: 77777 },
    ],
    [entry("a", DAY, "income", 500), entry("b", DAY, "expense", 1500), entry("c", "2026-09-12", "expense", 99999)],
  );
  assert.equal(r.hasData, true);
  assert.equal(r.currency, "USD");
  assert.deepEqual(r.totals, {
    revenueMinor: 30000,
    orders: 3,
    aovMinor: 10000,
    adSpendMinor: 5000,
    manualIncomeMinor: 500,
    manualExpensesMinor: 1500,
    profitMinor: 30000 + 500 - 5000 - 1500,
  });
});

test("empty day is 'No data yet', never a fake $0", () => {
  const r = computeDailyReport(DAY, [], [], []);
  assert.equal(r.hasData, false);
  assert.equal(r.totals.revenueMinor, null);
  assert.equal(r.totals.profitMinor, null);
  assert.equal(formatDailyReportText(r), `Daily Financial Report — ${DAY}\nNo data yet.`);
});

test("rows only for other days still count as no data", () => {
  const r = computeDailyReport(DAY, [{ day: "2026-09-12", revenue_minor: 100, orders: 1 }], [], [entry("x", "2026-09-12", "income", 5)]);
  assert.equal(r.hasData, false);
});

test("manual entries alone are data; missing sources stay null", () => {
  const r = computeDailyReport(DAY, [], [], [entry("a", DAY, "expense", 2500)]);
  assert.equal(r.hasData, true);
  assert.equal(r.totals.revenueMinor, null);
  assert.equal(r.totals.adSpendMinor, null);
  assert.equal(r.totals.profitMinor, -2500);
});

test("zero orders gives no AOV instead of dividing by zero", () => {
  const r = computeDailyReport(DAY, [{ day: DAY, revenue_minor: 0, orders: 0 }], [], []);
  assert.equal(r.hasData, true);
  assert.equal(r.totals.aovMinor, null);
});

test("lines are the seven figures in tile order, '—' where absent", () => {
  const r = computeDailyReport(DAY, [{ day: DAY, revenue_minor: 12345, orders: 1, currency: "USD" }], [], []);
  const lines = dailyReportLines(r);
  assert.deepEqual(
    lines.map((l) => l.label),
    ["Revenue", "Orders", "AOV", "Ad Spend", "Manual Income", "Manual Expenses", "Profit"],
  );
  assert.equal(lines[0].value, "$123.45");
  assert.equal(lines[1].value, "1");
  assert.equal(lines[3].value, "—");
  assert.match(formatDailyReportText(r), /^Daily Financial Report — 2026-09-13\nRevenue: \$123\.45\n/);
});

/* ---------------------------------------------------------------- loader */

function fakeQuery(result, calls) {
  const q = {
    eq: (col, val) => (calls.push(["eq", col, val]), q),
    gte: (col, val) => (calls.push(["gte", col, val]), q),
    lte: (col, val) => (calls.push(["lte", col, val]), q),
    order: () => q,
    limit: () => q,
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return q;
}

function fakeClient({ summary = [], spend = [], records = [], fail = [] } = {}) {
  const calls = {};
  const view = (name, rows) => () => {
    calls[name] = [];
    return fakeQuery(fail.includes(name) ? { data: null, error: { message: "boom" } } : { data: rows, error: null }, calls[name]);
  };
  return {
    calls,
    views: {
      daily_summary_v1: view("daily_summary_v1", summary),
      campaign_daily_v1: view("campaign_daily_v1", spend),
      records_v1: view("records_v1", records),
    },
  };
}

test("loadDailyReport reads exactly the one day from each source", async () => {
  const client = fakeClient({
    summary: [{ day: DAY, revenue_minor: 1000, orders: 2, currency: "USD" }],
    spend: [{ day: DAY, spend_minor: 300 }],
    records: [entry("a", DAY, "income", 100)],
  });
  const { report, errors } = await loadDailyReport(client, DAY);
  assert.deepEqual(errors, []);
  assert.equal(report.totals.profitMinor, 1000 + 100 - 300);
  assert.deepEqual(client.calls.daily_summary_v1, [["eq", "day", DAY]]);
  assert.deepEqual(client.calls.campaign_daily_v1, [["eq", "day", DAY]]);
  assert.deepEqual(
    client.calls.records_v1,
    [
      ["eq", "kind", "financial_entry"],
      ["eq", "source", "dashboard"],
      ["gte", "attributes->>date", DAY],
      ["lte", "attributes->>date", DAY],
    ],
  );
});

test("a failed read is named and treated as no rows, others still count", async () => {
  const client = fakeClient({ spend: [{ day: DAY, spend_minor: 300 }], fail: ["daily_summary_v1"] });
  const { report, errors } = await loadDailyReport(client, DAY);
  assert.deepEqual(errors, ["daily_summary_v1"]);
  assert.equal(report.totals.revenueMinor, null);
  assert.equal(report.totals.adSpendMinor, 300);
  assert.equal(report.hasData, true);
});

test("every source empty → No data yet with no errors", async () => {
  const { report, errors } = await loadDailyReport(fakeClient(), DAY);
  assert.deepEqual(errors, []);
  assert.equal(report.hasData, false);
});
