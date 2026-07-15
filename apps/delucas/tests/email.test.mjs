/**
 * email.test.mjs — Unit tests for P4 IMAP email ingestion.
 *
 * All tests use a mock IMAP factory — the live IMAP server is NEVER contacted.
 * No network calls are made.
 *
 * Covers:
 *   - New invoice email → transaction imported once (re-run imports nothing)
 *   - Non-invoice PDF (menu fixture) → classified out, no transaction
 *   - Low-confidence extraction → lands in review queue
 *   - Auth failure → emailStatus.error set, no crash, no transaction
 *   - Vendor→category mapping applied to high-confidence import
 *   - VendorMap: loadVendorMap, resolveCategory
 *   - ReviewQueue: enqueue, get, clear
 *
 * Run with: tsx tests/email.test.mjs
 */

import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { Readable } from "node:stream";

import { runMigrations } from "../src/shell-electron/db/migrations.ts";
import { getTransactions, isEmailProcessed } from "../src/shell-electron/db/queries.ts";
import { EmailSource, getEmailStatus } from "../src/shell-electron/ingestion/sources/email.ts";
import {
  enqueueReviewItem,
  getReviewQueue,
  clearReviewItem,
  clearAllReviewItems,
} from "../src/shell-electron/ingestion/review-queue.ts";
import {
  loadVendorMap,
  saveVendorMap,
  resolveCategory,
} from "../src/shell-electron/ingestion/vendor-mapping.ts";
import { runSources } from "../src/shell-electron/ingestion/runner.ts";

// ---------------------------------------------------------------------------
// Test-local review queue capture
//
// Because .mjs tests and .ts source files run as separate CJS module instances
// under tsx, module-level singletons are not shared across the boundary.
// Instead of relying on the singleton, we inject a capture array via the
// EmailSource `reviewEnqueuer` DI param. The standalone ReviewQueue tests
// import the module directly and verify it works in isolation.
// ---------------------------------------------------------------------------

let capturedReviewItems = [];

function makeCapturingEnqueuer() {
  capturedReviewItems = [];
  return (messageId, extraction) => {
    const id = `review-${capturedReviewItems.length + 1}`;
    capturedReviewItems.push({ id, message_id: messageId, extraction, queued_at: new Date().toISOString() });
    return id;
  };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (process.env["VERBOSE"]) console.error(err.stack);
    failed++;
  }
}

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Mock IMAP factory helpers
//
// The ImapFactory receives a config and must return an object that satisfies
// the ImapFlowLike interface:
//   connect(), logout(), mailboxOpen(), fetchAll(), download()
//
// `makeMockImap(messages)` returns a factory that simulates a mailbox with
// the given messages. Each message has:
//   { uid, messageId, hasPdfPart, pdfBuffer }
//
// `makeAuthFailImap()` returns a factory whose connect() rejects.
// ---------------------------------------------------------------------------

function makePdfBuffer() {
  // Minimal valid content; the mock LLM receives it via pdfBuffer but since
  // we inject mockLlm, the actual bytes don't matter.
  return Buffer.from("%PDF-1.4 mock pdf content");
}

function streamFromBuffer(buf) {
  const s = new Readable({ read() {} });
  s.push(buf);
  s.push(null);
  return s;
}

/**
 * Build a fake IMAP factory that returns a client with the given messages.
 *
 * @param {Array<{ uid: number, messageId: string, hasPdfPart: boolean, pdfBuffer?: Buffer }>} messages
 */
function makeMockImap(messages) {
  return (_config) => ({
    async connect() {},
    async logout() {},
    async mailboxOpen(_path) { return {}; },
    async fetchAll(_range, _query) {
      return messages.map((m) => ({
        uid: m.uid,
        envelope: { messageId: `<${m.messageId}>` },
        bodyStructure: m.hasPdfPart
          ? {
              type: "multipart/mixed",
              childNodes: [
                { type: "text/plain", part: "1" },
                {
                  type: "application/pdf",
                  part: "2",
                  disposition: "attachment",
                  dispositionParameters: { filename: "invoice.pdf" },
                },
              ],
            }
          : { type: "text/plain", part: "1" },
      }));
    },
    async download(_uid, _part, _opts) {
      const msg = messages.find((m) => m.hasPdfPart);
      const buf = msg?.pdfBuffer ?? makePdfBuffer();
      return { content: streamFromBuffer(buf) };
    },
  });
}

