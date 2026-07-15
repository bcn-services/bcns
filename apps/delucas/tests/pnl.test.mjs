/**
 * pnl.test.mjs — Unit tests for the pure-function P&L module.
 *
 * Pure Node.js — no test framework, no server, no Electron.
 * Run with: node tests/pnl.test.mjs
 */

// Use Node's built-in assert
import assert from "node:assert/strict";
// Import the compiled TS via tsx/ts-node, or directly if running via tsx
import { bucketByMonth, computeMonthPnl, compute12MonthSeries, generateSummary } from "../src/shared/pnl.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

/** Build a minimal Transaction object for testing */
function tx(overrides = {}) {
  return {
    id: 1,
    date: "2024-01-15",
    amount_cents: 100_00, // $100.00
    direction: "revenue",
    category: "food",
    vendor: "test",
    source: "manual",
    source_ref: null,
    created_at: "2024-01-15T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// bucketByMonth
// ---------------------------------------------------------------------------

console.log("\nbucketByMonth");

test("groups transactions by YYYY-MM prefix", () => {
  const txs = [
    tx({ id: 1, date: "2024-01-05" }),
    tx({ id: 2, date: "2024-01-20" }),
    tx({ id: 3, date: "2024-02-01" }),
  ];
  const buckets = bucketByMonth(txs);
  assert.equal(buckets.size, 2);
  assert.equal(buckets.get("2024-01")?.length, 2);
  assert.equal(buckets.get("2024-02")?.length, 1);
});

test("handles year boundaries correctly", () => {
  const txs = [
    tx({ id: 1, date: "2023-12-31" }),
    tx({ id: 2, date: "2024-01-01" }),
  ];
  const buckets = bucketByMonth(txs);
  assert.equal(buckets.size, 2);
  assert.ok(buckets.has("2023-12"));
  assert.ok(buckets.has("2024-01"));
});

test("empty input returns empty map", () => {
  assert.equal(bucketByMonth([]).size, 0);
});

test("date string is used as-is — no timezone conversion", () => {
  // Date "2024-01-31" should always land in "2024-01" regardless of TZ
  const txs = [tx({ date: "2024-01-31" })];
  const buckets = bucketByMonth(txs);
  assert.ok(buckets.has("2024-01"));
  assert.equal(buckets.has("2024-02"), false);
});

// ---------------------------------------------------------------------------
// computeMonthPnl
// ---------------------------------------------------------------------------

console.log("\ncomputeMonthPnl");

test("revenue-only month", () => {
  const txs = [
    tx({ amount_cents: 500_00, direction: "revenue" }),
    tx({ amount_cents: 200_00, direction: "revenue" }),
  ];
  const pnl = computeMonthPnl("2024-01", txs);
  assert.equal(pnl.revenue_cents, 700_00);
  assert.equal(pnl.expense_cents, 0);
  assert.equal(pnl.profit_cents, 700_00);
});

test("expense-only month", () => {
  const txs = [
    tx({ amount_cents: 300_00, direction: "expense", category: "rent" }),
    tx({ amount_cents: 100_00, direction: "expense", category: "utilities" }),
  ];
  const pnl = computeMonthPnl("2024-01", txs);
  assert.equal(pnl.revenue_cents, 0);
  assert.equal(pnl.expense_cents, 400_00);
  assert.equal(pnl.profit_cents, -400_00);
});

test("mixed transactions compute profit correctly", () => {
  const txs = [
    tx({ amount_cents: 1000_00, direction: "revenue" }),
    tx({ amount_cents: 400_00, direction: "expense", category: "food" }),
    tx({ amount_cents: 200_00, direction: "expense", category: "labor" }),
  ];
  const pnl = computeMonthPnl("2024-01", txs);
  assert.equal(pnl.revenue_cents, 1000_00);
  assert.equal(pnl.expense_cents, 600_00);
  assert.equal(pnl.profit_cents, 400_00);
});

test("category totals accumulate correctly", () => {
  const txs = [
    tx({ amount_cents: 100_00, direction: "expense", category: "food" }),
    tx({ amount_cents: 50_00, direction: "expense", category: "food" }),
    tx({ amount_cents: 200_00, direction: "expense", category: "rent" }),
    tx({ amount_cents: 75_00, direction: "expense", category: "utilities" }),
  ];
  const pnl = computeMonthPnl("2024-01", txs);
  assert.equal(pnl.expense_by_category.food, 150_00);
  assert.equal(pnl.expense_by_category.rent, 200_00);
  assert.equal(pnl.expense_by_category.utilities, 75_00);
  assert.equal(pnl.expense_by_category.labor, 0);
  assert.equal(pnl.expense_by_category.beverage, 0);
  assert.equal(pnl.expense_by_category.other, 0);
});

test("revenue does not contribute to category totals", () => {
  const txs = [tx({ amount_cents: 999_99, direction: "revenue", category: "food" })];
  const pnl = computeMonthPnl("2024-01", txs);
  assert.equal(pnl.expense_by_category.food, 0);
});

test("empty month returns all-zero pnl", () => {
  const pnl = computeMonthPnl("2024-01", []);
  assert.equal(pnl.revenue_cents, 0);
  assert.equal(pnl.expense_cents, 0);
  assert.equal(pnl.profit_cents, 0);
});

test("month key is preserved in result", () => {
  const pnl = computeMonthPnl("2024-06", []);
  assert.equal(pnl.month, "2024-06");
});

// ---------------------------------------------------------------------------
// compute12MonthSeries
// ---------------------------------------------------------------------------

console.log("\ncompute12MonthSeries");

test("returns exactly 12 entries", () => {
  const series = compute12MonthSeries("2024-12", []);
  assert.equal(series.length, 12);
});

test("last entry is endMonth", () => {
  const series = compute12MonthSeries("2024-06", []);
  assert.equal(series[series.length - 1]?.month, "2024-06");
});

test("first entry is 11 months before endMonth", () => {
  const series = compute12MonthSeries("2024-06", []);
  assert.equal(series[0]?.month, "2023-07");
});

test("spans year boundary correctly (endMonth = 2024-03)", () => {
  const series = compute12MonthSeries("2024-03", []);
  assert.equal(series[0]?.month, "2023-04");
  assert.equal(series[11]?.month, "2024-03");
});

test("only includes transactions within the 12-month window", () => {
  const txs = [
    tx({ id: 1, date: "2024-01-15", amount_cents: 100_00, direction: "revenue" }),
    // Outside window — too old
    tx({ id: 2, date: "2020-06-01", amount_cents: 999_99, direction: "revenue" }),
  ];
  const series = compute12MonthSeries("2024-12", txs);
  const jan = series.find((m) => m.month === "2024-01");
  assert.ok(jan !== undefined);
  assert.equal(jan.revenue_cents, 100_00);

  // Old transaction should not appear in any bucket
  const totalRevenue = series.reduce((sum, m) => sum + m.revenue_cents, 0);
  assert.equal(totalRevenue, 100_00);
});

test("months in series are in ascending order", () => {
  const series = compute12MonthSeries("2024-12", []);
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i].month > series[i - 1].month);
  }
});

