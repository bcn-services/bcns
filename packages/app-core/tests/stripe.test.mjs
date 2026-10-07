/**
 * Stripe billing (item 1): the signature verifier and the event -> status decision.
 * Run with: pnpm --filter @bcn-services/app-core test
 *
 * Fixtures under tests/fixtures/stripe are hand-written in Stripe's documented event shape
 * (README there); they are signed here at runtime with a throwaway secret.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { processWebhook, createMemoryEventStore, stripeVerifier, verifyStripeSignature, STRIPE_TOLERANCE_SEC } from "../src/webhooks.ts";
import { billingSignal, decideBilling, billingView, canStartCheckout, GRACE_SECONDS } from "../src/subscription.ts";

const SECRET = "whsec_test_fixture_secret";
const NOW = 1790000000;
const fixture = (name) => readFileSync(new URL(`./fixtures/stripe/${name}.json`, import.meta.url), "utf8");
const sign = (body, t = NOW, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const BODY = fixture("checkout.session.completed");

test("stripe verifier: accepts a correctly signed body, also when one of several v1 values matches", () => {
  assert.equal(verifyStripeSignature(BODY, sign(BODY), SECRET, { now: NOW }), true);
  const good = sign(BODY).split(",")[1];
  assert.equal(verifyStripeSignature(BODY, `t=${NOW},v1=${"0".repeat(64)},${good},v0=abc`, SECRET, { now: NOW }), true);
});

test("stripe verifier: signature compare rejects a wrong secret, a tampered body and a wrong-length digest", () => {
  assert.equal(verifyStripeSignature(BODY, sign(BODY, NOW, "whsec_other"), SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY.replace('"paid"', '"unpaid"'), sign(BODY), SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, `t=${NOW},v1=${"a".repeat(64)}`, SECRET, { now: NOW }), false);
});

test("stripe verifier: rejects a validly signed timestamp outside the tolerance, accepts the edge", () => {
  const old = NOW - STRIPE_TOLERANCE_SEC - 1;
  const future = NOW + STRIPE_TOLERANCE_SEC + 1;
  assert.equal(verifyStripeSignature(BODY, sign(BODY, old), SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, future), SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, NOW - STRIPE_TOLERANCE_SEC), SECRET, { now: NOW }), true);
});

test("stripe verifier: fails closed on empty secret, missing header, no t, no v1, v0 only", () => {
  assert.equal(verifyStripeSignature(BODY, sign(BODY, NOW, ""), "", { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, null, SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY).replace(/^t=\d+,/, ""), SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, `t=${NOW}`, SECRET, { now: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY).replace("v1=", "v0="), SECRET, { now: NOW }), false);
});

test("stripe verifier: plugs into processWebhook as its SignatureVerifier", async () => {
  const deps = { verifier: stripeVerifier(SECRET, { now: () => NOW }), store: createMemoryEventStore(), handler: async () => "ok" };
  const ok = await processWebhook({ rawBody: BODY, signatureHeader: sign(BODY), eventId: "evt_1" }, deps);
  assert.equal(ok.status, "processed");
  const bad = await processWebhook({ rawBody: BODY, signatureHeader: sign(BODY, NOW, "whsec_x"), eventId: "evt_2" }, deps);
  assert.equal(bad.status, "rejected");
});

// --- event -> signal -------------------------------------------------------------------------

const ev = (name) => JSON.parse(fixture(name));
const CID = "c0000000-0000-4000-8000-0000000000c1";

test("billingSignal: checkout, invoice.paid (basil shape) and an active subscription are payments", () => {
  for (const name of ["checkout.session.completed", "invoice.paid", "customer.subscription.created"]) {
    const s = billingSignal(ev(name));
    assert.equal(s?.kind, "paid", name);
    assert.equal(s.clientRef, CID, name);
    assert.equal(s.customerId, "cus_TestFixture0001", name);
    assert.equal(s.subscriptionId, "sub_TestFixture0001", name);
  }
});

test("billingSignal: past_due is still retrying (null); unpaid and canceled are lapses", () => {
  assert.equal(billingSignal(ev("customer.subscription.updated.past_due")), null);
  assert.equal(billingSignal(ev("customer.subscription.updated.unpaid"))?.kind, "lapsed");
  assert.equal(billingSignal(ev("customer.subscription.deleted"))?.kind, "lapsed");
});

test("billingSignal: no payment yet means no signal", () => {
  const trial = ev("customer.subscription.created");
  trial.data.object.status = "trialing";
  assert.equal(billingSignal(trial), null);
  const asyncPending = ev("checkout.session.completed");
  asyncPending.data.object.payment_status = "unpaid";
  assert.equal(billingSignal(asyncPending), null);
  const zero = ev("invoice.paid");
  zero.data.object.amount_paid = 0;
  assert.equal(billingSignal(zero), null);
  const payment = ev("checkout.session.completed");
  payment.data.object.mode = "payment";
  assert.equal(billingSignal(payment), null);
  assert.equal(billingSignal({ id: "evt_x", type: "charge.refunded", created: NOW, data: { object: {} } }), null);
  const weird = ev("customer.subscription.updated.unpaid");
  weird.data.object.status = "something_new";
  assert.equal(billingSignal(weird), null);
});

// --- signal -> action ------------------------------------------------------------------------

const state = (over = {}) => ({ status: "pending", paidAt: null, graceUntil: null, subscriptionId: null, shopifyBilled: false, lastEventAt: null, ...over });
const paid = { kind: "paid", at: NOW, clientRef: CID, customerId: "cus_1", subscriptionId: "sub_1" };
const lapsed = { ...paid, kind: "lapsed" };

test("decideBilling: a payment activates pending, records on active, resumes a lapsed pause", () => {
  assert.deepEqual(decideBilling(state(), paid), { action: "activate" });
  assert.deepEqual(decideBilling(state({ status: "active", paidAt: 1 }), paid), { action: "record_payment" });
  assert.deepEqual(decideBilling(state({ status: "active", paidAt: 1, graceUntil: NOW + 5 }), paid), { action: "record_payment" });
  assert.deepEqual(decideBilling(state({ status: "paused", paidAt: 1 }), paid), { action: "resume" });
});

test("decideBilling: a churned client is never reactivated", () => {
  assert.equal(decideBilling(state({ status: "churned", paidAt: 1 }), paid).action, "ignore");
});

test("decideBilling: a pause bcns set by hand is not lifted by a payment", () => {
  assert.deepEqual(decideBilling(state({ status: "paused" }), paid), { action: "ignore", reason: "paused_by_hand" });
});

test("decideBilling: a Shopify-billed tenant is never activated or put in grace", () => {
  assert.deepEqual(decideBilling(state({ shopifyBilled: true }), paid), { action: "ignore", reason: "shopify_billed" });
  assert.deepEqual(decideBilling(state({ status: "active", paidAt: 1, shopifyBilled: true }), lapsed), { action: "ignore", reason: "shopify_billed" });
});

test("decideBilling: a lapse after paying starts 30 days of grace once; never-paid stays put", () => {
  assert.deepEqual(decideBilling(state({ status: "active", paidAt: 1, subscriptionId: "sub_1" }), lapsed), { action: "start_grace", graceUntil: NOW + GRACE_SECONDS });
  assert.equal(GRACE_SECONDS, 30 * 86400);
  assert.equal(decideBilling(state(), lapsed).action, "ignore");
  assert.equal(decideBilling(state({ status: "active" }), lapsed).action, "ignore"); // billed by hand, never paid us
  assert.equal(decideBilling(state({ status: "active", paidAt: 1, graceUntil: NOW }), lapsed).action, "ignore");
  assert.equal(decideBilling(state({ status: "active", paidAt: 1, subscriptionId: "sub_new" }), lapsed).action, "ignore");
});

test("decideBilling: an event older than the newest applied one is ignored", () => {
  assert.deepEqual(decideBilling(state({ status: "active", paidAt: 1, lastEventAt: NOW + 1 }), lapsed), { action: "ignore", reason: "stale" });
  assert.equal(decideBilling(state({ lastEventAt: NOW }), paid).action, "activate");
});

test("billingView: who sees Pay", () => {
  assert.equal(billingView(state()), "pay");
  assert.equal(billingView(state({ shopifyBilled: true })), "exempt");
  assert.equal(billingView(state({ status: "paused", paidAt: 1 })), "pay");
  assert.equal(billingView(state({ status: "paused" })), "none");
  assert.equal(billingView(state({ status: "active", paidAt: 1, graceUntil: NOW })), "grace");
  assert.equal(billingView(state({ status: "active", paidAt: 1 })), "paid");
  assert.equal(billingView(state({ status: "active" })), "none");
  assert.equal(billingView(state({ status: "churned", paidAt: 1 })), "exempt");
  assert.deepEqual(["pay", "grace", "paid", "none", "exempt"].map(canStartCheckout), [true, true, false, false, false]);
});
