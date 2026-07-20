/**
 * fix-app-core.test.mjs — Regression tests for the A1 review fixes:
 *   1. PRICING deep-freeze (runtime immutability of the shared source-of-truth)
 *   2. formatUsd renders exact cents when present, bare whole dollars otherwise
 *   3. formatUsd rejects non-finite input; negatives format as credits
 * Pure Node.js — no test framework. Run with: tsx tests/fix-app-core.test.mjs
 */

import assert from "node:assert/strict";
import { PRICING, formatUsd } from "../src/pricing.ts";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log("\nPRICING deep-freeze (runtime immutability)");

test("the PRICING map itself is frozen", () => {
  assert.equal(Object.isFrozen(PRICING), true);
});

test("each nested tier object is frozen", () => {
  assert.equal(Object.isFrozen(PRICING.standard), true);
  assert.equal(Object.isFrozen(PRICING.advanced), true);
});

test("mutating a nested tier field throws in strict mode and leaves it intact", () => {
  // This module is an ESM file, so strict mode is in force: the assignment throws.
  assert.throws(() => {
    PRICING.standard.monthlyCents = 1;
  }, TypeError);
  assert.equal(PRICING.standard.monthlyCents, 149_00);
});

test("adding/replacing a tier on the map throws and leaves it intact", () => {
  assert.throws(() => {
    PRICING.advanced = { setupCents: 0, monthlyCents: 0 };
  }, TypeError);
  assert.equal(PRICING.advanced.monthlyCents, 349_00);
  assert.equal(PRICING.advanced.setupCents, 3_000_00);
});

console.log("\nformatUsd — cents vs whole dollars");

test("renders exact cents when present", () => {
  assert.equal(formatUsd(149_99), "$149.99");
});

test("renders sub-dollar cents with leading zero", () => {
  assert.equal(formatUsd(49), "$0.49");
  assert.equal(formatUsd(105), "$1.05");
});

test("whole-dollar cases stay bare (existing-test contract)", () => {
  assert.equal(formatUsd(149_00), "$149");
  assert.equal(formatUsd(1_000_00), "$1,000");
  assert.equal(formatUsd(0), "$0");
});

console.log("\nformatUsd — guards & negatives");

test("throws on NaN", () => {
  assert.throws(() => formatUsd(NaN), /finite number/);
});

test("throws on Infinity / -Infinity", () => {
  assert.throws(() => formatUsd(Infinity), /finite number/);
  assert.throws(() => formatUsd(-Infinity), /finite number/);
});

test("formats negatives as credits (whole and with cents)", () => {
  assert.equal(formatUsd(-20_00), "-$20");
  assert.equal(formatUsd(-149_99), "-$149.99");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
