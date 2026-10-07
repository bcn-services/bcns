/**
 * Stripe self-serve billing on the hub: the billing_self parse, Checkout / billing-portal
 * session requests (client from the signed-in user, never the form; owner-only; only in a
 * state that may pay; only a Stripe-hosted URL is followed), the /api/webhooks/stripe
 * verify-then-forward route against a recorded event fixture, the grace banner, and the
 * middleware letting Stripe's cookie-less POST through. No network: fetch is injected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const react = require("react");
react.cache ??= (fn) => fn; // server-only in React 18; absent outside Next
globalThis.React = react;

const { parseBillingSelf, checkoutTarget, portalTarget, stripeWebhookRoute, safeStripeUrl, formatDay } = await import("../lib/stripe-billing.ts");
const { BillingBanner } = await import("../app/billing-banner.tsx");
const { config: middlewareConfig } = await import("../middleware.ts");

const CLIENT = "c0000000-0000-4000-8000-0000000000c1";
const HUB = "https://connect.bcn-services.com";
const SECRET = "whsec_test_fixture_only";
const FUNCTION_URL = "https://abcdefghijklmnopqrst.supabase.co/functions/v1/stripe-webhook";
const CONFIG = { approvedOAuthSources: [], hubBaseUrl: HUB, signupEnabled: false, stripeSecretKey: "sk_test_fixture", stripePriceId: "price_Fixture200", stripeWebhookSecret: SECRET, stripeWebhookFunctionUrl: FUNCTION_URL };
const FIXTURE = readFileSync(new URL("../../../packages/app-core/tests/fixtures/stripe/checkout.session.completed.json", import.meta.url), "utf8");
const EVENT_AT = JSON.parse(FIXTURE).created;

const row = (over = {}) => ({ client_id: CLIENT, role: "owner", status: "pending", paid_at: null, grace_until: null, shopify_billed: false, stripe_customer_id: null, ...over });
const billing = (over) => parseBillingSelf(row(over));

/** A fetch that records each call and answers with `reply`. */
function recorder(reply = () => new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_x" }), { status: 200 })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return reply(url, init);
  };
  return { calls, fetchImpl };
}

test("parseBillingSelf: the view follows the status, and a missing Shopify flag reads as exempt", () => {
  assert.equal(billing().view, "pay");
  assert.equal(billing({ status: "active", paid_at: 1, grace_until: 2 }).view, "grace");
  assert.equal(billing({ status: "paused" }).view, "none", "paused by hand: nothing to pay");
  assert.equal(billing({ status: "paused", paid_at: 1 }).view, "pay");
  assert.equal(billing({ shopify_billed: true }).view, "exempt");
  assert.equal(parseBillingSelf({ ...row(), shopify_billed: undefined }).view, "exempt");
  assert.equal(billing({ stripe_customer_id: "cus_Ok1" }).customerId, "cus_Ok1");
  assert.equal(billing({ stripe_customer_id: "cus_bad/../x" }).customerId, null);
  assert.equal(parseBillingSelf({ ...row(), status: "weird" }), null);
  assert.equal(parseBillingSelf(null), null);
});

test("checkoutTarget: a $200/mo subscription session for the signed-in owner's own client", async () => {
  const { calls, fetchImpl } = recorder();
  const target = await checkoutTarget(billing(), "owner@acme.example", CONFIG, fetchImpl);
  assert.equal(target, "https://checkout.stripe.com/c/pay/cs_test_x");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_fixture");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("mode"), "subscription");
  assert.equal(form.get("line_items[0][price]"), "price_Fixture200");
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("client_reference_id"), CLIENT);
  assert.equal(form.get("subscription_data[metadata][client_id]"), CLIENT);
  assert.equal(form.get("success_url"), `${HUB}/pending?paid=1`);
  assert.equal(form.get("cancel_url"), `${HUB}/pending`);
  assert.equal(form.get("customer_email"), "owner@acme.example");
  assert.equal(form.get("customer"), null);
});

test("checkoutTarget: reuses the customer, and a grace payment returns home", async () => {
  const { calls, fetchImpl } = recorder();
  await checkoutTarget(billing({ status: "active", paid_at: 1, grace_until: 2, stripe_customer_id: "cus_Ok1" }), "owner@acme.example", CONFIG, fetchImpl);
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("customer"), "cus_Ok1");
  assert.equal(form.get("customer_email"), null);
  assert.equal(form.get("success_url"), `${HUB}/`);
});

test("checkoutTarget: refuses without calling Stripe for a member, a non-paying state, or missing config", async () => {
  const { calls, fetchImpl } = recorder();
  assert.equal(await checkoutTarget(billing({ role: "member" }), null, CONFIG, fetchImpl), "/pending?error=owner");
  assert.equal(await checkoutTarget(billing({ shopify_billed: true }), null, CONFIG, fetchImpl), "/pending");
  assert.equal(await checkoutTarget(billing({ status: "active", paid_at: 1 }), null, CONFIG, fetchImpl), "/pending");
  assert.equal(await checkoutTarget(billing({ status: "paused" }), null, CONFIG, fetchImpl), "/pending");
  assert.equal(await checkoutTarget(billing(), null, { ...CONFIG, stripePriceId: undefined }, fetchImpl), "/pending");
  assert.equal(await checkoutTarget(null, null, CONFIG, fetchImpl), "/login?error=signed-out");
  assert.equal(calls.length, 0);
});

