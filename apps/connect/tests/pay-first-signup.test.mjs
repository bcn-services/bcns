/**
 * Pay-first sign-up and the /team "Manage billing" panel. /signup creates no user and no
 * workspace: name + email -> a confirm step that shows the address back -> an existing-address
 * check (a request mode on the signup Edge Function, so the hub holds no service-role key) ->
 * one Checkout per address per 10 minutes -> Stripe. The paid webhook creates the workspace
 * (platform/test/edge-pay-first-signup.test.ts). `?from=shopify` keeps the old flow.
 * No network: fetch is stubbed, the session comes from a crafted cookie.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const react = require("react");
react.cache ??= (fn) => fn;
globalThis.React = react;
globalThis.AsyncLocalStorage ??= require("node:async_hooks").AsyncLocalStorage;
const { NextRequest } = await import("next/server");
const { requestAsyncStorage } = require("next/dist/client/components/request-async-storage.external.js");
const { actionAsyncStorage } = require("next/dist/client/components/action-async-storage.external.js");

const { payFirstTarget, signupConfirmPath, createCheckoutLimiter, CHECKOUT_COOLDOWN_MS } = await import("../lib/signup.ts");
const { portalTarget, parseBillingSelf } = await import("../lib/stripe-billing.ts");
const { getConfig } = await import("../lib/env.ts");

const HUB = "https://connect.bcn-services.com";
const PROJECT_REF = "abcdefghijklmnopqrst";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_x";
const PORTAL_URL = "https://billing.stripe.com/p/session/x";
const CLIENT = "c0000000-0000-4000-8000-0000000000c1";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER = { id: USER_ID, email: "owner@acme.example", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", email_confirmed_at: new Date().toISOString() };
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  HUB_BASE_URL: HUB,
  SIGNUP_ENABLED: "1",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_PRICE_ID: "price_Fixture200",
  STRIPE_WEBHOOK_SECRET: "whsec_test_fixture_only",
  STRIPE_WEBHOOK_FUNCTION_URL: `${SUPABASE_URL}/functions/v1/stripe-webhook`,
};
const savedEnv = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
const savedFetch = globalThis.fetch;
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  globalThis.fetch = savedFetch;
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unique = (() => { let n = 0; return () => `buyer${++n}-${Date.now()}@pay.example`; })();
const fixtureEmail = () => unique();

/**
 * Everything the signup path may call: the signup function's `exists` mode and Stripe Checkout.
 * Any other URL (GoTrue admin/signup, PostgREST, an RPC) is recorded and answered 500.
 */
function world({ exists = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url?.url ?? url);
    calls.push({ url: u, body: typeof init?.body === "string" ? init.body : null });
    if (u === `${SUPABASE_URL}/functions/v1/signup`) return json({ exists });
    if (u === "https://api.stripe.com/v1/checkout/sessions") return json({ url: CHECKOUT_URL });
    return json({ error: "unexpected" }, 500);
  };
  return { calls, fetchImpl };
}
const deps = (fetchImpl, limiter = createCheckoutLimiter()) => ({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: "anon", config: getConfig(), fetchImpl, limiter });
const setup = () => Object.assign(process.env, ENV);

/* ------------------------------------------------------------ /signup creates nothing */

test("pay-first: the confirm submit asks only the signup fn (exists) and Stripe Checkout; no user, no workspace", async () => {
  setup();
  const email = fixtureEmail();
  const { calls, fetchImpl } = world();
  const target = await payFirstTarget({ name: "  Acme Bakery ", email: email.toUpperCase() }, deps(fetchImpl));
  assert.equal(target, CHECKOUT_URL);
  assert.deepEqual(calls.map((c) => c.url), [`${SUPABASE_URL}/functions/v1/signup`, "https://api.stripe.com/v1/checkout/sessions"]);
  assert.deepEqual(JSON.parse(calls[0].body), { mode: "exists", email });
  assert.ok(!calls.some((c) => /auth\/v1|rest\/v1|rpc/.test(c.url)), "nothing was written before payment");

  const sent = new URLSearchParams(calls[1].body);
  assert.equal(sent.get("mode"), "subscription");
  assert.equal(sent.get("customer_email"), email);
  assert.equal(sent.get("allow_promotion_codes"), "true");
  for (const prefix of ["metadata", "subscription_data[metadata]"]) {
    assert.equal(sent.get(`${prefix}[signup_name]`), "Acme Bakery");
    assert.equal(sent.get(`${prefix}[signup_email]`), email);
  }
  assert.equal(sent.get("success_url"), `${HUB}/signup?paid=1`);
  assert.equal(sent.get("cancel_url"), `${HUB}/signup?canceled=1`);
  assert.equal(sent.get("client_reference_id"), null, "no client exists yet: the webhook takes the signup branch");
});

