/**
 * subscription.test.mjs — Unit tests for the access-decision module.
 * Run with: tsx tests/subscription.test.mjs
 */

import assert from "node:assert/strict";
import { decideAccess, decideFromEvent } from "../src/subscription.ts";

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

console.log("\ndecideAccess");

test("active -> provision", () => {
  assert.equal(decideAccess("active"), "provision");
});

test("trialing -> provision", () => {
  assert.equal(decideAccess("trialing"), "provision");
});

test("past_due -> suspend", () => {
  assert.equal(decideAccess("past_due"), "suspend");
});

test("canceled -> suspend", () => {
  assert.equal(decideAccess("canceled"), "suspend");
});

console.log("\ndecideFromEvent");

test("reads status off a Stripe event", () => {
  const event = {
    type: "customer.subscription.updated",
    status: "past_due",
    customerId: "cus_123",
    subscriptionId: "sub_456",
  };
  assert.equal(decideFromEvent(event), "suspend");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