/** Factory whose connect() throws an auth error */
function makeAuthFailImap() {
  return (_config) => ({
    async connect() {
      throw new Error("Authentication failed");
    },
    async logout() {},
    async mailboxOpen() {},
    async fetchAll() { return []; },
    async download() { throw new Error("not connected"); },
  });
}

// ---------------------------------------------------------------------------
// Mock LLM results
// ---------------------------------------------------------------------------

const HIGH_CONF_INVOICE = {
  is_invoice: true,
  vendor: "Sysco Foods",
  date: "2025-06-01",
  amount: 24000,
  confidence: "high",
};

const LOW_CONF_INVOICE = {
  is_invoice: true,
  vendor: "Unknown Vendor",
  date: "2025-06-01",
  amount: 5000,
  confidence: "low",
};

const MEDIUM_CONF_INVOICE = {
  is_invoice: true,
  vendor: "Napoli Supplies",
  date: "2025-06-10",
  amount: 8000,
  confidence: "medium",
};

const NON_INVOICE = {
  is_invoice: false,
  vendor: null,
  date: null,
  amount: null,
  confidence: "high",
};

// ---------------------------------------------------------------------------
// Mock PDF converter — bypasses pdfjs entirely in tests
// ---------------------------------------------------------------------------

/** Returns a stable fake base64 string without loading pdfjs */
async function mockPdfConverter(_buf) {
  return "bW9ja3BkZg=="; // base64 for "mockpdf"
}

// ---------------------------------------------------------------------------
// IMAP config (mock — never used by the mock factory itself, but required)
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  host: "imap.example.com",
  port: 993,
  secure: true,
  user: "test@example.com",
  password: "app-password",
};

// ---------------------------------------------------------------------------
// EmailSource tests
// ---------------------------------------------------------------------------

console.log("\nEmailSource:");

await test("new invoice email → transaction imported once", async () => {
  const db = freshDb();
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 1, messageId: "msg-001@mail", hasPdfPart: true }]),
    HIGH_CONF_INVOICE,
    mockPdfConverter,
    makeCapturingEnqueuer()
  );
  const report = await runSources(db, [source]);
  assert.equal(report.imported, 1, "should import 1 transaction");
  const txs = getTransactions(db);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].source, "email");
  assert.equal(txs[0].source_ref, "msg-001@mail");
  assert.equal(txs[0].vendor, "Sysco Foods");
  assert.equal(txs[0].amount_cents, 24000);
});

await test("re-run with same message-id imports nothing (dedup)", async () => {
  const db = freshDb();
  const messageId = "msg-dedup-001@mail";
  const messages = [{ uid: 1, messageId, hasPdfPart: true }];

  // First run
  const source1 = new EmailSource(db, () => MOCK_CONFIG, makeMockImap(messages), HIGH_CONF_INVOICE, mockPdfConverter, makeCapturingEnqueuer());
  const report1 = await runSources(db, [source1]);
  assert.equal(report1.imported, 1);

  // Second run — same message-id already in processed_emails
  const source2 = new EmailSource(db, () => MOCK_CONFIG, makeMockImap(messages), HIGH_CONF_INVOICE, mockPdfConverter, makeCapturingEnqueuer());
  const report2 = await runSources(db, [source2]);
  assert.equal(report2.imported, 0, "second run should not re-import");
  assert.equal(getTransactions(db).length, 1, "only 1 row in DB");
});

await test("non-invoice PDF (menu fixture) → no transaction, message marked processed", async () => {
  const db = freshDb();
  const messageId = "msg-menu-001@mail";
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 2, messageId, hasPdfPart: true }]),
    NON_INVOICE,
    mockPdfConverter,
    makeCapturingEnqueuer()
  );
  const report = await runSources(db, [source]);
  assert.equal(report.imported, 0, "non-invoice → no transaction");
  assert.equal(getTransactions(db).length, 0);
  // Message should still be marked processed
  assert.equal(isEmailProcessed(db, messageId), true, "message-id should be marked processed");
});

