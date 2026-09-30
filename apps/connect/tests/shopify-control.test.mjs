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
