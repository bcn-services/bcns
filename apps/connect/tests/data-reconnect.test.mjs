/**
 * /data for an auth_failed ("Reconnect needed") source: stored rows still show, with a reconnect
 * notice, and no empty state ever says "Connected" for it. Pure/unit, like data.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HubNav } from "../app/nav.tsx";
import { hasStoredData, noDataCopy, reconnectNotice } from "../lib/data-views.ts";
import { composeSources } from "../lib/sources.ts";

const row = (source, status, extra = {}) => ({ source, status, last_success_at: null, last_error: null, ...extra });
const card = (source, status, extra) => composeSources([row(source, status, extra)]).find((c) => c.source === source);

test("auth_failed is a data tab like a connected one; never_ran and none are not", () => {
  assert.equal(hasStoredData(card("shopify", "auth_failed")), true);
  assert.equal(hasStoredData(card("shopify", "ok")), true);
  assert.equal(hasStoredData(card("shopify", "stale")), true);
  assert.equal(hasStoredData(card("shopify", "never_ran")), false);
  assert.equal(hasStoredData(card("shopify", null)), false);
});

test("the only-Shopify auth_failed tenant has a data tab (the /data page filters on hasStoredData)", () => {
  const cards = composeSources([row("shopify", "auth_failed")]);
  assert.deepEqual(cards.filter(hasStoredData).map((c) => c.source), ["shopify"]);
  const src = readFileSync(new URL("../app/data/page.tsx", import.meta.url), "utf8");
  assert.match(src, /cards\.filter\(hasStoredData\)/);
  assert.doesNotMatch(src, /cards\.filter\(\(c\) => c\.connected\)/);
});

test("reconnect notice names the source, points at stored data and the Sources page", () => {
  const text = reconnectNotice("Shopify");
  assert.match(text, /bcns lost access to Shopify/);
  assert.match(text, /Your stored data is below/);
  assert.match(text, /reconnect on the Sources page to resume syncing/);
});

test("auth_failed with no rows: reconnect copy, never 'Connected'", () => {
  const copy = noDataCopy(card("shopify", "auth_failed"));
  assert.equal(copy.title, "Reconnect needed");
  assert.match(copy.message, /lost access to Shopify/);
  assert.doesNotMatch(`${copy.title} ${copy.message}`, /Connected|first sync/);
});

test("never_ran: first sync in progress", () => {
  const copy = noDataCopy(card("shopify", "never_ran"));
  assert.equal(copy.title, "Connected, first sync in progress");
  assert.match(copy.message, /starts within the hour/);
});

test("none: Not connected", () => {
  const copy = noDataCopy(card("shopify", null));
  assert.equal(copy.title, "Not connected");
  assert.match(copy.message, /Connect a source/);
  assert.doesNotMatch(`${copy.title} ${copy.message}`, /Connected/);
});

test("hub card keeps the connector's reason under 'Reconnect needed', flattened and short", () => {
  const c = card("shopify", "auth_failed", { last_error: `Shopify refused\nthe token ${"x".repeat(300)}` });
  assert.equal(c.label, "Reconnect needed");
  assert.match(c.lastError, /^Shopify refused the token x+…$/);
  assert.ok(c.lastError.length <= 140);
});

test("top bar links 'Your data' for a client with no app_url, whatever the source health", () => {
  const html = renderToStaticMarkup(createElement(HubNav, { client: { name: "Acme", slug: "acme", app_url: null }, role: "owner" }));
  assert.match(html, /href="\/data"[^>]*>Your data</);
});
