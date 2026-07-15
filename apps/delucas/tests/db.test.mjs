/**
 * db.test.mjs — Unit tests for SQLite schema, migrations, queries, and recurring materializer.
 *
 * Pure Node.js — no Electron, no browser. Uses in-memory SQLite.
 * Run with: node tests/db.test.mjs
 */

import assert from "node:assert/strict";
import Database from "better-sqlite3";

// We import the TS modules via --import tsx (see package.json test script)
import { runMigrations } from "../src/shell-electron/db/migrations.ts";
import {
  getTransactions,
  getTransactionsByMonth,
  insertTransaction,
  isEmailProcessed,
  markEmailProcessed,
  getSetting,
  setSetting,
} from "../src/shell-electron/db/queries.ts";
import { materializeRecurring } from "../src/shell-electron/recurring.ts";

// ---------------------------------------------------------------------------
// Test runner
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

/** Create a fresh in-memory DB with migrations applied */
function freshDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

console.log("\nSchema migrations");

test("migrates from empty — all tables exist", () => {
  const db = freshDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  assert.ok(tables.includes("transactions"), "transactions table missing");
  assert.ok(tables.includes("recurring_rules"), "recurring_rules table missing");
  assert.ok(tables.includes("processed_emails"), "processed_emails table missing");
  assert.ok(tables.includes("settings"), "settings table missing");
  assert.ok(tables.includes("schema_migrations"), "schema_migrations table missing");
});

test("running migrations twice is idempotent — no error, no duplicate version", () => {
  const db = freshDb();
  runMigrations(db); // second run
  const versions = db.prepare("SELECT version FROM schema_migrations").all();
  // Should still be exactly 1 migration version
  assert.equal(versions.length, 1);
});

test("migration version is recorded", () => {
  const db = freshDb();
  const row = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
  assert.ok(row !== undefined);
});

// ---------------------------------------------------------------------------
// Transactions queries
// ---------------------------------------------------------------------------

console.log("\nTransaction queries");

test("getTransactions returns empty array on fresh db", () => {
  const db = freshDb();
  assert.deepEqual(getTransactions(db), []);
});

test("insertTransaction returns a numeric id", () => {
  const db = freshDb();
  const id = insertTransaction(db, {
    date: "2024-01-15",
    amount_cents: 500_00,
    direction: "revenue",
    category: "food",
    vendor: "Sysco",
    source: "manual",
  });
  assert.equal(typeof id, "number");
  assert.ok(id > 0);
});

test("getTransactions returns inserted row", () => {
  const db = freshDb();
  insertTransaction(db, {
    date: "2024-01-15",
    amount_cents: 250_00,
    direction: "expense",
    category: "utilities",
    vendor: "ConEd",
    source: "manual",
  });
  const txs = getTransactions(db);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].amount_cents, 250_00);
  assert.equal(txs[0].vendor, "ConEd");
});

test("getTransactionsByMonth filters by YYYY-MM prefix", () => {
  const db = freshDb();
  insertTransaction(db, { date: "2024-01-10", amount_cents: 100_00, direction: "revenue", category: "food", vendor: "A", source: "manual" });
  insertTransaction(db, { date: "2024-01-20", amount_cents: 200_00, direction: "revenue", category: "food", vendor: "B", source: "manual" });
  insertTransaction(db, { date: "2024-02-05", amount_cents: 300_00, direction: "revenue", category: "food", vendor: "C", source: "manual" });

  const jan = getTransactionsByMonth(db, "2024-01");
  assert.equal(jan.length, 2);

  const feb = getTransactionsByMonth(db, "2024-02");
  assert.equal(feb.length, 1);

  const mar = getTransactionsByMonth(db, "2024-03");
  assert.equal(mar.length, 0);
});

// ---------------------------------------------------------------------------
// Email deduplication
// ---------------------------------------------------------------------------

console.log("\nEmail deduplication");

test("isEmailProcessed returns false for unknown message-id", () => {
  const db = freshDb();
  assert.equal(isEmailProcessed(db, "<foo@bar.com>"), false);
});

test("isEmailProcessed returns true after marking", () => {
  const db = freshDb();
  markEmailProcessed(db, "<foo@bar.com>");
  assert.equal(isEmailProcessed(db, "<foo@bar.com>"), true);
});

