// quarter-budget.test.mjs — QuickBooks quarterly budget + recent transactions
// (item D on /financials): quarter math, sectorTotals across a quarter
// boundary, re-sync-keeps-assignment, parse* rejections, and the
// trust-boundary invariants (every sector write goes through save_record, no
// client_id is ever passed, and the RPC itself derives client_id from
// tenant_or_raise()) via static assertions on the source, the same style as
// tests/qa-financials.test.mjs uses for deleteFinancialEntry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseAssignInput,
  parseBulkAssignInput,
  parseSectorBudgetInput,
  parseUnassignInput,
  quarterBounds,
  quarterOf,
  sectorAssignmentAttributes,
  sectorTotals,
  toAssignmentMap,
  toQboTxn,
} from "../lib/financials.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");

/* ------------------------------------------------------- quarter boundaries */

test("quarterOf: calendar quarter boundaries", () => {
  assert.equal(quarterOf("2026-01-01"), "2026Q1");
  assert.equal(quarterOf("2026-03-31"), "2026Q1");
  assert.equal(quarterOf("2026-04-01"), "2026Q2");
  assert.equal(quarterOf("2026-09-30"), "2026Q3");
  assert.equal(quarterOf("2026-10-01"), "2026Q4");
  assert.equal(quarterOf("2026-12-31"), "2026Q4");
});

test("quarterBounds: [start, endExclusive) for each quarter, including a year rollover", () => {
  assert.deepEqual(quarterBounds("2026Q3"), { start: "2026-07-01", endExclusive: "2026-10-01" });
  assert.deepEqual(quarterBounds("2026Q4"), { start: "2026-10-01", endExclusive: "2027-01-01" });
  assert.deepEqual(quarterBounds("2026Q1"), { start: "2026-01-01", endExclusive: "2026-04-01" });
});

