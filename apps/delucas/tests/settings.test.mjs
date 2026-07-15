/**
 * settings.test.mjs — Unit tests for settings round-trip via getSetting/setSetting.
 *
 * Tests:
 *  1. Settings persist: set then get returns the same value
 *  2. getSetting returns undefined for unknown keys
 *  3. setSetting updates existing value (upsert)
 *  4. Settings survive across multiple gets
 *  5. vendor_category_map round-trips as JSON (stored as JSON string)
 *
 * Pure Node.js (tsx) — no Electron, no browser.
 */

import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { runMigrations } from "../src/shell-electron/db/migrations.ts";
import { getSetting, setSetting } from "../src/shell-electron/db/queries.ts";

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

function makeDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nSettings — round-trip checks\n");

test("getSetting: returns undefined for unknown key", () => {
  const db = makeDb();
  const val = getSetting(db, "nonexistent_key");
  assert.equal(val, undefined, `expected undefined got ${val}`);
});

test("setSetting + getSetting: string value round-trips", () => {
  const db = makeDb();
  setSetting(db, "imap_host", "imap.gmail.com");
  const val = getSetting(db, "imap_host");
  assert.equal(val, "imap.gmail.com");
});

test("setSetting + getSetting: password value round-trips", () => {
  const db = makeDb();
  setSetting(db, "imap_password", "super-secret-password");
  const val = getSetting(db, "imap_password");
  assert.equal(val, "super-secret-password");
});

test("setSetting + getSetting: anthropic_key round-trips", () => {
  const db = makeDb();
  setSetting(db, "anthropic_key", "sk-ant-api03-fake");
  const val = getSetting(db, "anthropic_key");
  assert.equal(val, "sk-ant-api03-fake");
});

test("setSetting: updates existing value (upsert)", () => {
  const db = makeDb();
  setSetting(db, "imap_host", "imap.example.com");
  setSetting(db, "imap_host", "imap.updated.com");
  const val = getSetting(db, "imap_host");
  assert.equal(val, "imap.updated.com", `expected updated value got ${val}`);
});

test("setSetting + getSetting: multiple keys are independent", () => {
  const db = makeDb();
  setSetting(db, "imap_host", "host.example.com");
  setSetting(db, "imap_user", "user@example.com");
  setSetting(db, "imap_port", "993");
  setSetting(db, "imap_secure", "true");

  assert.equal(getSetting(db, "imap_host"), "host.example.com");
  assert.equal(getSetting(db, "imap_user"), "user@example.com");
  assert.equal(getSetting(db, "imap_port"), "993");
  assert.equal(getSetting(db, "imap_secure"), "true");
});

test("setSetting + getSetting: backup_folder round-trips", () => {
  const db = makeDb();
  setSetting(db, "backup_folder", "/Users/nate/Backups/DeLucas");
  const val = getSetting(db, "backup_folder");
  assert.equal(val, "/Users/nate/Backups/DeLucas");
});

test("setSetting + getSetting: last_backup_date round-trips", () => {
  const db = makeDb();
  setSetting(db, "last_backup_date", "2026-07-15");
  const val = getSetting(db, "last_backup_date");
  assert.equal(val, "2026-07-15");
});

test("setSetting + getSetting: vendor_category_map JSON round-trips", () => {
  const db = makeDb();
  const map = { "DoorDash": "food", "Landlord LLC": "rent", "Staff": "labor" };
  const json = JSON.stringify(map);
  setSetting(db, "vendor_category_map", json);
  const raw = getSetting(db, "vendor_category_map");
  assert.equal(typeof raw, "string", "stored value should be a string");
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed, map, "parsed map should match original");
});

test("getSetting: empty string key returns undefined", () => {
  const db = makeDb();
  // empty key never set — should return undefined
  const val = getSetting(db, "");
  assert.equal(val, undefined);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(`\n  ${passed}/${total} settings checks passed`);

if (failed > 0) {
  console.error(`\n  ${failed} checks failed`);
  process.exit(1);
}