test("markEmailProcessed is idempotent — no error on duplicate", () => {
  const db = freshDb();
  markEmailProcessed(db, "<dup@test.com>");
  markEmailProcessed(db, "<dup@test.com>"); // should not throw
  assert.equal(isEmailProcessed(db, "<dup@test.com>"), true);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

console.log("\nSettings");

test("getSetting returns undefined for missing key", () => {
  const db = freshDb();
  assert.equal(getSetting(db, "nonexistent"), undefined);
});

test("setSetting then getSetting round-trips value", () => {
  const db = freshDb();
  setSetting(db, "imap.host", "imap.gmail.com");
  assert.equal(getSetting(db, "imap.host"), "imap.gmail.com");
});

test("setSetting overwrites existing value (upsert)", () => {
  const db = freshDb();
  setSetting(db, "theme", "light");
  setSetting(db, "theme", "dark");
  assert.equal(getSetting(db, "theme"), "dark");
});

// ---------------------------------------------------------------------------
// Recurring materializer
// ---------------------------------------------------------------------------

console.log("\nRecurring materializer");

/** Insert a recurring rule and return its id */
function insertRule(db, overrides = {}) {
  const rule = {
    label: "Rent",
    amount_cents: 2500_00,
    direction: "expense",
    category: "rent",
    vendor: "Landlord LLC",
    day_of_month: 1,
    start_date: "2024-01-01",
    end_date: null,
    ...overrides,
  };
  const result = db
    .prepare(
      `INSERT INTO recurring_rules (label, amount_cents, direction, category, vendor, day_of_month, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .get(rule.label, rule.amount_cents, rule.direction, rule.category, rule.vendor, rule.day_of_month, rule.start_date, rule.end_date);
  return result.id;
}

test("materializes one transaction per month for rent rule", () => {
  const db = freshDb();
  insertRule(db, { start_date: "2024-01-01" });
  materializeRecurring(db, "2024-03");
  const txs = getTransactions(db);
  // Jan, Feb, Mar = 3 transactions
  assert.equal(txs.length, 3);
  assert.ok(txs.every((t) => t.source === "recurring"));
  assert.ok(txs.every((t) => t.category === "rent"));
});

test("running materializer twice is idempotent — no duplicates", () => {
  const db = freshDb();
  insertRule(db, { start_date: "2024-01-01" });
  materializeRecurring(db, "2024-03");
  materializeRecurring(db, "2024-03");
  const txs = getTransactions(db);
  assert.equal(txs.length, 3);
});

test("extending throughMonth appends new months without duplication", () => {
  const db = freshDb();
  insertRule(db, { start_date: "2024-01-01" });
  materializeRecurring(db, "2024-03");
  materializeRecurring(db, "2024-05"); // extend to May
  const txs = getTransactions(db);
  assert.equal(txs.length, 5); // Jan-May
});

test("respects rule start_date — no transactions before start", () => {
  const db = freshDb();
  insertRule(db, { start_date: "2024-03-01" });
  materializeRecurring(db, "2024-05");
  const txs = getTransactions(db);
  // Only Mar, Apr, May = 3
  assert.equal(txs.length, 3);
  const months = txs.map((t) => t.date.slice(0, 7)).sort();
  assert.deepEqual(months, ["2024-03", "2024-04", "2024-05"]);
});

test("respects rule end_date — no transactions after end", () => {
  const db = freshDb();
  insertRule(db, { start_date: "2024-01-01", end_date: "2024-02-28" });
  materializeRecurring(db, "2024-05");
  const txs = getTransactions(db);
  // Only Jan and Feb
  assert.equal(txs.length, 2);
});

test("source_ref encodes ruleId and month", () => {
  const db = freshDb();
  const ruleId = insertRule(db, { start_date: "2024-01-01" });
  materializeRecurring(db, "2024-01");
  const txs = getTransactions(db);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].source_ref, `recurring:${ruleId}:2024-01`);
});

test("day_of_month=28 always produces a valid date (safe across all months)", () => {
  const db = freshDb();
  // Schema caps day_of_month at 28 — Feb always has at least 28 days
  insertRule(db, { start_date: "2024-02-01", day_of_month: 28 });
  materializeRecurring(db, "2024-02");
  const txs = getTransactions(db);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].date, "2024-02-28");
});

test("no transactions created if no recurring rules", () => {
  const db = freshDb();
  materializeRecurring(db, "2024-06");
  assert.equal(getTransactions(db).length, 0);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
