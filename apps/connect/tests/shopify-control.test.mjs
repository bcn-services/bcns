import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shopifyControl } from "../lib/sources.ts";

const SHOP = "fa8a00-11.myshopify.com";
test("valid ?shop= and no error: hidden-input form; Reconnect when a row exists", () => {
  assert.deepEqual(shopifyControl({ status: "none" }, SHOP, undefined, "h"), { kind: "form", shop: SHOP, label: `Connect ${SHOP}` });
  assert.equal(shopifyControl({ status: "auth_failed" }, SHOP, undefined, "h").label, `Reconnect ${SHOP}`);
});
test("error or invalid shop falls through", () => {
  assert.equal(shopifyControl({ status: "none" }, SHOP, "connect-failed", "h").kind, "install");
  assert.equal(shopifyControl({ status: "none" }, SHOP, "connect-expired", "h").kind, "install");
  assert.equal(shopifyControl({ status: "never_ran" }, "evil.com", undefined, "h").kind, "reconnect-in-shopify");
});
test("stored row: reconnect in Shopify; no row: install link or plain text", () => {
  assert.deepEqual(shopifyControl({ status: "never_ran" }, undefined, undefined, "h"), { kind: "reconnect-in-shopify" });
  assert.deepEqual(shopifyControl({ status: "none" }, undefined, undefined, "bcns-connect"), { kind: "install", url: "https://apps.shopify.com/bcns-connect" });
  assert.deepEqual(shopifyControl({ status: "none" }, undefined, undefined, null), { kind: "install", url: null });
});
test("page.tsx has no text input named shop; Non-Shopify forms still POST", () => {
  const src = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /type="text"/);
  assert.doesNotMatch(src, /name="shop"\s+required/);
  assert.match(src, /method="POST"/);
});
test("web terms no longer say billed by bcns", () => {
  assert.doesNotMatch(readFileSync(new URL("../../web/lib/content.ts", import.meta.url), "utf8"), /billed by bcns/);
});
test("page.tsx: hidden shop input, Shopify branch under owner+connectPath gate, Request connection fallback, no typed-domain copy", () => {
  const src = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(src, /<input type="hidden" name="shop" value=\{ctl\.shop\} \/>/);
  assert.equal((src.match(/name="shop"/g) ?? []).length, 1);
  assert.doesNotMatch(src, /<input[^>]*name="shop"[^>]*type="(text|search|url)"|<input(?![^>]*type="hidden")[^>]*name="shop"/);
  const gate = src.indexOf('connectPath(config, card.source) && membership.role === "owner"');
  const shopify = src.indexOf("<ShopifyControlView");
  const fallback = src.indexOf("requestConnectionAction}>");
  assert.ok(gate > 0 && gate < shopify && shopify < fallback, "Shopify control must sit inside the owner+connectPath branch, before the Request connection fallback");
  assert.doesNotMatch(src, /(type|enter|paste)[^"\n]{0,20}(shop|store) (domain|name)/i);
  assert.doesNotMatch(src, /Enter your (shop|store)/i);
});
test("page.tsx: Shopify install is a Connect button to the App Store in a new tab; no handle stays plain text; every card links its guide", () => {
  const src = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const view = src.slice(src.indexOf("function ShopifyControlView"));
  const link = view.match(/<a[^>]*href=\{ctl\.url\}[^>]*>/)?.[0] ?? "";
  assert.match(link, /className="btn btn-out btn-sm"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  // url null: the fallback after ") : (" is the text paragraph, not a link.
  const fallback = view.slice(view.indexOf(") : (", view.indexOf("href={ctl.url}")));
  assert.doesNotMatch(fallback, /<a[\s>]/);
  assert.match(fallback, /Install bcns Connect from the Shopify App Store/);
  // The per-card guide link is gone: guides live on /guide and the source page.
  assert.doesNotMatch(src, /How to connect|#how/);
});
test("page.tsx: every card's title links to its source page, connected or not (whole-card stretched link)", () => {
  const src = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /card\.connected \? <a href=\{`\/sources\//);
  assert.equal((src.match(/<a href=\{`\/sources\/\$\{card\.source\}`\}>\{card\.title\}<\/a>/g) ?? []).length, 2, "cards view and rows view");
  assert.match(src, /<a className="btn btn-out btn-sm" href="\/guide">\s*Connection guide/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.grid-src \.sc-t a::after \{[^}]*position: absolute; inset: 0/);
  assert.match(css, /\.grid-src \.sc \{ position: relative; \}/);
  assert.match(css, /\.grid-src \.sc-f > :is\(form, details, a, button\)[^{]*\{ position: relative; z-index: 1; \}/);
  assert.match(css, /\.grid-src \.sc-t a:focus-visible::after/);
});
