/**
 * Webhook decision test: proves the handler routes provision/suspend through
 * @nseluga/app-core's pure logic. A `past_due` event must map to `suspend`.
 * Run with: corepack pnpm --filter @nseluga/hosted-web-template test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleStripeEvent } from "../lib/webhook.ts";

function evt(status) {
  return {
    type: "customer.subscription.updated",
    status,
    customerId: "cus_123",
    subscriptionId: "sub_456",
  };
}

test("past_due -> suspend", () => {
  const result = handleStripeEvent(evt("past_due"));
  assert.equal(result.decision, "suspend");
  assert.equal(result.customerId, "cus_123");
  assert.equal(result.subscriptionId, "sub_456");
});

test("canceled -> suspend", () => {
  assert.equal(handleStripeEvent(evt("canceled")).decision, "suspend");
});

test("active -> provision", () => {
  assert.equal(handleStripeEvent(evt("active")).decision, "provision");
});

test("trialing -> provision", () => {
  assert.equal(handleStripeEvent(evt("trialing")).decision, "provision");
});