// ---------------------------------------------------------------------------
// generateSummary
// ---------------------------------------------------------------------------

console.log("\ngenerateSummary");

test("profit case", () => {
  const pnl = {
    month: "2024-01",
    revenue_cents: 500_00,
    expense_cents: 300_00,
    profit_cents: 200_00,
    expense_by_category: { food: 0, beverage: 0, utilities: 0, rent: 300_00, labor: 0, other: 0 },
  };
  const summary = generateSummary(pnl);
  assert.equal(summary, "You made $200 more than you spent in January 2024.");
});

test("loss case", () => {
  const pnl = {
    month: "2024-02",
    revenue_cents: 100_00,
    expense_cents: 400_00,
    profit_cents: -300_00,
    expense_by_category: { food: 0, beverage: 0, utilities: 0, rent: 400_00, labor: 0, other: 0 },
  };
  const summary = generateSummary(pnl);
  assert.equal(summary, "You spent $300 more than you took in in February 2024.");
});

test("breakeven case", () => {
  const pnl = {
    month: "2024-03",
    revenue_cents: 200_00,
    expense_cents: 200_00,
    profit_cents: 0,
    expense_by_category: { food: 0, beverage: 0, utilities: 0, rent: 200_00, labor: 0, other: 0 },
  };
  const summary = generateSummary(pnl);
  assert.equal(summary, "Revenue and expenses were equal in March 2024.");
});

test("formats dollars with cents when non-zero", () => {
  const pnl = {
    month: "2024-04",
    revenue_cents: 150025,
    expense_cents: 0,
    profit_cents: 150025,
    expense_by_category: { food: 0, beverage: 0, utilities: 0, rent: 0, labor: 0, other: 0 },
  };
  const summary = generateSummary(pnl);
  assert.ok(summary.includes("$1,500.25"), `Expected $1,500.25 in: ${summary}`);
});

test("formats large round dollar amounts without cents", () => {
  const pnl = {
    month: "2024-05",
    revenue_cents: 1_000_00,
    expense_cents: 0,
    profit_cents: 1_000_00,
    expense_by_category: { food: 0, beverage: 0, utilities: 0, rent: 0, labor: 0, other: 0 },
  };
  const summary = generateSummary(pnl);
  assert.ok(summary.includes("$1,000"), `Expected $1,000 in: ${summary}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
