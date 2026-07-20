/**
 * qa-app-core.test.mjs — QA edge-case tests beyond the engineer's suite.
 * Pure Node.js — no test framework. Run with: tsx tests/qa-app-core.test.mjs
 *
 * Covers: exact overage math + breakdown fields, seat boundaries, invalid
 * seat inputs, decideAccess status mapping, MissingApiKeyError edge inputs,
 * and that a valid key is passed through to the injected ClientCtor.
 */

import assert from "node:assert/strict";
import {
  INCLUDED_SEATS,
  PER_SEAT_CENTS,
  PRICING,
  monthlyCharge,
  setupFeeCents,
  formatUsd,
} from "../src/pricing.ts";
import { decideAccess, decideFromEvent } from "../src/subscription.ts";
import { createAnthropicClient, MissingApiKeyError, DEFAULT_MODEL } from "../src/anthropic.ts";

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

console.log("\nmonthlyCharge — exact overage math");

// NOTE (QA): The task text states "16 seats standard = 151_00" and
// "40 seats advanced = 399_00". Those totals are arithmetically inconsistent
// with the authoritative rates base 149_00/349_00 + PER_SEAT_CENTS=20_00
// ($20/seat, confirmed by criterion 2's magic-number list). 149_00 + 1*20_00 =
// 169_00, not 151_00. The engineer's code is correct; the task's example
// totals are typos (they'd only hold at $2/seat). We assert the correct math.
test("16 seats standard: base 149_00 + 1*20_00 = 169_00 total", () => {
  const r = monthlyCharge("standard", 16);
  assert.equal(r.baseCents, 149_00);
  assert.equal(r.overageSeats, 1);
  assert.equal(r.overageCents, 20_00);
  assert.equal(r.totalCents, 169_00);
});

test("40 seats advanced: base 349_00 + 25*20_00 = 849_00 total", () => {
  const r = monthlyCharge("advanced", 40);
  assert.equal(r.baseCents, 349_00);
  assert.equal(r.overageSeats, 25);
  assert.equal(r.overageCents, 25 * PER_SEAT_CENTS);
  assert.equal(r.overageCents, 500_00);
  assert.equal(r.totalCents, 849_00);
});

test("breakdown fields echo tier and seats", () => {
  const r = monthlyCharge("standard", 16);
  assert.equal(r.tier, "standard");
  assert.equal(r.seats, 16);
});

test("totalCents always equals baseCents + overageCents", () => {
  for (const tier of ["standard", "advanced"]) {
    for (const seats of [0, 15, 16, 40, 100]) {
      const r = monthlyCharge(tier, seats);
      assert.equal(r.totalCents, r.baseCents + r.overageCents);
    }
  }
});

console.log("\nmonthlyCharge — seat boundaries");

test("exactly 15 seats (INCLUDED_SEATS): overageSeats 0, no overage", () => {
  const r = monthlyCharge("standard", INCLUDED_SEATS);
  assert.equal(r.overageSeats, 0);
  assert.equal(r.overageCents, 0);
  assert.equal(r.totalCents, PRICING.standard.monthlyCents);
});

test("14 seats (below included): overageSeats 0", () => {
  const r = monthlyCharge("advanced", 14);
  assert.equal(r.overageSeats, 0);
  assert.equal(r.overageCents, 0);
});

test("0 seats: base only, no overage", () => {
  const r = monthlyCharge("standard", 0);
  assert.equal(r.overageSeats, 0);
  assert.equal(r.totalCents, PRICING.standard.monthlyCents);
});

console.log("\nmonthlyCharge — invalid seat inputs rejected");

test("negative seats throws", () => {
  assert.throws(() => monthlyCharge("standard", -1), /non-negative integer/);
});

test("non-integer seats throws", () => {
  assert.throws(() => monthlyCharge("standard", 15.5), /non-negative integer/);
});

test("NaN seats throws", () => {
  assert.throws(() => monthlyCharge("standard", NaN), /non-negative integer/);
});

console.log("\nsetupFeeCents / formatUsd sanity");

test("setup fees match PRICING and differ per tier", () => {
  assert.equal(setupFeeCents("standard"), PRICING.standard.setupCents);
  assert.equal(setupFeeCents("advanced"), PRICING.advanced.setupCents);
  assert.notEqual(setupFeeCents("standard"), setupFeeCents("advanced"));
});

test("formatUsd renders the required exact strings", () => {
  assert.equal(formatUsd(149_00), "$149");
  assert.equal(formatUsd(1_000_00), "$1,000");
});

console.log("\ndecideAccess — status mapping");

test("trialing maps to provision", () => {
  assert.equal(decideAccess("trialing"), "provision");
});

test("past_due maps to suspend", () => {
  assert.equal(decideAccess("past_due"), "suspend");
});

test("active provisions, canceled suspends", () => {
  assert.equal(decideAccess("active"), "provision");
  assert.equal(decideAccess("canceled"), "suspend");
});

test("decideFromEvent reads status off the event (trialing -> provision)", () => {
  const decision = decideFromEvent({
    type: "customer.subscription.updated",
    status: "trialing",
    customerId: "cus_1",
    subscriptionId: "sub_1",
  });
  assert.equal(decision, "provision");
});

console.log("\ncreateAnthropicClient — key validation edge cases");

test("empty-string key throws MissingApiKeyError", () => {
  assert.throws(() => createAnthropicClient({ apiKey: "" }), MissingApiKeyError);
});

test("whitespace-only key throws MissingApiKeyError", () => {
  assert.throws(() => createAnthropicClient({ apiKey: "   \t\n " }), MissingApiKeyError);
});

console.log("\ncreateAnthropicClient — key passthrough via injected ctor");

test("valid key is passed through (trimmed) to the injected ClientCtor", () => {
  let receivedOpts = null;
  class FakeCtor {
    constructor(opts) {
      receivedOpts = opts;
    }
  }
  const client = createAnthropicClient(
    { apiKey: "  sk-ant-valid-123  " },
    { ClientCtor: FakeCtor },
  );
  assert.ok(client instanceof FakeCtor, "returns instance of injected ctor");
  assert.equal(receivedOpts.apiKey, "sk-ant-valid-123", "key trimmed and forwarded");
});

test("defaults model to DEFAULT_MODEL, honors explicit override", () => {
  class FakeCtor {
    constructor() {}
  }
  const def = createAnthropicClient({ apiKey: "sk-x" }, { ClientCtor: FakeCtor });
  assert.equal(def.defaultModel, DEFAULT_MODEL);
  const override = createAnthropicClient(
    { apiKey: "sk-x", model: "claude-opus-4-6" },
    { ClientCtor: FakeCtor },
  );
  assert.equal(override.defaultModel, "claude-opus-4-6");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
