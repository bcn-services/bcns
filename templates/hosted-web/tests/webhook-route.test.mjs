/**
 * Route-level security tests for the Stripe webhook (fail-closed behavior).
 * Exercises the App Router POST handler directly. Run with:
 *   corepack pnpm --filter @bcns/hosted-web-template test
 *
 * Covers the A2 security fix:
 *  - STRIPE_WEBHOOK_SECRET SET + no real signature → REFUSED (501), decision NOT reached.
 *  - STRIPE_WEBHOOK_SECRET UNSET → processes event, honest unverified markers,
 *    correct provision/suspend decision through @bcns/app-core.
 *  - Malformed body is still guarded (400) on the dev path.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/stripe/webhook/route.ts";

function req(body) {
  return new Request("http://localhost:3100/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function evt(status) {
  return {
    type: "customer.subscription.updated",
    status,
    customerId: "cus_route",
    subscriptionId: "sub_route",
  };
}

/** Run fn with STRIPE_WEBHOOK_SECRET forced to a value (or deleted), then restore. */
async function withSecret(value, fn) {
  const saved = process.env.STRIPE_WEBHOOK_SECRET;
  if (value === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = saved;
  }
}

test("secret SET + no valid signature -> refused (501), decision NOT reached", async () => {
  await withSecret("whsec_configured_but_unverified", async () => {
    const res = await POST(req(evt("past_due")));
    assert.equal(res.status, 501, "must refuse when a signing secret is configured");
    const json = await res.json();
    // Refusal must not leak a provision/suspend decision or a verified claim.
    assert.equal(json.decision, undefined, "no decision on the refused path");
    assert.equal(json.signatureVerified, undefined, "no verified claim on refusal");
    assert.match(json.error, /signature verification not wired/i);
  });
});

test("secret UNSET -> suspend for past_due with honest unverified markers", async () => {
  await withSecret(undefined, async () => {
    const res = await POST(req(evt("past_due")));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.decision, "suspend");
    assert.equal(json.customerId, "cus_route");
    assert.equal(json.signatureVerified, false, "never claim a signature was verified");
    assert.equal(json.mode, "unverified-dev", "response marked unverified-dev");
  });
});

test("secret UNSET -> provision for active", async () => {
  await withSecret(undefined, async () => {
    const res = await POST(req(evt("active")));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.decision, "provision");
    assert.equal(json.signatureVerified, false);
  });
});

test("secret UNSET -> malformed body is still guarded (400)", async () => {
  await withSecret(undefined, async () => {
    const res = await POST(req({ nope: true }));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.decision, undefined);
  });
});

test("no response ever reports signatureVerified: true", async () => {
  for (const secret of ["whsec_x", undefined]) {
    await withSecret(secret, async () => {
      const res = await POST(req(evt("active")));
      const json = await res.json();
      assert.notEqual(json.signatureVerified, true, "the route must never claim verified");
    });
  }
});