await test("low-confidence invoice → lands in review queue, no auto-import", async () => {
  const db = freshDb();
  const enqueuer = makeCapturingEnqueuer();
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 3, messageId: "msg-low-001@mail", hasPdfPart: true }]),
    LOW_CONF_INVOICE,
    mockPdfConverter,
    enqueuer
  );
  const report = await runSources(db, [source]);
  assert.equal(report.imported, 0, "low confidence → not auto-imported");
  assert.equal(getTransactions(db).length, 0);

  assert.equal(capturedReviewItems.length, 1, "should be in review queue");
  assert.equal(capturedReviewItems[0].extraction.confidence, "low");
  assert.equal(capturedReviewItems[0].extraction.vendor, "Unknown Vendor");
});

await test("medium-confidence invoice → lands in review queue", async () => {
  const db = freshDb();
  const enqueuer = makeCapturingEnqueuer();
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 4, messageId: "msg-medium-001@mail", hasPdfPart: true }]),
    MEDIUM_CONF_INVOICE,
    mockPdfConverter,
    enqueuer
  );
  await runSources(db, [source]);
  assert.equal(getTransactions(db).length, 0);
  assert.equal(capturedReviewItems.length, 1);
  assert.equal(capturedReviewItems[0].extraction.confidence, "medium");
});

await test("auth failure → emailStatus.error set, no crash, no transaction", async () => {
  const db = freshDb();
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeAuthFailImap()
  );
  // pull() should NOT throw — it catches and sets status
  const candidates = await source.pull();
  assert.equal(candidates.length, 0, "auth failure → no candidates");
  assert.equal(getTransactions(db).length, 0);

  const status = getEmailStatus();
  assert.equal(status.connected, false);
  assert.ok(status.error !== null, "error should be set");
  assert.ok(status.error.includes("Authentication"), "error message should mention auth");
});

await test("IMAP not configured (null config) → no error, no transactions", async () => {
  const db = freshDb();
  const source = new EmailSource(
    db,
    () => null, // not configured
    makeMockImap([]),
    undefined,
    mockPdfConverter
  );
  const candidates = await source.pull();
  assert.equal(candidates.length, 0);
  assert.equal(getTransactions(db).length, 0);
});

await test("email without PDF attachment → skipped entirely", async () => {
  const db = freshDb();
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 5, messageId: "msg-no-pdf@mail", hasPdfPart: false }]),
    HIGH_CONF_INVOICE,
    mockPdfConverter,
    makeCapturingEnqueuer()
  );
  await runSources(db, [source]);
  assert.equal(getTransactions(db).length, 0, "no PDF → no transaction");
});

// ---------------------------------------------------------------------------
// Vendor→category mapping tests
// ---------------------------------------------------------------------------

console.log("\nVendorMapping:");

await test("loadVendorMap returns empty object when key not set", () => {
  const db = freshDb();
  const map = loadVendorMap(db);
  assert.deepEqual(map, {});
});

await test("saveVendorMap + loadVendorMap round-trips correctly", () => {
  const db = freshDb();
  saveVendorMap(db, { sysco: "food", foxon: "beverage" });
  const map = loadVendorMap(db);
  assert.equal(map["sysco"], "food");
  assert.equal(map["foxon"], "beverage");
});

await test("loadVendorMap filters out invalid category values", () => {
  const db = freshDb();
  saveVendorMap(db, { goodkey: "food", badkey: "invalid_category" });
  const map = loadVendorMap(db);
  assert.equal(map["goodkey"], "food");
  assert.equal(map["badkey"], undefined);
});

await test("resolveCategory matches substring case-insensitively", () => {
  const map = { sysco: "food", foxon: "beverage" };
  assert.equal(resolveCategory("Sysco Foods Inc", map), "food");
  assert.equal(resolveCategory("FOXON PARK BEVERAGES", map), "beverage");
  assert.equal(resolveCategory("Random Vendor Co", map), "other");
});

