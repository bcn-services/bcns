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

// --- Pricing fields (setup / monthly / seats) on the tiers that carry them ---
// Values come straight from the registry so the test tracks content.ts drift.
const buildTiers = siteContent.pricing.tiers.filter(
  (t) => t.setup || t.monthly || t.seats,
);

test("Connect and Deluxe carry setup/monthly/seats fields", () => {
  assert.deepEqual(buildTiers.map((t) => t.id), ["connect", "deluxe"]);
});

for (const tier of buildTiers) {
  // Connect has no setup fee and Deluxe no seats line, so only check keys the tier defines.
  for (const key of ["setup", "monthly", "seats"].filter((k) => k in tier)) {
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

// Spot-check the new pricing literals are present (bcns Connect + Deluxe + Consulting).
for (const literal of ["$200", "$5,000", "$300", "$1,000"]) {
  test(`CONTENT.md contains pricing literal: ${literal}`, () => {
    assert.ok(contentMd.includes(literal), `CONTENT.md missing "${literal}"`);
  });
}

// --- Key FAQ questions relevant to pricing/hosting explanation ---
const keyFaqQuestions = [
  "What does the monthly fee cover?",
  "Does my tool use AI?",
  "What happens if I want to cancel?",
];

test("key FAQ questions exist in the registry", () => {
  const registryQuestions = siteContent.faq.items.map((i) => i.question);
  for (const q of keyFaqQuestions) {
    assert.ok(registryQuestions.includes(q), `registry faq missing question: ${q}`);
  }
});

for (const q of keyFaqQuestions) {
  test(`CONTENT.md documents FAQ question: "${q}"`, () => {
    assert.ok(contentMd.includes(q), `CONTENT.md missing FAQ question "${q}"`);
  });
}

// The hosting / data-export concepts should be reflected in CONTENT.md prose.
for (const concept of ["hosting", "export"]) {
  test(`CONTENT.md reflects FAQ concept: ${concept}`, () => {
    assert.ok(
      contentMd.toLowerCase().includes(concept.toLowerCase()),
      `CONTENT.md missing concept "${concept}"`,
    );
  });
}
