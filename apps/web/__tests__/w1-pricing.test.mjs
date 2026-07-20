import { test } from "node:test";
import assert from "node:assert/strict";
import { siteContent } from "../lib/content.ts";

// W1 — pricing reshape: setup + recurring monthly + seats
// Criteria 1–5 verified at the registry level (single source of truth).

const { tiers } = siteContent.pricing;
const buildTiers = tiers.slice(0, 2); // Standard + Advanced
const consulting = tiers[2];
const faqCost = siteContent.faq.items[0];

test("criterion 1: pricing has three cards; both build cards carry setup + monthly + seats", () => {
  assert.equal(tiers.length, 3, "expected exactly three pricing tiers");
  for (const t of buildTiers) {
    assert.ok(t.setup && t.setup.length > 0, `${t.name} missing setup`);
    assert.ok(t.monthly && t.monthly.length > 0, `${t.name} missing monthly`);
    assert.ok(t.seats && t.seats.length > 0, `${t.name} missing seats`);
    // seats line names 15 users and the $20 overage
    assert.match(t.seats, /15/, `${t.name} seats missing 15`);
    assert.match(t.seats, /\$20/, `${t.name} seats missing $20 overage`);
  }
});

test("criterion 2: exact strings appear across pricing registry", () => {
  const blob = JSON.stringify(siteContent.pricing) + JSON.stringify(siteContent.pageMeta?.pricing ?? {});
  for (const s of ["$1,000", "$149", "$3,000", "$349", "$20", "15"]) {
    assert.ok(blob.includes(s), `pricing content missing exact string ${s}`);
  }
});

test("criterion 2b: build tiers carry the specific setup + monthly figures", () => {
  const std = buildTiers[0];
  const adv = buildTiers[1];
  assert.match(std.setup, /\$1,000/, "Standard setup should be $1,000");
  assert.match(std.monthly, /\$149/, "Standard monthly should be $149");
  assert.match(adv.setup, /\$3,000/, "Advanced setup should be $3,000");
  assert.match(adv.monthly, /\$349/, "Advanced monthly should be $349");
});

test("criterion 3: no old one-time-only range strings anywhere in registry", () => {
  const blob = JSON.stringify(siteContent);
  for (const s of ["$2,000", "$5,000", "$15,000"]) {
    assert.ok(!blob.includes(s), `old range figure ${s} still present`);
  }
  // no "$X to $Y" range phrasing
  assert.ok(!/\$[\d,]+\s+to\s+\$[\d,]+/.test(blob), "old '$X to $Y' range phrasing still present");
});

test("criterion 4: FAQ cost answer describes setup + monthly + per-seat and drops old figures", () => {
  assert.equal(faqCost.question, "How much will my project cost?");
  const a = faqCost.answer;
  assert.match(a, /setup/i, "answer should mention setup");
  assert.match(a, /month/i, "answer should mention monthly");
  assert.match(a, /15 users/i, "answer should mention per-seat/15 users");
  assert.match(a, /\$20\/user/i, "answer should mention $20/user overage");
  for (const s of ["$2,000", "$5,000", "$15,000"]) {
    assert.ok(!a.includes(s), `FAQ answer still contains ${s}`);
  }
});

test("criterion 5: content.ts has no em-dashes and no banned buzzwords / SaaS / 'we help'", () => {
  const src = readContentSource();
  assert.equal([...src].filter((c) => c === "—").length, 0, "em-dash (—) found in content.ts");
  for (const b of ["SaaS", "we help"]) {
    assert.ok(!src.includes(b), `banned phrase ${b} found in content.ts`);
  }
});

test("consulting tier unchanged: renders a day-rate price", () => {
  assert.equal(consulting.name, "AI consulting");
  assert.match(consulting.price, /\$800/, "consulting price should stay $800/day");
});

test("criterion 1b: pricing.tsx component renders the setup/monthly/seats fields", () => {
  // Registry-only assertions above can't catch a component regression that
  // deletes the <p> tags. Gate the component's render shape too.
  const src = readComponentSource();
  // build-tier branch must render all three recurring-price fields
  for (const field of ["{setup}", "{monthly}", "{seats}"]) {
    assert.ok(src.includes(field), `pricing.tsx no longer renders ${field}`);
  }
  // consulting branch renders the single price
  assert.ok(src.includes("{price}"), "pricing.tsx no longer renders consulting {price}");

  // If a production build exists, assert the rendered HTML carries the six
  // money strings — an un-mocked check that component drift can't fake green.
  const html = readBuiltPricingHtml();
  if (html) {
    for (const s of ["$1,000", "$149", "$3,000", "$349", "$20", "15"]) {
      assert.ok(html.includes(s), `built /pricing HTML missing exact string ${s}`);
    }
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