test("quarterBounds: malformed quarter strings return null", () => {
  for (const bad of ["2026Q5", "2026Q0", "26Q1", "2026-Q1", "notaquarter", ""]) {
    assert.equal(quarterBounds(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

/* ---------------------------------------------- sectorTotals quarter edge */

const txnRow = (over = {}) => ({
  id: "r1",
  kind: "qbo_expense",
  source: "quickbooks",
  external_id: "Purchase:1",
  title: "Acme",
  body: null,
  attributes: { date: "2026-09-30", amount_cents: 5000, currency: "USD", vendor: "Acme", txn_type: "Purchase" },
  occurred_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
  ...over,
});

test("sectorTotals: a txn dated Sep 30 counts in Q3, one dated Oct 1 does not", () => {
  const sep30 = toQboTxn(txnRow({ external_id: "Purchase:1", attributes: { ...txnRow().attributes, date: "2026-09-30" } }));
  const oct1 = toQboTxn(txnRow({ external_id: "Purchase:2", attributes: { ...txnRow().attributes, date: "2026-10-01" } }));
  assert.ok(sep30 && oct1);

  const assignments = [
    { txn: "Purchase:1", sector: "marketing" },
    { txn: "Purchase:2", sector: "marketing" },
  ];
  const q3 = sectorTotals({ txns: [sep30, oct1], assignments, budgets: [], quarter: "2026Q3", sectors: ["marketing"] });
  assert.equal(q3.sectors[0].spentCents, 5000, "only the Sep 30 txn should land in Q3");

  const q4 = sectorTotals({ txns: [sep30, oct1], assignments, budgets: [], quarter: "2026Q4", sectors: ["marketing"] });
  assert.equal(q4.sectors[0].spentCents, 5000, "only the Oct 1 txn should land in Q4");
});

test("sectorTotals: header totals sum every sector's budget/spent, remaining can go negative", () => {
  const t = toQboTxn(txnRow({ attributes: { ...txnRow().attributes, amount_cents: 12_000 } }));
  const result = sectorTotals({
    txns: [t],
    assignments: [{ txn: "Purchase:1", sector: "marketing" }],
    budgets: [{ quarter: "2026Q3", sector: "marketing", budgetCents: 10_000 }],
    quarter: "2026Q3",
    sectors: ["marketing", "sales"],
  });
  const marketing = result.sectors.find((s) => s.id === "marketing");
  assert.equal(marketing.budgetCents, 10_000);
  assert.equal(marketing.spentCents, 12_000);
  assert.equal(marketing.remainingCents, -2_000);
  assert.equal(marketing.pctUsed, 120);
  assert.equal(result.totalSpentCents, 12_000);
  assert.equal(result.totalBudgetCents, 10_000);
});

/* ------------------------------------------------- re-sync keeps assignment */

test("re-sync: a rebuilt txn row (new uuid, refreshed attributes) with the same external_id keeps its sector and totals", () => {
  const original = toQboTxn(txnRow({ id: "old-uuid", attributes: { ...txnRow().attributes, amount_cents: 5000 } }));
  // The worker's nightly re-sync deletes and re-inserts qbo_expense rows: same
  // external_id (Purchase:1), new row id, and possibly a refreshed memo/amount
  // from QuickBooks. The assignment is keyed on external_id, so it survives.
  const resynced = toQboTxn(txnRow({ id: "new-uuid-after-resync", attributes: { ...txnRow().attributes, amount_cents: 5000, memo: "updated memo" } }));
  assert.ok(original && resynced);
  assert.equal(original.externalId, resynced.externalId);

  const assignments = [{ txn: "Purchase:1", sector: "marketing" }];
  const before = sectorTotals({ txns: [original], assignments, budgets: [], quarter: "2026Q3", sectors: ["marketing"] });
  const after = sectorTotals({ txns: [resynced], assignments, budgets: [], quarter: "2026Q3", sectors: ["marketing"] });
  assert.equal(before.sectors[0].spentCents, after.sectors[0].spentCents, "totals must be unchanged across a re-sync");
  assert.equal(toAssignmentMap(assignments).get(resynced.externalId), "marketing", "sector must persist across a re-sync");
});

test("re-sync: an assignment keyed to a txn that no longer exists is simply ignored, not an error", () => {
  const assignments = [{ txn: "Purchase:999", sector: "marketing" }];
  // No txns at all reference Purchase:999 (e.g. the worker's re-sync replaced
  // it with a different external_id, or it was voided in QuickBooks).
  const result = sectorTotals({ txns: [], assignments, budgets: [], quarter: "2026Q3", sectors: ["marketing"] });
  assert.equal(result.sectors[0].spentCents, 0);
  assert.equal(result.totalSpentCents, 0);
});

test("sectorTotals: assignment lookup is keyed on external_id, never a row id", () => {
  // Two different records_v1 rows (different `id`) can share the sector
  // assignment only via the same external_id; a lookup keyed on `id` instead
  // would never match and silently zero out every sector's spend.
  const t = toQboTxn(txnRow({ id: "row-id-that-does-not-match-assignment", external_id: "Purchase:42", attributes: { ...txnRow().attributes } }));
  const assignments = [{ txn: "Purchase:42", sector: "sales" }];
  const result = sectorTotals({ txns: [t], assignments, budgets: [], quarter: "2026Q3", sectors: ["sales"] });
  assert.equal(result.sectors[0].spentCents, 5000);
});

/* --------------------------------------------------------- parse* rejections */

test("parseSectorBudgetInput: rejects an unknown sector, a malformed quarter, and a bad budget", () => {
  assert.equal(parseSectorBudgetInput({ quarter: "2026Q3", sector: "not_a_sector", budget: "100.00" }).ok, false);
  assert.equal(parseSectorBudgetInput({ quarter: "2026Q3", sector: "marketing", budget: "100.00" }).ok, true);
  for (const bad of ["2026Q5", "26Q1", "", undefined]) {
    assert.equal(parseSectorBudgetInput({ quarter: bad, sector: "marketing", budget: "100.00" }).ok, false, `quarter ${JSON.stringify(bad)}`);
  }
  for (const bad of ["-5", "NaN", "abc", "0", ""]) {
    assert.equal(parseSectorBudgetInput({ quarter: "2026Q3", sector: "marketing", budget: bad }).ok, false, `budget ${JSON.stringify(bad)}`);
  }
});

test("parseAssignInput: rejects a malformed txn id and an unknown sector; empty/null sector parses as an unassign", () => {
  assert.equal(parseAssignInput({ txn: "not-a-txn", sector: "marketing" }).ok, false);
  assert.equal(parseAssignInput({ txn: "Purchase:1", sector: "not_a_sector" }).ok, false);
  const ok = parseAssignInput({ txn: "Bill:7", sector: "sales" });
  assert.deepEqual(ok, { ok: true, value: { txn: "Bill:7", sector: "sales" } });
  assert.deepEqual(parseAssignInput({ txn: "Purchase:1", sector: null }), { ok: true, value: { txn: "Purchase:1", sector: null } });
  assert.deepEqual(parseAssignInput({ txn: "Purchase:1", sector: "" }), { ok: true, value: { txn: "Purchase:1", sector: null } });
});

test("parseUnassignInput: always writes sector:null via sectorAssignmentAttributes, and rejects a bad txn id", () => {
  assert.equal(parseUnassignInput({ txn: "garbage" }).ok, false);
  const parsed = parseUnassignInput({ txn: "Purchase:1" });
  assert.equal(parsed.ok, true);
  assert.deepEqual(sectorAssignmentAttributes(parsed.value.txn, null), { txn: "Purchase:1", sector: null });
});

test("parseBulkAssignInput: drops malformed txn ids, rejects when none remain, and rejects an unknown sector", () => {
  const mixed = parseBulkAssignInput({ txns: ["Purchase:1", "garbage", "Bill:2"], sector: "marketing" });
  assert.equal(mixed.ok, true);
  assert.deepEqual(mixed.value.txns, ["Purchase:1", "Bill:2"]);
  assert.equal(parseBulkAssignInput({ txns: ["garbage"], sector: "marketing" }).ok, false);
  assert.equal(parseBulkAssignInput({ txns: [], sector: "marketing" }).ok, false);
  assert.equal(parseBulkAssignInput({ txns: ["Purchase:1"], sector: "not_a_sector" }).ok, false);
});

/* ---------------------------------------------------------- static assertions */

test("actions.ts: every sector write (setSectorBudget/assignTransaction/unassignTransaction/bulkAssign) calls save_record, never delete_record, and never passes a client_id", () => {
  const src = readFileSync(join(root, "app/financials/actions.ts"), "utf8");
  const section = src.slice(src.indexOf("QuickBooks quarterly budget"));
  assert.match(section, /save_record/);
  // A doc comment right above this code explains that unassign is a save_record
  // upsert and *not* a delete_record call — so bare /delete_record/ would match
  // that prose. Assert against actual call sites only.
  assert.doesNotMatch(section, /\.rpc\.delete_record\b/, "unassign must be a save_record upsert, never a delete");
  assert.doesNotMatch(section, /client_id/i, "client_id must never be passed from the app — the RPC derives it from tenant_or_raise()");

  for (const fn of ["setSectorBudget", "assignTransaction", "unassignTransaction", "bulkAssign"]) {
    const start = section.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, `expected an exported ${fn}`);
    const next = section.indexOf("export async function", start + 1);
    const body = section.slice(start, next === -1 ? undefined : next);
    assert.match(body, /rpc\.save_record/, `${fn} must call client.rpc.save_record`);
  }
});

test("the save_record RPC (SQL) derives client_id from tenant_or_raise() and hardcodes source='dashboard' — never a caller-supplied value", () => {
  const sql = readFileSync(join(repoRoot, "platform/supabase/migrations/20260912000500_api_rpcs.sql"), "utf8");
  const start = sql.indexOf("create function api.save_record");
  assert.ok(start >= 0, "expected api.save_record to exist in the RPC migration");
  const next = sql.indexOf("create function", start + 1);
  const body = sql.slice(start, next === -1 ? undefined : next);
  assert.match(body, /tenant_or_raise\(\)/);
  assert.match(body, /values \(tenant, 'dashboard'/);
  assert.doesNotMatch(body, /\bclient_id\s+text\b/i, "save_record must not accept a client_id parameter");
});
