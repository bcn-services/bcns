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

const { parseBillingSelf, checkoutTarget, portalTarget, stripeWebhookRoute, safeStripeUrl, formatDay, pendingScreen, stripeReady } = await import("../lib/stripe-billing.ts");
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

const API = "https://api.stripe.com/v1";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_x";
const PORTAL_URL = "https://billing.stripe.com/p/session/x";
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../../packages/app-core/tests/fixtures/stripe/${name}`, import.meta.url), "utf8"));
const SEARCH = fixture("subscriptions.search.json"); // one active subscription, found by client id
const LIST = fixture("subscriptions.list.json"); // the stored customer's: one unpaid, one canceled
const NONE = { ...SEARCH, data: [] };
/** A page of `page` whose subscriptions have exactly these statuses (fixture shape, fake ids). */
const withStatuses = (page, ...statuses) => ({ ...page, data: statuses.map((status, i) => ({ ...page.data[0], id: `sub_TestStatus${i}`, status })) });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
/** Stripe's API by path: the subscription lookups answer `subs` (a page, or a reply function); Checkout and the portal a hosted URL. */
const stripeApi = (subs = NONE) => (url) => {
  const u = String(url);
  if (u.startsWith(`${API}/subscriptions`)) return typeof subs === "function" ? subs() : json(subs);
  return json({ url: u === `${API}/billing_portal/sessions` ? PORTAL_URL : CHECKOUT_URL });
};

/** A fetch that records each call and answers with `reply`. */
function recorder(reply = stripeApi()) {
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
  assert.equal(target, CHECKOUT_URL);
  assert.equal(calls.length, 2, "one lookup for a live subscription, then the session");
  assert.equal(new URL(calls[0].url).pathname, "/v1/subscriptions/search");
  assert.equal(calls[1].url, `${API}/checkout/sessions`);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.headers.Authorization, "Bearer sk_test_fixture");
  const form = new URLSearchParams(calls[1].init.body);
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

test("checkoutTarget: in grace with only ended subscriptions, a new one on the stored customer, returning home", async () => {
  const { calls, fetchImpl } = recorder(stripeApi(withStatuses(LIST, "canceled", "incomplete_expired")));
  const target = await checkoutTarget(billing({ status: "active", paid_at: 1, grace_until: 2, stripe_customer_id: "cus_Ok1" }), "owner@acme.example", CONFIG, fetchImpl);
  assert.equal(target, CHECKOUT_URL);
  assert.equal(calls[1].url, `${API}/checkout/sessions`);
  const form = new URLSearchParams(calls[1].init.body);
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
  assert.equal(await checkoutTarget(billing(), null, { ...CONFIG, stripeWebhookSecret: undefined }, fetchImpl), "/pending", "no way to hear the payment");
  assert.equal(await checkoutTarget(billing(), null, { ...CONFIG, stripeWebhookFunctionUrl: undefined }, fetchImpl), "/pending", "no way to hear the payment");
  assert.equal(await checkoutTarget(null, null, CONFIG, fetchImpl), "/login?error=signed-out");
  assert.equal(calls.length, 0);
});

test("stripeReady: needs the key, the price, the webhook secret and the webhook function URL", () => {
  assert.equal(stripeReady(CONFIG), true);
  for (const key of ["stripeSecretKey", "stripePriceId", "stripeWebhookSecret", "stripeWebhookFunctionUrl"]) {
    assert.equal(stripeReady({ ...CONFIG, [key]: undefined }), false, key);
  }
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
  // The lookup answers "none", so each bad reply is the session's own.
  for (const reply of bad) {
    const { calls, fetchImpl } = recorder((url, init) => (String(url).startsWith(`${API}/subscriptions`) ? json(NONE) : reply(url, init)));
    assert.equal(await checkoutTarget(billing(), null, CONFIG, fetchImpl), "/pending?error=billing");
    assert.equal(calls[1].url, `${API}/checkout/sessions`);
  }
  assert.equal(safeStripeUrl("https://checkout.stripe.com.evil.example/x", "checkout.stripe.com"), null);
});

/* ------------------------------------------------- never a second subscription */

const GRACE = { status: "active", paid_at: 1, grace_until: 2, stripe_customer_id: "cus_Ok1" };
const sessions = (calls) => calls.filter((c) => c.init?.method === "POST");

test("checkoutTarget: a pending owner Stripe already has a subscription for goes to the confirming screen, no second Checkout", async () => {
  const { calls, fetchImpl } = recorder(stripeApi(SEARCH));
  assert.equal(await checkoutTarget(billing(), "owner@acme.example", CONFIG, fetchImpl), "/pending?paid=1&waiting=1");
  assert.equal(calls.length, 1);
  const lookup = new URL(calls[0].url);
  assert.equal(`${lookup.origin}${lookup.pathname}`, `${API}/subscriptions/search`);
  assert.equal(lookup.searchParams.get("query"), `metadata["client_id"]:"${CLIENT}"`, "by the client id Checkout stamps on the subscription");
  assert.equal(calls[0].init.method, undefined, "a GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_fixture");
});

test("checkoutTarget: every status that still bills or can be paid blocks a new Checkout; ended ones do not", async () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete"]) {
    const { calls, fetchImpl } = recorder(stripeApi(withStatuses(SEARCH, "canceled", status)));
    assert.equal(await checkoutTarget(billing(), null, CONFIG, fetchImpl), "/pending?paid=1&waiting=1", status);
    assert.equal(sessions(calls).length, 0, status);
  }
  const { calls, fetchImpl } = recorder(stripeApi(withStatuses(SEARCH, "canceled", "incomplete_expired")));
  assert.equal(await checkoutTarget(billing(), null, CONFIG, fetchImpl), CHECKOUT_URL);
  assert.equal(sessions(calls)[0].url, `${API}/checkout/sessions`);
});

test("checkoutTarget: in grace or paused with a live subscription, Pay opens the billing portal for it instead", async () => {
  const grace = recorder(stripeApi(LIST)); // unpaid + canceled
  assert.equal(await checkoutTarget(billing(GRACE), null, CONFIG, grace.fetchImpl), PORTAL_URL);
  const lookup = new URL(grace.calls[0].url);
  assert.equal(lookup.pathname, "/v1/subscriptions", "by the stored customer, not search");
  assert.equal(lookup.searchParams.get("customer"), "cus_Ok1");
  assert.equal(lookup.searchParams.get("status"), "all");
  assert.equal(grace.calls.length, 2);
  assert.equal(grace.calls[1].url, `${API}/billing_portal/sessions`);
  assert.equal(new URLSearchParams(grace.calls[1].init.body).get("customer"), "cus_Ok1");

  const paused = recorder(stripeApi(withStatuses(LIST, "past_due")));
  assert.equal(await checkoutTarget(billing({ status: "paused", paid_at: 1, stripe_customer_id: "cus_Ok1" }), null, CONFIG, paused.fetchImpl), PORTAL_URL);
  assert.equal(paused.calls[1].url, `${API}/billing_portal/sessions`);

  // No customer stored (the payment's webhook never landed): the portal for the one Stripe found.
  const found = recorder(stripeApi(withStatuses(SEARCH, "unpaid")));
  assert.equal(await checkoutTarget(billing({ status: "paused", paid_at: 1 }), null, CONFIG, found.fetchImpl), PORTAL_URL);
  assert.equal(new URLSearchParams(found.calls[1].init.body).get("customer"), "cus_TestFixture0001");
  const nameless = recorder(stripeApi({ ...SEARCH, data: [{ ...SEARCH.data[0], customer: null }] }));
  assert.equal(await checkoutTarget(billing({ status: "paused", paid_at: 1 }), null, CONFIG, nameless.fetchImpl), "/pending?error=billing");
  assert.equal(sessions(nameless.calls).length, 0);
});

test("checkoutTarget: fails closed, no session, when Stripe can't say whether a live subscription exists", async () => {
  const unknown = [
    () => json({ error: { type: "api_error" } }, 500),
    () => {
      throw new DOMException("timed out", "TimeoutError");
    },
    () => new Response("<html>", { status: 200 }),
    () => json({ object: "list" }),
    () => json({ ...withStatuses(SEARCH, "canceled"), has_more: true }), // the live one may be on the next page
  ];
  for (const [i, reply] of unknown.entries()) {
    for (const over of [{}, GRACE]) {
      const { calls, fetchImpl } = recorder(stripeApi(reply));
      assert.equal(await checkoutTarget(billing(over), null, CONFIG, fetchImpl), "/pending?error=billing", `reply ${i}`);
      assert.equal(calls.length, 1, `reply ${i}: the lookup only`);
    }
  }
  // A client id that isn't a UUID never reaches the search query.
  const { calls, fetchImpl } = recorder();
  assert.equal(await checkoutTarget(billing({ client_id: 'x" OR status:"active' }), null, CONFIG, fetchImpl), "/pending?error=billing");
  assert.equal(calls.length, 0);
});

test("pendingScreen: a Shopify App Store install never sees Pay; everyone else who may pay does", () => {
  assert.equal(pendingScreen(billing(), true, false), "pay");
  assert.equal(pendingScreen(billing(), true, true), "review", "Shopify bills them: the bcns-reviews-every-workspace screen");
  assert.equal(pendingScreen(billing({ status: "paused", paid_at: 1 }), true, false), "pay");
  assert.equal(pendingScreen(billing({ status: "paused", paid_at: 1 }), true, true), "paused");
  assert.equal(pendingScreen(billing(), false, false), "review", "Stripe not set up");
  assert.equal(pendingScreen(billing({ status: "paused", paid_at: 1 }), false, false), "paused");
  assert.equal(pendingScreen(billing({ shopify_billed: true }), true, false), "review");
  assert.equal(pendingScreen(billing({ status: "paused" }), true, false), "paused");
  assert.equal(pendingScreen(null, true, false), "review");
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

/* ------------------------------- QA scenario: the review's double-subscription finding (I1) */

test("scenario: pay, the webhook lags, Pay again => one subscription; inside Stripe's search lag the webhook flags the second instead of overwriting", async () => {
  const { decideBilling } = await import("@bcn-services/app-core");
  const stripeSubs = []; // Stripe's side: every subscription a completed Checkout made
  let indexed = true; // false = the search index has not caught up yet
  let checkoutsOpened = 0;
  const completeCheckout = (id) => stripeSubs.push({ id, status: "active", customer: "cus_QaOne1", metadata: { client_id: CLIENT } });
  const reply = (url) => {
    const u = String(url);
    if (u.startsWith(`${API}/subscriptions`)) return json({ object: "search_result", has_more: false, data: indexed ? stripeSubs : [] });
    if (u === `${API}/checkout/sessions`) {
      checkoutsOpened++;
      return json({ url: CHECKOUT_URL });
    }
    return json({ url: PORTAL_URL });
  };
  const { fetchImpl } = recorder(reply);
  const pendingOwner = billing(); // the database still says pending, no customer: the webhook has not landed

  assert.equal(await checkoutTarget(pendingOwner, null, CONFIG, fetchImpl), CHECKOUT_URL);
  completeCheckout("sub_QaFirst");
  assert.equal(checkoutsOpened, 1);

  // The owner opens /pending again and clicks Pay: Stripe already has their subscription.
  assert.equal(await checkoutTarget(pendingOwner, null, CONFIG, fetchImpl), "/pending?paid=1&waiting=1");
  assert.equal(checkoutsOpened, 1, "no second Checkout, no second subscription");

  // Residual window: the first payment is not searchable yet, so a second Checkout opens and is paid.
  indexed = false;
  assert.equal(await checkoutTarget(pendingOwner, null, CONFIG, fetchImpl), CHECKOUT_URL);
  completeCheckout("sub_QaSecond");
  assert.equal(checkoutsOpened, 2);

  // Both payments reach the webhook: the first applied wins, the second is flagged, the stored one is not replaced.
  const paid = (subscriptionId, at) => ({ kind: "paid", at, clientRef: CLIENT, customerId: "cus_QaOne1", subscriptionId });
  let state = { status: "pending", paidAt: null, graceUntil: null, subscriptionId: null, shopifyBilled: false, lastEventAt: null };
  assert.deepEqual(decideBilling(state, paid("sub_QaFirst", 100)), { action: "activate" });
  state = { ...state, status: "active", paidAt: 100, subscriptionId: "sub_QaFirst", lastEventAt: 100 };
  assert.deepEqual(decideBilling(state, paid("sub_QaSecond", 101)), { action: "flag_duplicate" });
  assert.deepEqual(decideBilling(state, paid("sub_QaFirst", 102)), { action: "record_payment" }, "the stored subscription renewing is normal");

  // In grace the stored subscription is unpaid: Pay opens the portal for it, never a new Checkout.
  indexed = true;
  stripeSubs.length = 0;
  stripeSubs.push({ id: "sub_QaFirst", status: "unpaid", customer: "cus_QaOne1", metadata: { client_id: CLIENT } });
  assert.equal(await checkoutTarget(billing(GRACE), null, CONFIG, fetchImpl), PORTAL_URL);
  assert.equal(checkoutsOpened, 2);
});