test("checkoutTarget: a Stripe error, a timeout, or a non-Stripe URL never redirects anywhere else", async () => {
  const bad = [
    () => new Response("{}", { status: 500 }),
    () => new Response(JSON.stringify({ url: "https://evil.example/c/pay" }), { status: 200 }),
    () => new Response(JSON.stringify({ url: "http://checkout.stripe.com/c/pay" }), { status: 200 }),
    () => {
      throw new DOMException("timed out", "TimeoutError");
    },
  ];
  for (const reply of bad) assert.equal(await checkoutTarget(billing(), null, CONFIG, recorder(reply).fetchImpl), "/pending?error=billing");
  assert.equal(safeStripeUrl("https://checkout.stripe.com.evil.example/x", "checkout.stripe.com"), null);
});

test("portalTarget: the owner's own customer, billing.stripe.com only", async () => {
  const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/x" }), { status: 200 }));
  assert.equal(await portalTarget(billing({ stripe_customer_id: "cus_Ok1" }), CONFIG, fetchImpl), "https://billing.stripe.com/p/session/x");
  assert.equal(calls[0].url, "https://api.stripe.com/v1/billing_portal/sessions");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("customer"), "cus_Ok1");
  assert.equal(form.get("return_url"), `${HUB}/pending`);
  assert.equal(await portalTarget(billing({ role: "member", stripe_customer_id: "cus_Ok1" }), CONFIG, fetchImpl), "/pending?error=owner");
  assert.equal(await portalTarget(billing(), CONFIG, fetchImpl), "/pending", "no customer yet");
  assert.equal(calls.length, 1);
});

const sign = (body, t = EVENT_AT, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const post = (body, signature) =>
  new Request(`${HUB}/api/webhooks/stripe`, { method: "POST", body, headers: signature ? { "Stripe-Signature": signature } : {} });
const now = () => EVENT_AT;

test("webhook route: a signed fixture is forwarded byte-for-byte with its signature", async () => {
  const { calls, fetchImpl } = recorder(() => new Response("{}", { status: 200 }));
  const response = await stripeWebhookRoute(post(FIXTURE, sign(FIXTURE)), CONFIG, { fetchImpl, now });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, FUNCTION_URL);
  assert.equal(calls[0].init.body, FIXTURE);
  assert.equal(calls[0].init.headers["Stripe-Signature"], sign(FIXTURE));
});

test("webhook route: a bad, stale or missing signature is a 401 and never forwarded", async () => {
  const { calls, fetchImpl } = recorder(() => new Response("{}", { status: 200 }));
  for (const signature of [sign(FIXTURE, EVENT_AT, "whsec_other"), sign(FIXTURE, EVENT_AT - 301), null]) {
    assert.equal((await stripeWebhookRoute(post(FIXTURE, signature), CONFIG, { fetchImpl, now })).status, 401);
  }
  const tampered = FIXTURE.replace('"paid"', '"unpaid"');
  assert.equal((await stripeWebhookRoute(post(tampered, sign(FIXTURE)), CONFIG, { fetchImpl, now })).status, 401);
  assert.equal(calls.length, 0);
});

test("webhook route: unconfigured is a 503, a failed forward a 502 (Stripe retries), oversized a 413", async () => {
  const ok = recorder(() => new Response("{}", { status: 200 }));
  assert.equal((await stripeWebhookRoute(post(FIXTURE, sign(FIXTURE)), { ...CONFIG, stripeWebhookSecret: undefined }, { fetchImpl: ok.fetchImpl, now })).status, 503);
  assert.equal((await stripeWebhookRoute(post(FIXTURE, sign(FIXTURE)), { ...CONFIG, stripeWebhookFunctionUrl: undefined }, { fetchImpl: ok.fetchImpl, now })).status, 503);
  assert.equal(ok.calls.length, 0);
  const conflict = recorder(() => new Response("{}", { status: 503 }));
  assert.equal((await stripeWebhookRoute(post(FIXTURE, sign(FIXTURE)), CONFIG, { fetchImpl: conflict.fetchImpl, now })).status, 502);
  const down = recorder(() => {
    throw new TypeError("fetch failed");
  });
  assert.equal((await stripeWebhookRoute(post(FIXTURE, sign(FIXTURE)), CONFIG, { fetchImpl: down.fetchImpl, now })).status, 502);
  const big = "x".repeat(256 * 1024 + 1);
  assert.equal((await stripeWebhookRoute(post(big, sign(big)), CONFIG, { fetchImpl: ok.fetchImpl, now })).status, 413);
});

test("middleware: /api/webhooks/stripe is outside the session gate, /pending is inside it", () => {
  const matcher = new RegExp(`^${middlewareConfig.matcher[0]}$`);
  assert.equal(matcher.test("/api/webhooks/stripe"), false);
  assert.equal(matcher.test("/pending"), true);
  assert.equal(matcher.test("/api/stripe/webhook"), true, "why the route is not under /api/stripe");
});

test("billing banner: grace only; owners get the link, members the text", () => {
  const grace = { status: "active", paid_at: 1, grace_until: 1_792_000_000 };
  const owner = renderToStaticMarkup(createElement(BillingBanner, { billing: billing(grace) }));
  assert.match(owner, new RegExp(formatDay(1_792_000_000)));
  assert.match(owner, /href="\/pending"/);
  const member = renderToStaticMarkup(createElement(BillingBanner, { billing: billing({ ...grace, role: "member" }) }));
  assert.doesNotMatch(member, /href=/);
  assert.match(member, /Ask your workspace owner/);
  assert.equal(renderToStaticMarkup(createElement(BillingBanner, { billing: billing({ status: "active", paid_at: 1 }) })), "");
  assert.equal(renderToStaticMarkup(createElement(BillingBanner, { billing: null })), "");
  assert.equal(formatDay(1_792_000_000), "October 14, 2026");
});
