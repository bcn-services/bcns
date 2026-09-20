/**
 * Pure composition of the Sources page: health rows in, card models out.
 * No Supabase, no env — composeSources is a total function over rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUB_SOURCES,
  composeSources,
  dashboardUrl,
  egressLine,
  formatBytes,
  truncate,
} from "../lib/sources.ts";

test("one card per hub source, in order, and never 'platform'", () => {
  const cards = composeSources([{ source: "platform", status: "ok", last_success_at: null, last_error: null }]);
  assert.deepEqual(
    cards.map((c) => c.source),
    [...HUB_SOURCES]
  );
  assert.ok(!HUB_SOURCES.includes("platform"));
});

test("a source with no health row reads as Not connected", () => {
  const [shopify] = composeSources([]);
  assert.equal(shopify.status, "none");
  assert.equal(shopify.connected, false);
  assert.equal(shopify.label, "Not connected");
  assert.equal(shopify.tone, "idle");
  assert.equal(shopify.lastSuccessAt, null);
});

test("never_ran is a row that exists but has not pulled: still Not connected", () => {
  const cards = composeSources([
    { source: "meta", status: "never_ran", last_success_at: null, last_error: null },
  ]);
  const meta = cards.find((c) => c.source === "meta");
  assert.equal(meta.connected, false);
  assert.equal(meta.label, "Not connected");
});

test("auth_failed is not connected, so the card keeps its Connect form", () => {
  const cards = composeSources([
    { source: "shopify", status: "auth_failed", last_success_at: null, last_error: null },
  ]);
  const shopify = cards.find((c) => c.source === "shopify");
  assert.equal(shopify.label, "Reconnect needed");
  // page.tsx renders the Connect form only when connected is false. A card that
  // says "Reconnect needed" and reports connected:true has no way to reconnect.
  assert.equal(shopify.connected, false);
});

test("ok is connected and carries last success through", () => {
  const cards = composeSources([
    { source: "shopify", status: "ok", last_success_at: "2026-09-16T04:00:00Z", last_error: null },
  ]);
  const shopify = cards.find((c) => c.source === "shopify");
  assert.equal(shopify.connected, true);
  assert.equal(shopify.label, "Connected");
  assert.equal(shopify.tone, "ok");
  assert.equal(shopify.lastSuccessAt, "2026-09-16T04:00:00Z");
});

test("every health_status maps to a label, and an unknown one degrades to error", () => {
  const rows = [
    { source: "shopify", status: "stale", last_success_at: null, last_error: null },
    { source: "meta", status: "auth_failed", last_success_at: null, last_error: null },
    { source: "monday", status: "error", last_success_at: null, last_error: null },
    { source: "meet", status: "teleported", last_success_at: null, last_error: null },
  ];
  const by = Object.fromEntries(composeSources(rows).map((c) => [c.source, c]));
  assert.equal(by.shopify.label, "Stale");
  assert.equal(by.shopify.tone, "warn");
  assert.equal(by.meta.label, "Reconnect needed");
  assert.equal(by.monday.tone, "error");
  assert.equal(by.meet.status, "error");
  assert.equal(by.meet.connected, true);
});

test("last_error is flattened and truncated", () => {
  const long = `boom\n  ${"x".repeat(400)}`;
  const cards = composeSources([
    { source: "monday", status: "error", last_success_at: null, last_error: long },
  ]);
  const monday = cards.find((c) => c.source === "monday");
  assert.equal(monday.lastError.length, 140);
  assert.ok(monday.lastError.startsWith("boom x"));
  assert.ok(monday.lastError.endsWith("…"));
  assert.equal(truncate("   "), null);
  assert.equal(truncate(null), null);
});

test("app_url wins over the subdomain convention", () => {
  assert.equal(dashboardUrl({ slug: "acme", app_url: "https://acme.example.com" }), "https://acme.example.com");
});

test("a row with no app_url column at all falls back to the convention", () => {
  // `select("*")` against a database that has not run 20260916000100 yet.
  assert.equal(dashboardUrl({ name: "Acme", slug: "acme" }), "https://acme.bcn-services.com");
  assert.equal(dashboardUrl({ slug: "acme", app_url: null }), "https://acme.bcn-services.com");
  assert.equal(dashboardUrl({ slug: "acme", app_url: "  " }), "https://acme.bcn-services.com");
});

test("no client row and no slug means no dashboard link", () => {
  assert.equal(dashboardUrl(null), null);
  assert.equal(dashboardUrl({ name: "Acme" }), null);
});

test("formatBytes climbs units and never prints a negative", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(null), "0 B");
  assert.equal(formatBytes(-5), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(10 * 1024 ** 3), "10.0 GB");
});

test("egressLine reads as usage, and says so when the quota is blown", () => {
  assert.equal(egressLine(null), null);
  assert.equal(
    egressLine({ bytes_used: 1024 ** 3, quota_bytes: 10 * 1024 ** 3, exceeded: false }),
    "1.0 GB of 10.0 GB used this month"
  );
  assert.ok(egressLine({ bytes_used: 11, quota_bytes: 10, exceeded: true }).endsWith("quota exceeded"));
});