test("the confirm action itself: no auth, no database, no admin call (redirect swallowed)", async () => {
  setup();
  const email = fixtureEmail();
  const seen = [];
  globalThis.fetch = async (input) => {
    const u = String(input?.url ?? input);
    seen.push(u);
    if (u.endsWith("/functions/v1/signup")) return json({ exists: false });
    if (u.endsWith("/checkout/sessions")) return json({ url: CHECKOUT_URL });
    return json({}, 500);
  };
  const { confirmSignup } = await import("../app/signup/actions.ts");
  const form = new FormData();
  form.set("name", "Acme Bakery");
  form.set("email", email);
  const request = new NextRequest(`${HUB}/signup`, { method: "POST", headers: { host: "connect.bcn-services.com" } });
  await actionAsyncStorage
    .run({ isAction: true }, () => requestAsyncStorage.run({ headers: request.headers, cookies: request.cookies, mutableCookies: request.cookies, draftMode: {} }, () => confirmSignup(form)))
    .catch((error) => {
      assert.ok(String(error?.digest).startsWith("NEXT_REDIRECT"), String(error));
      assert.match(String(error.digest), /checkout\.stripe\.com/);
    });
  assert.deepEqual(seen, [`${SUPABASE_URL}/functions/v1/signup`, "https://api.stripe.com/v1/checkout/sessions"]);
});

test("the first submit only goes to the confirm view and calls nothing", async () => {
  setup();
  let called = 0;
  globalThis.fetch = async () => (called++, json({}));
  const { signUp } = await import("../app/signup/actions.ts");
  const form = new FormData();
  form.set("name", "Acme Bakery");
  form.set("email", "Owner@Acme.Example");
  const request = new NextRequest(`${HUB}/signup`, { method: "POST", headers: { host: "connect.bcn-services.com" } });
  let digest = "";
  await actionAsyncStorage
    .run({ isAction: true }, () => requestAsyncStorage.run({ headers: request.headers, cookies: request.cookies, mutableCookies: request.cookies, draftMode: {} }, () => signUp(form)))
    .catch((error) => (digest = String(error?.digest)));
  assert.match(digest, /NEXT_REDIRECT/);
  assert.ok(digest.includes(encodeURIComponent("owner@acme.example")) || digest.includes("owner%40acme.example"), digest);
  assert.equal(called, 0);
  assert.equal(signupConfirmPath({ name: "Acme", email: "no-at" }), "/signup?error=invalid");
  assert.equal(signupConfirmPath({ name: " ", email: "a@b.co" }), "/signup?error=invalid");
});

/* ------------------------------------------------------------------ existing email */

test("an email that already has an account goes to /login with a note, and Stripe is never called", async () => {
  setup();
  const { calls, fetchImpl } = world({ exists: true });
  const limiter = createCheckoutLimiter();
  const email = fixtureEmail();
  assert.equal(await payFirstTarget({ name: "Acme", email }, deps(fetchImpl, limiter)), "/login?error=signup-exists");
  assert.ok(!calls.some((c) => c.url.includes("stripe.com")), "no Stripe fetch");
  assert.equal(limiter.reserve(email), true, "the cooldown was not spent on a refused address");
  const { default: LoginPage } = await import("../app/login/page.tsx");
  assert.match(renderToStaticMarkup(createElement(LoginPage, { searchParams: { error: "signup-exists" } })), /already has an account/);
});

test("the lookup failing refuses the signup instead of guessing, and Stripe is not called", async () => {
  setup();
  const calls = [];
  const fetchImpl = async (url) => (calls.push(String(url)), json({}, 503));
  assert.equal(await payFirstTarget({ name: "Acme", email: fixtureEmail() }, deps(fetchImpl)), "/signup?error=failed");
  assert.equal(calls.length, 1);
});

/* ------------------------------------------------------------------- rate limit */

test("a second Checkout for the same email within 10 minutes is refused; after 10 it is allowed", async () => {
  setup();
  let t = 1_000_000;
  const limiter = createCheckoutLimiter(() => t);
  const email = fixtureEmail();
  const { calls, fetchImpl } = world();
  const go = (e = email) => payFirstTarget({ name: "Acme", email: e }, deps(fetchImpl, limiter));
  assert.equal(await go(), CHECKOUT_URL);
  t += CHECKOUT_COOLDOWN_MS - 1;
  assert.equal(await go(), "/signup?error=recent");
  assert.equal(await go(email.toUpperCase()), "/signup?error=recent", "case does not dodge it");
  assert.equal(calls.filter((c) => c.url.includes("checkout/sessions")).length, 1, "one Checkout session in the window");
  assert.equal(await go(fixtureEmail()), CHECKOUT_URL, "another address is unaffected");
  t += 1;
  assert.equal(await go(), CHECKOUT_URL);
});

