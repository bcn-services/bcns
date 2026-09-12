import { test } from "node:test";
import assert from "node:assert/strict";
import { siteContent } from "../lib/content.ts";

// W1 — pricing reshape: bcns Connect + Deluxe + consulting
// New structure: Connect ($200/mo), Deluxe ($5,000+$300/mo), Consulting ($1,000/day)

const { tiers } = siteContent.pricing;
const connect = tiers[0];
const deluxe = tiers[1];
const consulting = tiers[2];

test("criterion 1: pricing has three cards; Connect and Deluxe carry their pricing fields", () => {
  assert.equal(tiers.length, 3, "expected exactly three pricing tiers");
  assert.equal(connect.name, "bcns Connect", "first tier should be bcns Connect");
  assert.equal(deluxe.name, "Deluxe build", "second tier should be Deluxe build");
  assert.equal(consulting.name, "AI consulting", "third tier should be AI consulting");

  // Connect: monthly price and no-setup-fee message
  assert.ok(connect.price && connect.price.length > 0, "Connect missing price");
  assert.match(connect.price, /\$200/, "Connect price should include $200");
  assert.ok(!connect.setup, "Connect should not have setup");
  assert.ok(connect.seats && connect.seats.length > 0, "Connect should have seats (no-setup message)");
  assert.match(connect.seats, /[Nn]o setup fee/, "Connect seats field should state 'No setup fee'");

  // Deluxe: setup, monthly, and per-tier recurring
  assert.ok(deluxe.setup && deluxe.setup.length > 0, "Deluxe missing setup");
  assert.ok(deluxe.monthly && deluxe.monthly.length > 0, "Deluxe missing monthly");
  assert.match(deluxe.setup, /\$5,000/, "Deluxe setup should be $5,000");
  assert.match(deluxe.monthly, /\$300/, "Deluxe monthly should be $300");
  // Deluxe doesn't have seats overage like old structure
  assert.ok(!deluxe.seats || deluxe.seats.length === 0, "Deluxe should not have seats overage");
});

test("criterion 2: exact strings appear across pricing registry", () => {
  const blob = JSON.stringify(siteContent.pricing) + JSON.stringify(siteContent.pageMeta?.pricing ?? {});
  for (const s of ["$200", "$1,000", "$5,000", "$300"]) {
    assert.ok(blob.includes(s), `pricing content missing exact string ${s}`);
  }
});

test("criterion 2b: new tier prices match spec", () => {
  assert.match(connect.price, /\$200/, "Connect price should be $200/month");
  assert.match(deluxe.setup, /\$5,000/, "Deluxe setup should be $5,000");
  assert.match(deluxe.monthly, /\$300/, "Deluxe monthly should be $300");
  assert.match(consulting.price, /\$1,000/, "Consulting price should be $1,000/day");
});

test("criterion 3: no old pricing figures anywhere in registry", () => {
  const blob = JSON.stringify(siteContent);
  // Old Standard/Advanced figures gone
  for (const s of ["$1,000 setup", "$149", "$3,000", "$349", "15 users", "$20/user"]) {
    assert.ok(!blob.includes(s), `old pricing figure "${s}" still present`);
  }
  // Old $800/day consulting price replaced
  assert.ok(!blob.match(/\$800\s*\/\s*day/i), "old $800/day consulting price still present");
});

test("criterion 4: no old FAQ cost answer; FAQ reflects new pricing structure", () => {
  // First FAQ item is now "Do you use AI?"
  assert.equal(siteContent.faq.items[0].question, "Do you use AI?");
  // New FAQ items exist to explain the pricing
  const faqText = siteContent.faq.items.map(i => `${i.question} ${i.answer}`).join(" ").toLowerCase();
  assert.ok(/monthly fee|connect.*\$200/.test(faqText), "FAQ should explain the monthly fee and/or Connect pricing");
  assert.ok(!/\$1,000 setup|\$149|\$3,000|\$349|15 users|\$20\/user|1000.*setup/.test(faqText), "FAQ should not contain old pricing structure");
});

test("criterion 5: content.ts has no em-dashes and no banned buzzwords / SaaS / 'we help'", () => {
  const src = readContentSource();
  assert.equal([...src].filter((c) => c === "—").length, 0, "em-dash (—) found in content.ts");
  for (const b of ["SaaS", "we help"]) {
    assert.ok(!src.includes(b), `banned phrase ${b} found in content.ts`);
  }
});

test("consulting tier: renders day-rate price of $1,000", () => {
  assert.equal(consulting.name, "AI consulting");
  assert.match(consulting.price, /\$1,000/, "consulting price should be $1,000/day");
});

test("criterion 1b: pricing.tsx component renders tier prices and optional fields", () => {
  // Registry-only assertions above can't catch a component regression that
  // deletes the <p> tags. Gate the component's render shape too.
  const src = readComponentSource();
  // Headline price is split from setup ?? price; monthly and seats render as their own lines.
  for (const field of ["tier.setup ?? tier.price", "{tier.monthly}", "{tier.seats}"]) {
    assert.ok(src.includes(field), `pricing.tsx no longer renders ${field}`);
  }
  // Consulting's tint panel is keyed on id, not on a missing setup fee (Connect has none either).
  assert.ok(src.includes('tier.id === "consulting"'), "pricing.tsx should branch on the consulting id");

  // If a production build exists, assert the rendered HTML carries Connect pricing
  const html = readBuiltPricingHtml();
  if (html) {
    assert.ok(html.includes("$200"), "built /pricing HTML should include Connect $200/mo");
    assert.ok(html.includes("$5,000"), "built /pricing HTML should include Deluxe $5,000 setup");
    assert.ok(html.includes("$300"), "built /pricing HTML should include Deluxe $300/mo");
    assert.ok(html.includes("$1,000"), "built /pricing HTML should include Consulting $1,000/day");
  }
});

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
function readContentSource() {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "lib", "content.ts"), "utf-8");
}
function readComponentSource() {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "components", "pricing.tsx"), "utf-8");
}
function readBuiltPricingHtml() {
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", ".next", "server", "app", "pricing.html");
  if (!existsSync(p)) return null;
  // Next escapes entities in HTML (e.g. $&#x2F;); unescape the ones we assert on.
  return readFileSync(p, "utf-8").replace(/&#x2F;/g, "/").replace(/&#36;/g, "$");
}
