/**
 * /data for an auth_failed ("Reconnect needed") source: stored rows still show, with a reconnect
 * notice, and no empty state ever says "Connected" for it. Pure/unit, like data.test.mjs.
 * The page's decisions live in composeDataPage (lib/data-views.ts); page.tsx must use them,
 * which the source-inspection test pins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HubNav } from "../app/nav.tsx";
import { composeDataPage, hasStoredData, noDataCopy } from "../lib/data-views.ts";
import { composeSources } from "../lib/sources.ts";

const row = (source, status, extra = {}) => ({ source, status, last_success_at: null, last_error: null, ...extra });
const cardsOf = (...rows) => composeSources(rows);
const shopifyOnly = (status, extra) => cardsOf(row("shopify", status, extra));

test("auth_failed is a data source like a connected one; never_ran and none are not", () => {
  const has = (status) => hasStoredData(shopifyOnly(status)[0]);
  assert.equal(has("auth_failed"), true);
  assert.equal(has("ok"), true);
  assert.equal(has("stale"), true);
  assert.equal(has("never_ran"), false);
  assert.equal(has(null), false);
});

test("auth_failed + rows: active tab, page fetched, notice says the stored data is below", () => {
  const page = composeDataPage(shopifyOnly("auth_failed", { last_success_at: "2026-09-20T04:00:00Z" }), { activeEmpty: false });
  assert.equal(page.card?.source, "shopify");
  assert.equal(page.fetchesPage, true);
  assert.deepEqual(page.tabs.map((c) => c.source), ["shopify"]);
  assert.equal(page.notices.length, 1);
  assert.match(page.notices[0].text, /bcns lost access to Shopify\. Your stored data is below; reconnect on the Sources page to resume syncing\./);
  assert.equal(page.emptyCopy, null);
  assert.equal(page.syncLine, "Shopify last synced 2026-09-20 04:00 UTC");
});

test("auth_failed + zero unfiltered rows: 'No stored data', notice does not claim data is below", () => {
  const page = composeDataPage(shopifyOnly("auth_failed"), { activeEmpty: true });
  assert.equal(page.fetchesPage, true);
  assert.equal(page.emptyCopy?.title, "No stored data");
  assert.match(page.emptyCopy.message, /Reconnect the source/);
  assert.match(page.notices[0].text, /Reconnect on the Sources page to sync your data\./);
  assert.doesNotMatch(page.notices[0].text, /below/);
  const all = `${page.emptyCopy.title} ${page.emptyCopy.message} ${page.notices[0].text}`;
  assert.doesNotMatch(all, /Connected|first sync/);
});

test("a notice per auth_failed source with stored data, not only the active tab", () => {
  const cards = cardsOf(row("shopify", "auth_failed"), row("meta", "auth_failed"), row("monday", "ok"));
  const page = composeDataPage(cards, { wanted: "meta" });
  assert.equal(page.card?.source, "meta");
  assert.deepEqual(page.notices.map((n) => n.source), ["shopify", "meta"]);
  assert.match(page.notices[0].text, /Shopify\. Reconnect on the Sources page to resume syncing\./, "other tab: no claim about rows");
  assert.match(page.notices[1].text, /Your stored data is below/);
  assert.equal(composeDataPage(cardsOf(row("shopify", "ok")), {}).notices.length, 0, "connected source has no notice");
});

test("never_ran: nothing fetched, 'Connected, first sync in progress'", () => {
  const page = composeDataPage(shopifyOnly("never_ran"), {});
  assert.equal(page.card, null);
  assert.equal(page.fetchesPage, false);
  assert.equal(page.emptyCopy.title, "Connected, first sync in progress");
  assert.match(page.emptyCopy.message, /starts within the hour/);
  assert.deepEqual(page.notices, []);
});

test("never_ran tab next to a connected source shows the pending copy and fetches nothing", () => {
  const page = composeDataPage(cardsOf(row("shopify", "ok"), row("meta", "never_ran")), { wanted: "meta" });
  assert.equal(page.card.source, "meta");
  assert.equal(page.fetchesPage, false);
  assert.equal(page.emptyCopy.title, "Connected, first sync in progress");
});

test("no health rows: 'Not connected', no tabs", () => {
  const page = composeDataPage(cardsOf(), {});
  assert.equal(page.card, null);
  assert.equal(page.tabs.length, 0);
  assert.equal(page.emptyCopy.title, "Not connected");
  assert.match(page.emptyCopy.message, /Connect a source/);
  assert.doesNotMatch(`${page.emptyCopy.title} ${page.emptyCopy.message}`, /Connected/);
  assert.equal(noDataCopy({ connected: false, status: "none" }).title, "Not connected");
});

test("sync line: 'never synced' when no success yet, never 'last synced never'", () => {
  const page = composeDataPage(cardsOf(row("shopify", "auth_failed"), row("meta", "ok", { last_success_at: "2026-09-01T04:00:00Z" })), {});
  assert.equal(page.syncLine, "Shopify never synced · Meta Ads synced 2026-09-01 04:00 UTC");
  assert.doesNotMatch(page.syncLine, /never$|last synced never/);
});

test("page.tsx routes through composeDataPage, hides Export CSV at zero rows, and no longer gates on connected", () => {
  const src = readFileSync(new URL("../app/data/page.tsx", import.meta.url), "utf8");
  assert.match(src, /composeDataPage\(cards, \{ wanted, timezone \}\)/);
  assert.match(src, /plan\.fetchesPage \? fetchPage/);
  assert.match(src, /view\.notices\.map/);
  assert.match(src, /view\.syncLine/);
  assert.match(src, /activeEmpty:/);
  assert.match(src, /result\.count > 0 \? \(\s*<a href=\{exportHref\}/);
  assert.doesNotMatch(src, /c\.connected\)/);
  assert.doesNotMatch(src, /state\.kind === "ready"/);
});

test("hub card keeps the connector's reason under 'Reconnect needed', flattened and short", () => {
  const c = shopifyOnly("auth_failed", { last_error: `Shopify refused\nthe token ${"x".repeat(300)}` })[0];
  assert.equal(c.label, "Reconnect needed");
  assert.match(c.lastError, /^Shopify refused the token x+…$/);
  assert.ok(c.lastError.length <= 140);
});

test("top bar links 'Your data' for a client with no app_url, whatever the source health", () => {
  const html = renderToStaticMarkup(createElement(HubNav, { client: { name: "Acme", slug: "acme", app_url: null }, role: "owner" }));
  assert.match(html, /href="\/data"[^>]*>Your data</);
});