test("a Stripe failure gives the slot back so the visitor can retry", async () => {
  setup();
  const limiter = createCheckoutLimiter(() => 5);
  const email = fixtureEmail();
  const down = async (url) => (String(url).endsWith("/functions/v1/signup") ? json({ exists: false }) : json({}, 500));
  assert.equal(await payFirstTarget({ name: "Acme", email }, deps(down, limiter)), "/signup?error=billing");
  assert.equal(await payFirstTarget({ name: "Acme", email }, deps(world().fetchImpl, limiter)), CHECKOUT_URL);
});

/* ---------------------------------------------------------------------- the page */

test("confirm step: shows the typed email back, posts name + email, offers edit-back, escapes input", async () => {
  setup();
  const { default: SignupPage } = await import("../app/signup/page.tsx");
  const html = renderToStaticMarkup(SignupPage({ searchParams: { confirm: "1", name: "Acme Bakery", email: "owner@acme.example" } }));
  assert.match(html, /We(&#x27;|')ll send your sign-in link to owner@acme\.example/);
  assert.match(html, /<input type="hidden" name="email" value="owner@acme\.example"\/>/);
  assert.match(html, /<input type="hidden" name="name" value="Acme Bakery"\/>/);
  assert.match(html, /Continue to payment/);
  assert.match(html, /href="\/signup\?name=Acme\+Bakery&amp;email=owner%40acme\.example"/);
  assert.doesNotMatch(html, /name="from"|password/i);

  const evil = renderToStaticMarkup(SignupPage({ searchParams: { confirm: "1", name: "x", email: 'a"><script>alert(1)</script>@b.co' } }));
  assert.doesNotMatch(evil, /<script>/);
  // a confirm link with nothing usable falls back to the plain form
  assert.match(renderToStaticMarkup(SignupPage({ searchParams: { confirm: "1" } })), /Create <b>account<\/b>|Create account/);
  // the Shopify hand-off never shows the pay-first confirm step
  assert.doesNotMatch(renderToStaticMarkup(SignupPage({ searchParams: { confirm: "1", name: "x", email: "a@b.co", from: "shopify" } })), /Continue to payment/);
});

test("page branches: paid -> check your email; canceled -> a note and the form; errors; edit-back prefills", async () => {
  setup();
  const { default: SignupPage } = await import("../app/signup/page.tsx");
  assert.match(renderToStaticMarkup(SignupPage({ searchParams: { paid: "1" } })), /Check your email/);
  const canceled = renderToStaticMarkup(SignupPage({ searchParams: { canceled: "1" } }));
  assert.match(canceled, /canceled/);
  assert.match(canceled, /name="name"/);
  assert.match(renderToStaticMarkup(SignupPage({ searchParams: { error: "recent" } })), /10 minutes/);
  const prefilled = renderToStaticMarkup(SignupPage({ searchParams: { name: "Acme Bakery", email: "o@acme.example" } }));
  assert.match(prefilled, /value="Acme Bakery"/);
  assert.match(prefilled, /value="o@acme\.example"/);
});

/* ------------------------------------------------- Shopify path unchanged (action) */

test("?from=shopify still reaches the old signup function with the original body", async () => {
  setup();
  const seen = [];
  globalThis.fetch = async (input, init) => (seen.push({ url: String(input?.url ?? input), body: init?.body }), json({}, 200));
  const { signUp } = await import("../app/signup/actions.ts");
  const form = new FormData();
  form.set("from", "shopify");
  form.set("name", "Acme Bakery");
  form.set("email", "owner@acme.example");
  const { NextResponse } = await import("next/server");
  const request = new NextRequest(`${HUB}/signup`, { method: "POST", headers: { host: "connect.bcn-services.com" } });
  await actionAsyncStorage
    .run({ isAction: true }, () => requestAsyncStorage.run({ headers: request.headers, cookies: request.cookies, mutableCookies: NextResponse.next().cookies, draftMode: {} }, () => signUp(form)))
    .catch((error) => assert.ok(String(error?.digest).startsWith("NEXT_REDIRECT")));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `${SUPABASE_URL}/functions/v1/signup`);
  assert.deepEqual(JSON.parse(seen[0].body), { name: "Acme Bakery", email: "owner@acme.example" });
});

/* ------------------------------------------------------------- Manage billing */

const row = (over = {}) => ({ client_id: CLIENT, role: "owner", status: "active", paid_at: 1, grace_until: null, shopify_billed: false, stripe_customer_id: "cus_Ok1", ...over });

test("portalTarget with returnTo /team: return_url is <hub>/team; the default is still /pending", async () => {
  setup();
  const bodies = [];
  const fetchImpl = async (url, init) => (bodies.push(new URLSearchParams(init.body)), json({ url: PORTAL_URL }));
  const config = getConfig();
  assert.equal(await portalTarget(parseBillingSelf(row()), config, fetchImpl, "/team"), PORTAL_URL);
  assert.equal(bodies[0].get("return_url"), `${HUB}/team`);
  assert.equal(bodies[0].get("customer"), "cus_Ok1");
  await portalTarget(parseBillingSelf(row()), config, fetchImpl);
  assert.equal(bodies[1].get("return_url"), `${HUB}/pending`);
  assert.equal(await portalTarget(parseBillingSelf(row({ role: "member" })), config, fetchImpl, "/team"), "/team?error=owner");
  assert.equal(await portalTarget(parseBillingSelf(row({ stripe_customer_id: null })), config, fetchImpl, "/team"), "/team");
  assert.equal(await portalTarget(parseBillingSelf(row()), config, async () => json({}, 500), "/team"), "/team?error=billing");
});

function inRequest(request, fn) {
  return requestAsyncStorage.run({ headers: request.headers, cookies: request.cookies, mutableCookies: request.cookies, draftMode: {} }, fn);
}
const b64url = (v) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
const sessionCookie = (claims) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `header.${b64url({ sub: USER_ID, email: USER.email, exp, ...claims })}.signature`;
  return `sb-${PROJECT_REF}-auth-token=base64-${b64url({ access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: USER })}`;
};