await test("resolveCategory returns 'other' when map is empty", () => {
  assert.equal(resolveCategory("Any Vendor", {}), "other");
});

await test("vendor mapping applied to high-confidence import", async () => {
  clearAllReviewItems();
  const db = freshDb();
  saveVendorMap(db, { sysco: "food" });

  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 10, messageId: "msg-vm-001@mail", hasPdfPart: true }]),
    HIGH_CONF_INVOICE, // vendor = "Sysco Foods"
    mockPdfConverter,
    makeCapturingEnqueuer()
  );
  await runSources(db, [source]);
  const txs = getTransactions(db);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].category, "food", "vendor map should resolve 'Sysco Foods' → food");
});

// ---------------------------------------------------------------------------
// ReviewQueue tests
// ---------------------------------------------------------------------------

console.log("\nReviewQueue:");

await test("enqueueReviewItem adds item to queue", () => {
  clearAllReviewItems();
  const id = enqueueReviewItem("msg-rq-001@mail", LOW_CONF_INVOICE);
  const queue = getReviewQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, id);
  assert.equal(queue[0].message_id, "msg-rq-001@mail");
  assert.equal(queue[0].extraction.confidence, "low");
});

await test("getReviewQueue returns a copy (mutations don't affect internal queue)", () => {
  clearAllReviewItems();
  enqueueReviewItem("msg-copy@mail", LOW_CONF_INVOICE);
  const q1 = getReviewQueue();
  q1.pop(); // mutate the copy
  const q2 = getReviewQueue();
  assert.equal(q2.length, 1, "internal queue should be unaffected");
});

await test("clearReviewItem removes item by id", () => {
  clearAllReviewItems();
  const id = enqueueReviewItem("msg-clear@mail", LOW_CONF_INVOICE);
  const removed = clearReviewItem(id);
  assert.equal(removed, true);
  assert.equal(getReviewQueue().length, 0);
});

await test("clearReviewItem returns false for unknown id", () => {
  clearAllReviewItems();
  const removed = clearReviewItem("review-999");
  assert.equal(removed, false);
});

await test("multiple items queued and cleared independently", () => {
  clearAllReviewItems();
  const id1 = enqueueReviewItem("msg-a@mail", LOW_CONF_INVOICE);
  const id2 = enqueueReviewItem("msg-b@mail", MEDIUM_CONF_INVOICE);
  assert.equal(getReviewQueue().length, 2);
  clearReviewItem(id1);
  const queue = getReviewQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, id2);
});

// ---------------------------------------------------------------------------
// Message-id processing: message recorded regardless of is_invoice outcome
// ---------------------------------------------------------------------------

console.log("\nProcessed-email recording:");

await test("message-id recorded even for non-invoice PDF", async () => {
  const db = freshDb();
  const messageId = "msg-non-inv@mail";
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 20, messageId, hasPdfPart: true }]),
    NON_INVOICE,
    mockPdfConverter,
    makeCapturingEnqueuer()
  );
  await runSources(db, [source]);
  assert.equal(isEmailProcessed(db, messageId), true, "message-id must be marked processed");
});

await test("message-id recorded for low-confidence (review queue) items", async () => {
  const db = freshDb();
  const messageId = "msg-low-rec@mail";
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeMockImap([{ uid: 21, messageId, hasPdfPart: true }]),
    LOW_CONF_INVOICE,
    mockPdfConverter,
    makeCapturingEnqueuer()
  );
  await runSources(db, [source]);
  assert.equal(isEmailProcessed(db, messageId), true, "low-confidence message-id must still be recorded");
});

await test("auth failure → message-id NOT recorded (can retry after fix)", async () => {
  const db = freshDb();
  const source = new EmailSource(
    db,
    () => MOCK_CONFIG,
    makeAuthFailImap()
  );
  await runSources(db, [source]);
  // Can't know the message-id since we never fetched — just verify DB is empty
  const rows = db.prepare("SELECT COUNT(*) as c FROM processed_emails").get();
  assert.equal(rows.c, 0, "auth failure → no processed_emails rows");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
