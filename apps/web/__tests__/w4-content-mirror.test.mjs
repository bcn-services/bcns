// W4 — CONTENT.md mirrors content.ts 1:1 for the new pricing + FAQ content.
// Registry-value → CONTENT.md presence. Loads the real siteContent (strip-types)
// so the asserted values are the ground truth, not hardcoded literals.
// Run: node --experimental-strip-types --test __tests__/w4-content-mirror.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteContent } from "../lib/content.ts";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentMd = readFileSync(resolve(__dirname, "..", "CONTENT.md"), "utf8");

// --- New pricing fields (setup / monthly / seats) on the two build tiers ---
// Values come straight from the registry so the test tracks content.ts drift.
const buildTiers = siteContent.pricing.tiers.filter(
  (t) => t.setup || t.monthly || t.seats,
);

test("two build tiers carry the new setup/monthly/seats fields", () => {
  assert.equal(buildTiers.length, 2, "expected setup/monthly/seats on 2 tiers");
});

for (const tier of buildTiers) {
  for (const key of ["setup", "monthly", "seats"]) {
    const value = tier[key];
    test(`CONTENT.md documents pricing value: ${tier.name}.${key} = "${value}"`, () => {
      assert.ok(
        typeof value === "string" && value.length > 0,
        `registry ${tier.name}.${key} should be a non-empty string`,
      );
      assert.ok(
        contentMd.includes(value),
        `CONTENT.md is missing the ${key} value "${value}" for ${tier.name}`,
      );
    });
  }
}

// Spot-check the concrete headline numbers are present (defends against a
// CONTENT.md that documents field names but not the migrated $1,000/$3,000 etc).
for (const literal of ["$1,000", "$149/mo", "$3,000", "$349/mo", "15 users", "$20/user"]) {
  test(`CONTENT.md contains pricing literal: ${literal}`, () => {
    assert.ok(contentMd.includes(literal), `CONTENT.md missing "${literal}"`);
  });
}

// --- The 3 new W3 FAQ questions (monthly-fee coverage, BYO Anthropic key, stop-paying) ---
const newFaqQuestions = [
  "What does the monthly fee cover?",
  "Does my tool use AI, and how does that get billed?",
  "What happens if I stop paying the monthly fee?",
];

test("all 3 new FAQ questions exist in the registry", () => {
  const registryQuestions = siteContent.faq.items.map((i) => i.question);
  for (const q of newFaqQuestions) {
    assert.ok(registryQuestions.includes(q), `registry faq missing question: ${q}`);
  }
});

for (const q of newFaqQuestions) {
  test(`CONTENT.md documents new FAQ question: "${q}"`, () => {
    assert.ok(contentMd.includes(q), `CONTENT.md missing FAQ question "${q}"`);
  });
}

// The hosting / BYOK / stop-paying concepts should be reflected in CONTENT.md prose.
for (const concept of ["hosting", "Anthropic key", "export"]) {
  test(`CONTENT.md reflects FAQ concept: ${concept}`, () => {
    assert.ok(
      contentMd.toLowerCase().includes(concept.toLowerCase()),
      `CONTENT.md missing concept "${concept}"`,
    );
  });
}