async function renderTeam(role, billingRow) {
  setup();
  globalThis.fetch = async (input) => {
    const u = String(input?.url ?? input);
    if (u.includes("/auth/v1/user")) return json(USER);
    if (u.includes("/rpc/billing_self")) return json(billingRow);
    if (u.includes("memberships_v1")) return json([{ user_id: USER_ID, role, is_smoke: false, created_at: "2026-01-01T00:00:00Z" }]);
    return json([]);
  };
  const { default: TeamPage } = await import("../app/team/page.tsx");
  const cookie = sessionCookie({ client_id: CLIENT, client_role: role });
  const request = new NextRequest(`${HUB}/team`, { headers: { host: "connect.bcn-services.com", cookie } });
  return renderToStaticMarkup(await inRequest(request, () => TeamPage({ searchParams: {} })));
}

test("/team: an owner with a Stripe customer sees Manage billing; a member sees no billing panel", async () => {
  const owner = await renderTeam("owner", row());
  assert.match(owner, /Manage billing/);
  assert.match(owner, /\$50\/mo/);
  const member = await renderTeam("member", row({ role: "member", stripe_customer_id: null }));
  assert.doesNotMatch(member, /Manage billing|Billing/);
});

test("/team: a Shopify-billed or pending owner gets one plain line and no button", async () => {
  const shopify = await renderTeam("owner", row({ shopify_billed: true }));
  assert.match(shopify, /handled through Shopify/);
  assert.doesNotMatch(shopify, /Manage billing/);
  const pending = await renderTeam("owner", row({ status: "pending", paid_at: null, stripe_customer_id: null }));
  assert.match(pending, /nothing to manage/);
  assert.doesNotMatch(pending, /Manage billing/);
});

/* ------------------------------------------- /pending keeps Pay for existing owners */

test("/pending is unchanged: a pending owner and a lapsed (paused after paying) owner still get Pay", async () => {
  setup();
  const { default: PendingPage } = await import("../app/pending/page.tsx");
  for (const over of [{ status: "pending", paid_at: null, stripe_customer_id: null }, { status: "paused", paid_at: 1, stripe_customer_id: "cus_Ok1" }]) {
    globalThis.fetch = async (input) => {
      const u = String(input?.url ?? input);
      if (u.includes("/auth/v1/user")) return json(USER);
      if (u.includes("/rpc/billing_self")) return json(row(over));
      return json([]);
    };
    const request = new NextRequest(`${HUB}/pending`, { headers: { host: "connect.bcn-services.com", cookie: sessionCookie({ client_status: over.status }) } });
    const html = renderToStaticMarkup(await inRequest(request, () => PendingPage({ searchParams: {} })));
    assert.match(html, /Pay \$50\/mo/, JSON.stringify(over));
  }
});
