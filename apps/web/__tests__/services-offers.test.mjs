// /services has a lead block per offer: id, price, CTA; no retired tiers or "local".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { siteContent } from "../lib/content.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(resolve(root, "app/services/page.tsx"), "utf8");
const intro = readFileSync(resolve(root, "components/offer-intro.tsx"), "utf8");
const items = siteContent.offers.items;

test("offers: ids and prices", () => {
  assert.deepEqual(items.map((o) => o.id), ["connect", "deluxe", "ai-consult"]);
  assert.match(items[0].price, /\$200 \/ month, no setup fee/);
  assert.match(items[1].price, /\$5,000 setup \+ \$300 \/ month on top of Connect/);
  assert.match(items[2].price, /\$1,000 \/ day/);
});

test("each offer has heading, description, audience, cta", () => {
  for (const o of items) for (const k of ["title", "description", "audience", "cta"]) assert.ok(o[k].length > 0, `${o.id}.${k}`);
});

test("/services renders all three offers; CTA links to /#contact; ids unique", () => {
  assert.equal((page.match(/<OfferIntro /g) ?? []).length, 3);
  assert.ok(intro.includes('href="/#contact"') && intro.includes("id={id}"));
  assert.ok(!page.includes('id="connect"') && !page.includes('id="ai-consult"'));
});

test("offers copy has no Standard/Advanced/local", () => {
  const text = JSON.stringify(siteContent.offers);
  assert.doesNotMatch(text, /standard|advanced|\blocal\b/i);
});

test("CONTENT.md documents offers", () => {
  assert.ok(readFileSync(resolve(root, "CONTENT.md"), "utf8").includes("siteContent.offers"));
});
