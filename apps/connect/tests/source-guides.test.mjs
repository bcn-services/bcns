import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES, GUIDE_FOOTER } from "../lib/source-guides.ts";
import { HUB_SOURCES } from "../lib/sources.ts";

const text = (g) => [g.intro, ...g.steps, g.after].join("\n");

test("one guide per hub source, no extras", () => {
  assert.deepEqual(Object.keys(GUIDES).sort(), [...HUB_SOURCES].sort());
  assert.deepEqual([...HUB_SOURCES], ["shopify", "meta", "monday", "meet", "drive", "quickbooks"]);
});
test("each guide has 1 to 6 steps, all non-empty", () => {
  for (const [source, g] of Object.entries(GUIDES)) {
    assert.ok(g.steps.length >= 1 && g.steps.length <= 6, `${source}: ${g.steps.length} steps`);
    for (const s of [g.intro, g.after, ...g.steps]) assert.ok(s.trim().length > 0, `${source}: empty copy`);
  }
});
test("plain English: no OAuth, token or scope wording", () => {
  for (const [source, g] of Object.entries(GUIDES)) assert.doesNotMatch(text(g), /oauth|token|scope/i, source);
  assert.doesNotMatch(GUIDE_FOOTER, /oauth|token|scope/i);
});
test("Shopify guide never mentions a store domain (App Store rule 2.3.1)", () => {
  assert.doesNotMatch(text(GUIDES.shopify), /domain|myshopify/i);
  assert.match(GUIDES.shopify.steps[0], /App Store/);
});
test("QuickBooks: the company is chosen on Intuit's screen, there is no hub picker step", () => {
  assert.equal(GUIDES.quickbooks.steps[2], "If Intuit asks which company to use, choose it, then approve.");
});
test("the #how link on the cards targets the guide's id", () => {
  const guide = readFileSync(new URL("../app/source-guide.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const anchor = page.match(/\/sources\/\$\{card\.source\}#([a-z-]+)/)?.[1];
  assert.equal(anchor, "how");
  assert.ok(guide.includes(`id="${anchor}"`));
});
