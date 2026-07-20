/**
 * pricing.test.mjs — Unit tests for the pure billing-math module.
 * Pure Node.js — no test framework. Run with: tsx tests/pricing.test.mjs
 */

import assert from "node:assert/strict";
import {
  INCLUDED_SEATS,
  PER_SEAT_CENTS,
  PRICING,
  formatUsd,
  monthlyCharge,
  setupFeeCents,
} from "../src/pricing.ts";

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

console.log("\nformatUsd");

test("formats whole hundreds of dollars", () => {
  assert.equal(formatUsd(149_00), "$149");
});

test("formats thousands with a separator", () => {
  assert.equal(formatUsd(1_000_00), "$1,000");
});

test("formats the advanced setup fee", () => {
  assert.equal(formatUsd(3_000_00), "$3,000");
});

console.log("\nmonthlyCharge — standard tier");

test("15 seats: no overage", () => {
  const c = monthlyCharge("standard", INCLUDED_SEATS);
  assert.equal(c.overageSeats, 0);
  assert.equal(c.overageCents, 0);
  assert.equal(c.baseCents, PRICING.standard.monthlyCents);
  assert.equal(c.totalCents, PRICING.standard.monthlyCents);
});

test("16 seats: exactly one overage seat", () => {
  const c = monthlyCharge("standard", 16);
  assert.equal(c.overageSeats, 1);
  assert.equal(c.overageCents, PER_SEAT_CENTS);
  assert.equal(c.totalCents, PRICING.standard.monthlyCents + PER_SEAT_CENTS);
});

test("40 seats: 25 overage seats", () => {
  const c = monthlyCharge("standard", 40);
  assert.equal(c.overageSeats, 25);
  assert.equal(c.overageCents, 25 * PER_SEAT_CENTS);
  assert.equal(c.totalCents, PRICING.standard.monthlyCents + 25 * PER_SEAT_CENTS);
});

console.log("\nmonthlyCharge — advanced tier");

test("15 seats: no overage", () => {
  const c = monthlyCharge("advanced", INCLUDED_SEATS);
  assert.equal(c.overageSeats, 0);
  assert.equal(c.overageCents, 0);
  assert.equal(c.totalCents, PRICING.advanced.monthlyCents);
});

test("16 seats: exactly one overage seat", () => {
  const c = monthlyCharge("advanced", 16);
  assert.equal(c.overageSeats, 1);
  assert.equal(c.totalCents, PRICING.advanced.monthlyCents + PER_SEAT_CENTS);
});

test("40 seats: 25 overage seats", () => {
  const c = monthlyCharge("advanced", 40);
  assert.equal(c.overageSeats, 25);
  assert.equal(c.totalCents, PRICING.advanced.monthlyCents + 25 * PER_SEAT_CENTS);
});

console.log("\nmonthlyCharge — input guards");

test("rejects negative seats", () => {
  assert.throws(() => monthlyCharge("standard", -1), /non-negative integer/);
});

test("rejects non-integer seats", () => {
  assert.throws(() => monthlyCharge("standard", 15.5), /non-negative integer/);
});

console.log("\nsetupFeeCents");

test("standard setup fee", () => {
  assert.equal(setupFeeCents("standard"), 1_000_00);
});

test("advanced setup fee", () => {
  assert.equal(setupFeeCents("advanced"), 3_000_00);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
