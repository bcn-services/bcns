/**
 * The Shopify-initiated install (W6a): Shopify opens the app URL with a signed
 * query and no bcns session. OAuth must start at once, and the shop must never
 * be bound to a tenant until an owner signs in. Run against the real routes and
 * middleware with no Supabase env, so any session read would redirect to /login
 * instead of producing the asserted response.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import {
  ALT_APP,
  FINISH_PATH,
  INSTALL_CLIENT_ID,
  INSTALL_TIMESTAMP_MAX_AGE_MS,
  finishErrorCode,
  STATE_TTL_MS,
  hasActiveSubscription,
  isFreshInstallTimestamp,
  managedPricingGate,
  managedPricingRedirect,
  paidThrough,
  shopGid,
  PENDING_COOKIE,
  PENDING_TTL_MS,
  openPending,
  planSelectionUrl,
  registerUninstallWebhook,
  sealPending,
  signState,
  storeHandleFromHost,
  subscriptionOutcome,
  verifyState,
} from "../lib/shopify-oauth.ts";

const HUB = "https://connect.bcn-services.com";
const SECRET = "shpss_install_secret";
const SHOP = "bcns-data-dev.myshopify.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const APP_HANDLE = "bcns-connect";
// The install fixture's `host` decodes to this handle, deliberately different
// from SHOP's subdomain (bcns-data-dev) — the whole point of storeHandleFromHost
// is that the two are not the same thing.
const STORE_HANDLE = "bcns-test-store";
const INSTALL_HOST = "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvYmNucy10ZXN0LXN0b3Jl"; // admin.shopify.com/store/bcns-test-store
const PLAN_URL = `https://admin.shopify.com/store/${STORE_HANDLE}/charges/${APP_HANDLE}/pricing_plans`;
const PLAN_URL_FALLBACK = `https://${SHOP}/admin/charges/${APP_HANDLE}/pricing_plans`;
const SHOP_GID = "gid://shopify/Shop/5678";
const ADMIN_SUBSCRIPTIONS_QUERY = "query{currentAppInstallation{activeSubscriptions{id name status}}}";
const ALT_SHOP = "sb-bridge-shop.myshopify.com";
const ALT_SECRET = "alt-secret";
const GRANTED_SCOPE =
  "read_orders,read_all_orders,read_products,read_inventory,read_shopify_payments_accounts,read_shopify_payments_payouts,read_reports,read_customers";

Object.assign(process.env, {
  SHOPIFY_CLIENT_ID: "cid",
  SHOPIFY_CLIENT_SECRET: SECRET,
  OAUTH_APPROVED_SOURCES: "shopify",
  HUB_BASE_URL: HUB,
  SHOPIFY_APP_HANDLE: APP_HANDLE,
  SHOPIFY_ALT_SHOP: ALT_SHOP,
  SHOPIFY_ALT_CLIENT_ID: "alt-cid",
  SHOPIFY_ALT_CLIENT_SECRET: ALT_SECRET,
});
// session.ts wraps loaders in React's server-only cache(); absent outside Next.
const react = createRequire(import.meta.url)("react");
react.cache ??= (fn) => fn;
const { NextRequest, NextResponse } = await import("next/server");

function signQuery(params, secret) {
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac")
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
  return params;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const installQuery = (secret = SECRET, timestamp = String(nowSec())) =>
  signQuery(new URLSearchParams({ host: INSTALL_HOST, shop: SHOP, timestamp }), secret);

const TOKEN = {
  clientId: CLIENT,
  shop: SHOP,
  accessToken: "shpat_x",
  refreshToken: "shprt_y",
  expiresAt: "2026-09-21T01:00:00.000Z",
  storeHandle: null,
};

/* ------------------------------------------------------- the sealed hand-off */

test("pending round-trips and binds a tenant-bound handshake to that tenant only", () => {
  const sealed = sealPending(TOKEN, SECRET, 1_000);
  assert.deepEqual(openPending(sealed, SECRET, CLIENT, 1_000), { ok: true, pending: { ...TOKEN, exp: 1_000 + PENDING_TTL_MS } });
  assert.deepEqual(openPending(sealed, SECRET, OTHER, 1_000), { ok: false, reason: "tenant_mismatch" });
});

test("an install-initiated hand-off binds to whichever owner signs in", () => {
  const sealed = sealPending({ ...TOKEN, clientId: INSTALL_CLIENT_ID }, SECRET);
  assert.equal(openPending(sealed, SECRET, OTHER).ok, true);
});

test("pending refuses expiry, wrong key, tampering and garbage", () => {
  const sealed = sealPending(TOKEN, SECRET, 1_000);
  assert.equal(openPending(sealed, SECRET, CLIENT, 1_000 + PENDING_TTL_MS + 1).reason, "expired");
  assert.equal(openPending(sealed, "other-secret", CLIENT, 1_000).reason, "malformed");
  const raw = Buffer.from(sealed, "base64url");
  raw[raw.length - 1] ^= 1;
  assert.equal(openPending(raw.toString("base64url"), SECRET, CLIENT, 1_000).reason, "malformed");
  for (const bad of [null, "", "abc", "x".repeat(80)]) assert.equal(openPending(bad, SECRET, CLIENT).ok, false);
});

test("the sealed cookie does not carry the token in the clear", () => {
  const sealed = sealPending(TOKEN, SECRET);
  assert.doesNotMatch(Buffer.from(sealed, "base64url").toString("latin1"), /shpat_x|shprt_y/);
});

/* --------------------------------------------------------------- middleware */

test("middleware redirects Shopify's app-URL hit to /start, query intact, and gates the rest", async () => {
  const { middleware } = await import("../middleware.ts");
  const query = installQuery().toString();
  const res = await middleware(new NextRequest(`${HUB}/?${query}`));
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), `${HUB}/api/oauth/shopify/start?${query}`);
  // No hmac: the ordinary tenant gate (a pass-through here, with no Supabase env).
  const plain = await middleware(new NextRequest(`${HUB}/?shop=${SHOP}`));
  assert.equal(plain.headers.get("location"), null);
});

test("middleware sends Shopify's install hit to the PUBLIC hub URL even when the internal request is plain-HTTP localhost behind nginx", async () => {
  // Production: nginx terminates TLS and proxies plain HTTP to 127.0.0.1:3102,
  // so the request Next actually sees is the internal origin, not the public
  // hub URL. A NextResponse.rewrite() built from that internal URL sends
  // Next's own proxy an https://localhost:3102 target — TLS against a
  // plaintext port (EPROTO) — and every install 500s. The redirect must go to
  // the public hub URL regardless of what internal host/protocol nginx handed
  // this request, with the HMAC-signed query passed through byte-for-byte.
  const { middleware } = await import("../middleware.ts");
  const query = installQuery().toString();
  const res = await middleware(new NextRequest(`https://localhost:3102/?${query}`));
  const location = res.headers.get("location");
  assert.ok(location, "middleware must redirect, not silently pass through or rewrite");
  const target = new URL(location);
  const expectedOrigin = new URL(HUB);
  assert.equal(target.protocol, expectedOrigin.protocol);
  assert.equal(target.host, expectedOrigin.host);
  assert.equal(target.pathname, "/api/oauth/shopify/start");
  assert.equal(target.search, `?${query}`);
});

/* -------------------------------------------------------------------- /start */

test("start: a Shopify-signed install goes straight to the consent screen, no session", async () => {
  const { GET } = await import("../app/api/oauth/shopify/start/route.ts");
  const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start?${installQuery()}`));
  assert.equal(res.status, 307);
  const location = new URL(res.headers.get("location"));
  assert.equal(location.origin, `https://${SHOP}`);
  assert.equal(location.pathname, "/admin/oauth/authorize");
  const state = location.searchParams.get("state");
  const verified = verifyState(state, SECRET, SHOP);
  assert.ok(verified.ok);
  assert.equal(verified.payload.clientId, INSTALL_CLIENT_ID);
  assert.equal(res.cookies.get("shopify_oauth_state")?.value, state);
});

test("start: a forged install query never reaches Shopify", async () => {
  const { GET } = await import("../app/api/oauth/shopify/start/route.ts");
  const forged = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start?${installQuery("attacker-key")}`));
  assert.equal(forged.headers.get("location"), `${HUB}/?error=connect-failed`);
  const tampered = installQuery();
  tampered.set("shop", "evil-store.myshopify.com");
  const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start?${tampered}`));
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
});

test("install timestamp: fresh passes; stale, far-future, missing and junk fail", () => {
  const now = 1_800_000_000_000;
  const at = (sec) => isFreshInstallTimestamp(String(sec), now);
  assert.equal(at(now / 1000), true);
  assert.equal(at(now / 1000 - INSTALL_TIMESTAMP_MAX_AGE_MS / 1000), true);
  assert.equal(at(now / 1000 - INSTALL_TIMESTAMP_MAX_AGE_MS / 1000 - 1), false);
  assert.equal(at(now / 1000 + 60), true);
  assert.equal(at(now / 1000 + 120), false);
  for (const junk of [null, undefined, "", "abc", "1.5", "-1", "1e9", "9".repeat(13)]) {
    assert.equal(isFreshInstallTimestamp(junk, now), false, String(junk));
  }
});

test("start: a correctly signed but stale install query never reaches Shopify", async () => {
  const { GET } = await import("../app/api/oauth/shopify/start/route.ts");
  const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start?${installQuery(SECRET, String(nowSec() - 3600))}`));
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
  // The callback's HMAC check is untouched: its own old timestamp still passes below.
});

function captureWarn() {
  const real = console.warn;
  const logged = [];
  console.warn = (...a) => logged.push(a.join(" "));
  return { logged, restore: () => { console.warn = real; } };
}

test("start: a reject logs the reason code and shop, and nothing sensitive (hmac/secret/state/token/cookie)", async () => {
  const { GET } = await import("../app/api/oauth/shopify/start/route.ts");
  const { logged, restore } = captureWarn();
  try {
    const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start?${installQuery("attacker-key")}`));
    assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
  } finally {
    restore();
  }
  const lines = logged.join("\n");
  assert.match(lines, /\[connect\] shopify start rejected \(connect-failed\)/);
  assert.match(lines, new RegExp(`shop=${SHOP}`));
  // Nothing from the (forged) query string leaks into the log line.
  assert.doesNotMatch(lines, /attacker-key/);
});

test("start: invalid-shop rejects and logs even with no usable shop to name", async () => {
  const { GET } = await import("../app/api/oauth/shopify/start/route.ts");
  const { logged, restore } = captureWarn();
  try {
    const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start`));
    assert.equal(res.headers.get("location"), `${HUB}/?error=invalid-shop`);
  } finally {
    restore();
  }
  assert.match(logged.join("\n"), /\[connect\] shopify start rejected \(invalid-shop\): shop=none/);
});

test("start: the state cookie's maxAge equals STATE_TTL_MS in seconds, not a second hardcoded value", async () => {
  const { GET } = await import("../app/api/oauth/shopify/start/route.ts");
  const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/start?${installQuery()}`));
  const cookie = res.cookies.get("shopify_oauth_state");
  assert.ok(cookie, "expected the state cookie to be set");
  assert.equal(cookie.maxAge, STATE_TTL_MS / 1000);
  assert.equal(STATE_TTL_MS / 1000, 300, "sanity: 5 minutes");
});

/* ----------------------------------------------------------------- /callback */

/** A callback that only ever exchanges a code — no subscription check runs here any more (moved to /finish). */
function tokenExchangeOnly(accessToken = "shpat_x", refreshToken = "shprt_y") {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (!String(url).includes("/oauth/access_token")) throw new Error(`unexpected fetch: ${url}`);
    return new Response(
      JSON.stringify({ access_token: accessToken, scope: GRANTED_SCOPE, expires_in: 3600, refresh_token: refreshToken }),
      { status: 200 }
    );
  };
  fetchImpl.callCount = () => calls;
  return fetchImpl;
}

test("callback: an install-initiated handshake exchanges, seals storeHandle from host, and hands off to /finish without a session or a subscription check", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, host: INSTALL_HOST, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  const fetchImpl = tokenExchangeOnly();
  globalThis.fetch = fetchImpl;
  try {
    const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
    assert.equal(res.headers.get("location"), `${HUB}${FINISH_PATH}`);
    assert.equal(fetchImpl.callCount(), 1, "callback must make exactly one fetch: the token exchange, never a subscription check");
    const opened = openPending(res.cookies.get(PENDING_COOKIE)?.value, SECRET, OTHER);
    assert.ok(opened.ok);
    assert.equal(opened.pending.accessToken, "shpat_x");
    assert.equal(opened.pending.refreshToken, "shprt_y");
    assert.equal(opened.pending.shop, SHOP);
    assert.equal(opened.pending.storeHandle, STORE_HANDLE, "storeHandle decoded from host and sealed for /finish");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("callback: a missing or malformed host seals storeHandle as null, never throws", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  // No `host` param at all.
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = tokenExchangeOnly();
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(res.headers.get("location"), `${HUB}${FINISH_PATH}`);
  const opened = openPending(res.cookies.get(PENDING_COOKIE)?.value, SECRET, OTHER);
  assert.ok(opened.ok);
  assert.equal(opened.pending.storeHandle, null);
});

test("callback: the bridge app (SB, SHOPIFY_ALT_*) hands off to /finish byte-for-byte as today", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: ALT_SHOP, clientId: INSTALL_CLIENT_ID }, ALT_SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: ALT_SHOP, state, timestamp: "1700000000" }), ALT_SECRET);
  const realFetch = globalThis.fetch;
  const fetchImpl = tokenExchangeOnly("shpat_bridge", "shprt_bridge");
  globalThis.fetch = fetchImpl;
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetchImpl.callCount(), 1, "bridge path must never query for a subscription");
  assert.equal(res.headers.get("location"), `${HUB}${FINISH_PATH}`);
  // Sealed under the DEFAULT app's secret regardless of which app issued the token (callback/route.ts step 7).
  const opened = openPending(res.cookies.get(PENDING_COOKIE)?.value, SECRET, OTHER);
  assert.ok(opened.ok);
  assert.equal(opened.pending.app, ALT_APP);
  assert.equal(opened.pending.clientId, "");
  assert.equal(opened.pending.shop, ALT_SHOP);
  assert.equal(opened.pending.accessToken, "shpat_bridge");
  assert.equal(opened.pending.refreshToken, "shprt_bridge");
  const stateCookie = res.cookies.get("shopify_oauth_state");
  assert.ok(stateCookie && stateCookie.value === "", "state cookie cleared");
  const pendingCookie = res.cookies.get(PENDING_COOKIE);
  assert.equal(pendingCookie.httpOnly, true);
  assert.equal(pendingCookie.path, "/api/oauth/shopify");
  assert.equal(pendingCookie.maxAge, PENDING_TTL_MS / 1000);
});

test("planSelectionUrl prefers the store handle, and falls back to the shop only when there is no host", () => {
  assert.equal(planSelectionUrl(SHOP, APP_HANDLE, STORE_HANDLE), PLAN_URL);
  assert.equal(planSelectionUrl(SHOP, APP_HANDLE, null), PLAN_URL_FALLBACK);
});

test("storeHandleFromHost: decodes a handle that differs from the shop's own subdomain; null on missing or malformed host, never throws", () => {
  assert.equal(storeHandleFromHost(INSTALL_HOST), STORE_HANDLE);
  assert.notEqual(STORE_HANDLE, SHOP.split(".")[0], "sanity: the fixture handle really does differ from the subdomain");
  assert.equal(storeHandleFromHost(null), null);
  assert.equal(storeHandleFromHost(""), null);
  assert.equal(storeHandleFromHost("YWRtaW4uc2hvcGlmeS5jb20"), null); // "admin.shopify.com", no /store/<handle>
  assert.equal(storeHandleFromHost("not-valid-base64url!!"), null);
});

test("managedPricingGate: gates every install-initiated public-app pending; only the bridge app and a tenant-bound pending skip it", () => {
  // Rule 1.2.2: there is no "already connected" exemption — an existing client's
  // "Open app" and a reinstall take this same path and must be checked too.
  assert.equal(managedPricingGate({ clientId: INSTALL_CLIENT_ID }), true);
  // D.3: the bridge app is billed off-platform.
  assert.equal(managedPricingGate({ clientId: INSTALL_CLIENT_ID, app: ALT_APP }), false);
  // D.1 / NIT C: a tenant-bound (hub-initiated) pending skips the gate.
  assert.equal(managedPricingGate({ clientId: CLIENT }), false);
});

test("subscriptionOutcome: only an active subscription writes; everything else goes to the plan page", () => {
  assert.equal(subscriptionOutcome({ active: true }), "write");
  for (const reason of ["http_error", "graphql_error", "malformed", "timeout", "network_error", "none_active"]) {
    assert.equal(subscriptionOutcome({ active: false, reason }), "plan_page");
  }
});

test("hasActiveSubscription: true only with an ACTIVE entry; fails closed on http error, graphql error, malformed body, timeout and network error", async () => {
  const withBody = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
  assert.deepEqual(
    await hasActiveSubscription(SHOP, "shpat_x", withBody({ data: { currentAppInstallation: { activeSubscriptions: [{ status: "PENDING" }, { status: "ACTIVE" }] } } })),
    { active: true }
  );
  assert.deepEqual(
    await hasActiveSubscription(SHOP, "shpat_x", withBody({ data: { currentAppInstallation: { activeSubscriptions: [{ status: "PENDING" }] } } })),
    { active: false, reason: "none_active" }
  );
  assert.deepEqual(await hasActiveSubscription(SHOP, "shpat_x", withBody({}, 500)), { active: false, reason: "http_error" });
  assert.deepEqual(await hasActiveSubscription(SHOP, "shpat_x", withBody({ errors: [{ message: "boom" }] })), { active: false, reason: "graphql_error" });
  assert.deepEqual(await hasActiveSubscription(SHOP, "shpat_x", withBody({ data: {} })), { active: false, reason: "malformed" });
  assert.deepEqual(
    await hasActiveSubscription(SHOP, "shpat_x", async () => { throw new DOMException("timed out", "TimeoutError"); }),
    { active: false, reason: "timeout" }
  );
  assert.deepEqual(
    await hasActiveSubscription(SHOP, "shpat_x", async () => { throw new Error("ECONNRESET"); }),
    { active: false, reason: "network_error" }
  );
});

test("hasActiveSubscription: the GraphQL query drops the unused `test` field and the fetch is never cached", async () => {
  let seen;
  await hasActiveSubscription(SHOP, "shpat_x", async (_url, init) => {
    seen = init;
    return new Response(JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: [] } } }), { status: 200 });
  });
  assert.equal(seen.cache, "no-store");
  const body = JSON.parse(seen.body);
  // Byte-identical to before the Partner check: nothing new rides on a paying client's fast path.
  assert.equal(body.query, ADMIN_SUBSCRIPTIONS_QUERY);
  assert.doesNotMatch(body.query, /\btest\b/);
});

test("registerUninstallWebhook: subscribes the shop to APP_UNINSTALLED at the hub's route, with the merchant's token, uncached", async () => {
  let url, init;
  const result = await registerUninstallWebhook(SHOP, "shpat_x", HUB, async (u, i) => {
    url = u;
    init = i;
    return new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { userErrors: [] } } }), { status: 200 });
  });
  assert.deepEqual(result, { ok: true });
  assert.match(url, new RegExp(`^https://${SHOP}/admin/api/[0-9-]+/graphql\\.json$`));
  assert.equal(init.headers["X-Shopify-Access-Token"], "shpat_x");
  assert.equal(init.cache, "no-store");
  const body = JSON.parse(init.body);
  assert.match(body.query, /webhookSubscriptionCreate\(topic:\$topic,webhookSubscription:\$sub\)/);
  assert.deepEqual(body.variables, { topic: "APP_UNINSTALLED", sub: { uri: `${HUB}/api/webhooks/shopify/app-uninstalled` } });
});

test("registerUninstallWebhook: a repeat registration is success; a real userError and every transport failure are not, and none throws", async () => {
  const withBody = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
  const userErrors = (...messages) => ({ data: { webhookSubscriptionCreate: { userErrors: messages.map((message) => ({ field: ["webhookSubscription", "uri"], message })) } } });
  const run = (fetchImpl) => registerUninstallWebhook(SHOP, "shpat_x", HUB, fetchImpl);
  assert.deepEqual(await run(withBody(userErrors("Address for this topic has already been taken"))), { ok: true });
  assert.deepEqual(await run(withBody(userErrors("Address is not allowed"))), { ok: false, reason: "user_error" });
  assert.deepEqual(await run(withBody(userErrors("Address for this topic has already been taken", "Address is not allowed"))), { ok: false, reason: "user_error" });
  assert.deepEqual(await run(withBody({}, 401)), { ok: false, reason: "http_error" });
  assert.deepEqual(await run(withBody({ errors: [{ message: "boom" }] })), { ok: false, reason: "graphql_error" });
  assert.deepEqual(await run(withBody({ data: {} })), { ok: false, reason: "malformed" });
  assert.deepEqual(await run(async () => { throw new DOMException("timed out", "TimeoutError"); }), { ok: false, reason: "timeout" });
  assert.deepEqual(await run(async () => { throw new Error("ECONNRESET shpat_x"); }), { ok: false, reason: "network_error" });
});

test("finish route wiring: the uninstall webhook is registered after the write, public app only, and a failure only warns", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/oauth/shopify/finish/route.ts", import.meta.url), "utf8");
  const write = route.indexOf('rpc("connect_source"');
  const register = route.indexOf("registerUninstallWebhook(pending.shop");
  const done = route.indexOf("?connected=shopify");
  assert.ok(write > 0 && register > write && done > register, "register after the connect_source write and before the success redirect");
  assert.match(route, /if \(pending\.app !== ALT_APP\) \{\s+const registered = await registerUninstallWebhook\(/, "the bridge app must not be subscribed");
  // A failed registration warns with the reason and shop, and never returns fail() (the token is already stored).
  const block = route.slice(register, done);
  assert.match(block, /if \(!registered\.ok\) \{\s+console\.warn\(`[^`]*\$\{registered\.reason\}[^`]*shop=\$\{pending\.shop\}`\);\s+\}/);
  assert.doesNotMatch(block, /fail\(|accessToken\}|refreshToken/);
});

test("callback: a network failure during exchange redirects generically, deletes the state cookie, and logs only the error name and shop", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  const { logged, restore } = captureWarn();
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    restore();
    globalThis.fetch = realFetch;
  }
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
  const cookie = res.cookies.get("shopify_oauth_state");
  assert.ok(cookie, "expected the state cookie to still be present in the response, cleared");
  assert.equal(cookie.value, "", "deleted cookie must carry no value");
  assert.ok(cookie.expires && new Date(cookie.expires).getTime() <= Date.now(), "deleted cookie must be expired, not just absent maxAge");
  const lines = logged.join("\n");
  assert.match(lines, /\[connect\] shopify callback rejected \(exchange_network_error:TimeoutError\)/);
  assert.match(lines, new RegExp(`shop=${SHOP}`));
  assert.doesNotMatch(lines, /\.ts:\d+|node_modules|at exchange|at GET/, "no stack trace");
  assert.doesNotMatch(lines, /code=C|state=|timestamp=1700000000/, "no request params");
});

test("callback: a non-2xx exchange response logs only the bare numeric HTTP status, never the response body", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "invalid_request", error_description: "bad code" }), { status: 401 });
  const { logged, restore } = captureWarn();
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    restore();
    globalThis.fetch = realFetch;
  }
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
  const lines = logged.join("\n");
  assert.match(lines, /\[connect\] shopify callback rejected \(exchange_http_error:401\)/);
  assert.doesNotMatch(lines, /invalid_request|bad code/, "no response body in the log");
});

/* ------------------------------------------------------------------- /finish */

test("finish: Next's RSC self-fetch after sign-in does nothing", async () => {
  const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");
  const res = await GET(new NextRequest(`${HUB}${FINISH_PATH}`, { headers: { rsc: "1", cookie: `${PENDING_COOKIE}=x` } }));
  assert.equal(res.status, 204);
  assert.equal(res.cookies.get(PENDING_COOKIE), undefined);
});

test("finish: no hand-off cookie is a failure, not a write", async () => {
  const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");
  const res = await GET(new NextRequest(`${HUB}${FINISH_PATH}`));
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-expired`);
});

test("finish: an expired hand-off says so and carries the shop for one-click start again; billing/tenant gates untouched", async () => {
  const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");
  // Cookie gone (browser dropped it after 15 min), companion shop cookie still there.
  let res = await GET(new NextRequest(`${HUB}${FINISH_PATH}`, { headers: { cookie: `shopify_last_shop=${SHOP}` } }));
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-expired&shop=${SHOP}`);
  // Cookie present but past its exp (needs a session to get that far; signed out it goes to /login as before).
  // No companion cookie, or a junk one: expired error with no shop, never an unvalidated value.
  res = await GET(new NextRequest(`${HUB}${FINISH_PATH}`, { headers: { cookie: `shopify_last_shop=evil.example.com/x` } }));
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-expired`);
  const { reopenAppUrl } = await import("../lib/shopify-oauth.ts");
  assert.equal(reopenAppUrl(SHOP, APP_HANDLE), `https://${SHOP}/admin/apps/${APP_HANDLE}`);
  assert.equal(reopenAppUrl("evil.example.com", APP_HANDLE), null);
  assert.equal(reopenAppUrl(SHOP, undefined), null);
});

test("callback: the public app sets the non-secret shop companion cookie, the bridge app does not", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, host: INSTALL_HOST, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = tokenExchangeOnly();
  try {
    const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
    assert.equal(res.cookies.get("shopify_last_shop")?.value, SHOP);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("finish: signed out keeps the hand-off and sends the merchant to sign in, then back", async () => {
  const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");
  const sealed = sealPending({ ...TOKEN, clientId: INSTALL_CLIENT_ID }, SECRET);
  const res = await GET(new NextRequest(`${HUB}${FINISH_PATH}`, { headers: { cookie: `${PENDING_COOKIE}=${sealed}` } }));
  assert.equal(res.headers.get("location"), `${HUB}/login?next=${encodeURIComponent(FINISH_PATH)}`);
  assert.equal(res.cookies.get(PENDING_COOKIE), undefined, "the hand-off must survive the trip to /login");
});

/* ------------------------------------------------------ managedPricingRedirect */

/** A fake fail() matching the route's own: records the code, returns a distinguishable response. */
function fakeFail() {
  const codes = [];
  const fail = (code, hubError = "connect-failed") => {
    codes.push(code);
    return NextResponse.redirect(`${HUB}/?error=${hubError}`);
  };
  fail.codes = codes;
  return fail;
}

/** The gate's one RPC (api.shopify_shop_mismatch), answered from a fixed result. */
function fakeApi(result = { data: false, error: null }) {
  const calls = [];
  return { calls, rpc: async (fn, args) => (calls.push([fn, args]), result) };
}
const NO_MISMATCH = fakeApi();

/** A subscription-check fetch that never calls the network module — just answers the GraphQL POST. */
function subscriptionFetch(active) {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(
      JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: active ? [{ status: "ACTIVE" }] : [] } } }),
      { status: 200 }
    );
  };
  fetchImpl.callCount = () => calls;
  return fetchImpl;
}

const INSTALL_PENDING = { ...TOKEN, clientId: INSTALL_CLIENT_ID };

// Whether the tenant already has THIS shop cannot change the answer (rule 1.2.2 —
// a reinstall, or an existing client whose subscription lapsed, must see the plan
// page); the one database question the gate asks is whether it has a DIFFERENT one.
test("managedPricingRedirect: install-initiated, no active subscription -> redirect to the plan page, pending cookie deleted, fetch called once", async () => {
  const fetchImpl = subscriptionFetch(false);
  const result = await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl });
  assert.equal(result.status, 307);
  // INSTALL_PENDING inherits TOKEN.storeHandle (null), so planSelectionUrl falls back to the shop URL.
  assert.equal(result.headers.get("location"), PLAN_URL_FALLBACK);
  assert.equal(result.cookies.get(PENDING_COOKIE).value, "");
  assert.equal(fetchImpl.callCount(), 1);
});

test("managedPricingRedirect: install-initiated, active subscription -> null (write), and the subscription WAS checked", async () => {
  const fetchImpl = subscriptionFetch(true);
  const result = await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl });
  assert.equal(result, null);
  assert.equal(fetchImpl.callCount(), 1);
});

// SHOPIFY_APP_HANDLE only builds the plan-page URL, so it is only required when
// that redirect is: an existing client's "Open app" click must not depend on it.
test("managedPricingRedirect: an unset plan handle fails only when the plan page is needed; an active subscription still writes", async () => {
  const active = subscriptionFetch(true);
  const okFail = fakeFail();
  assert.equal(await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: undefined, fail: okFail, fetchImpl: active }), null);
  assert.deepEqual(okFail.codes, []);
  assert.equal(active.callCount(), 1);

  const none = subscriptionFetch(false);
  const fail = fakeFail();
  const result = await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: undefined, fail, fetchImpl: none });
  assert.equal(result.headers.get("location"), `${HUB}/?error=connect-failed`);
  assert.deepEqual(fail.codes, ["plan_handle_unconfigured"]);
  assert.equal(none.callCount(), 1);
});

// A tenant bound to shop X installing from shop Y must be refused BEFORE it can
// approve a charge: no subscription call, no plan page. data.attach_source's
// BCNS7 stays the authority; this is the same answer, asked early.
test("managedPricingRedirect: a tenant bound to a different shop is refused with shop-mismatch before any fetch or plan redirect", async () => {
  for (const active of [false, true]) {
    const fetchImpl = subscriptionFetch(active);
    const fail = fakeFail();
    const api = fakeApi({ data: true, error: null });
    const result = await managedPricingRedirect({ api, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail, fetchImpl });
    assert.equal(result.headers.get("location"), `${HUB}/?error=shop-mismatch`);
    assert.deepEqual(fail.codes, ["shop_mismatch"]);
    assert.equal(fetchImpl.callCount(), 0);
    assert.deepEqual(api.calls, [["shopify_shop_mismatch", { p_shop: SHOP }]]);
  }
});

test("managedPricingRedirect: a failed or non-boolean mismatch read is the generic error page -- never the plan page, never the write", async () => {
  const reads = {
    "rpc error": { data: null, error: { code: "PGRST202" } },
    "error with stale data": { data: false, error: { code: "57014" } },
    "null data": { data: null, error: null },
    "non-boolean data": { data: "false", error: null },
  };
  for (const [name, read] of Object.entries(reads)) {
    for (const active of [false, true]) {
      const fetchImpl = subscriptionFetch(active);
      const fail = fakeFail();
      const result = await managedPricingRedirect({ api: fakeApi(read), pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail, fetchImpl });
      assert.equal(result?.headers.get("location"), `${HUB}/?error=connect-failed`, name);
      assert.deepEqual(fail.codes, ["shop_check"], name);
      assert.equal(fetchImpl.callCount(), 0, name);
    }
  }
});

test("managedPricingRedirect: the same shop (no mismatch) proceeds to the subscription check", async () => {
  const fetchImpl = subscriptionFetch(true);
  const api = fakeApi({ data: false, error: null });
  assert.equal(await managedPricingRedirect({ api, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl }), null);
  assert.equal(api.calls.length, 1);
  assert.equal(fetchImpl.callCount(), 1);
});

// /callback's new grant has already killed an existing client's stored refresh
// token, so one blip must not throw the fresh token away. Retried once, only for
// failures that say nothing about the subscription, and still fail-closed.
function sequenceFetch(...steps) {
  let calls = 0;
  const fetchImpl = async () => {
    const step = steps[Math.min(calls++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return new Response(typeof step.body === "string" ? step.body : JSON.stringify(step.body), { status: step.status });
  };
  fetchImpl.callCount = () => calls;
  return fetchImpl;
}
const ACTIVE_BODY = { data: { currentAppInstallation: { activeSubscriptions: [{ status: "ACTIVE" }] } } };
const NONE_BODY = { data: { currentAppInstallation: { activeSubscriptions: [] } } };
const timeoutError = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });
const TRANSIENT = {
  http_error: () => ({ status: 503, body: "unavailable" }),
  network_error: () => new Error("ECONNRESET"),
  timeout: timeoutError,
};

test("managedPricingRedirect: a transient check failure is retried once -- then active writes (2 fetches), twice transient is the plan page (2 fetches)", async () => {
  for (const [name, transient] of Object.entries(TRANSIENT)) {
    const recovers = sequenceFetch(transient(), { status: 200, body: ACTIVE_BODY });
    assert.equal(await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl: recovers }), null, name);
    assert.equal(recovers.callCount(), 2, name);

    const stays = sequenceFetch(transient(), transient(), { status: 200, body: ACTIVE_BODY });
    const fail = fakeFail();
    const result = await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail, fetchImpl: stays });
    assert.equal(result?.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.deepEqual(fail.codes, [], name);
    assert.equal(stays.callCount(), 2, `${name}: exactly one retry`);
  }
});

test("managedPricingRedirect: a definitive answer is never retried -- none_active, graphql_error and malformed are the plan page after exactly 1 fetch", async () => {
  const definitive = {
    none_active: { status: 200, body: NONE_BODY },
    graphql_error: { status: 200, body: { errors: [{ message: "throttled" }] } },
    malformed: { status: 200, body: { data: {} } },
  };
  for (const [name, first] of Object.entries(definitive)) {
    // A retry would find ACTIVE and write: the count AND the outcome both catch one.
    const fetchImpl = sequenceFetch(first, { status: 200, body: ACTIVE_BODY });
    const result = await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl });
    assert.equal(result?.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.equal(fetchImpl.callCount(), 1, name);
  }
});

test("managedPricingRedirect: the bridge app and a tenant-bound pending skip the gate entirely -- no fetch, no rpc", async () => {
  const bridgeFetch = subscriptionFetch(false);
  const skippedApi = fakeApi({ data: true, error: null });
  const bridgeResult = await managedPricingRedirect({
    api: skippedApi,
    pending: { ...INSTALL_PENDING, app: ALT_APP },
    appHandle: APP_HANDLE,
    fail: fakeFail(),
    fetchImpl: bridgeFetch,
  });
  assert.equal(bridgeResult, null);
  assert.equal(bridgeFetch.callCount(), 0);

  const hubFetch = subscriptionFetch(false);
  const hubResult = await managedPricingRedirect({
    api: skippedApi,
    pending: { ...TOKEN, clientId: CLIENT },
    appHandle: APP_HANDLE,
    fail: fakeFail(),
    fetchImpl: hubFetch,
  });
  assert.equal(hubResult, null);
  assert.equal(hubFetch.callCount(), 0);
  assert.deepEqual(skippedApi.calls, []);
});

/* ------------------------------------- paid period after an uninstall (Partner API) */

// An uninstall cancels the subscription, so the Admin check says none_active, yet
// Shopify's plan page has nothing to approve until the period ends. Only then, and
// only with all three Partner values, is the shop's id fetched and the Partner API asked.
const PARTNER = { token: "prtapi_partner_secret", orgId: "5179321", appGid: "gid://shopify/App/1234" };
const PARTNER_URL = "https://partners.shopify.com/5179321/api/2026-07/graphql.json";
const ADMIN_URL = `https://${SHOP}/admin/api/2026-07/graphql.json`;
const NOW = Date.parse("2026-09-30T17:00:00Z");
const cycle = (endTime) => ({ data: { activeSubscription: { currentBillingCycle: { endTime } } } });
/** A free trial: Shopify documents currentBillingCycle as null until it ends. */
const trial = (trialEndsAt) => ({ data: { activeSubscription: { trialEndsAt, currentBillingCycle: null } } });
const PAID = { status: 200, body: cycle("2026-10-25T16:29:00Z") };
const SHOP_ID_OK = { status: 200, body: { data: { shop: { id: SHOP_GID } } } };

/**
 * Admin subscription steps in order (as sequenceFetch), one fixed shop-id step and
 * one fixed Partner step; records which of the three each call was.
 */
function gateFetch(adminSteps, partnerStep, shopStep = SHOP_ID_OK) {
  const calls = [];
  const admin = sequenceFetch(...adminSteps);
  const shop = sequenceFetch(shopStep);
  const partner = sequenceFetch(partnerStep);
  const fetchImpl = async (url, init) => {
    const kind = String(url).startsWith("https://partners.shopify.com/")
      ? "partner"
      : JSON.parse(init.body).query === "query{shop{id}}" ? "shop" : "admin";
    calls.push({ url: String(url), init, kind });
    return { admin, shop, partner }[kind](url, init);
  };
  fetchImpl.calls = calls;
  fetchImpl.kinds = () => calls.map((c) => c.kind);
  return fetchImpl;
}
const gate = (fetchImpl, over = {}) =>
  managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl, partner: PARTNER, now: NOW, ...over });

/** Runs `fn` with console.info/warn captured; returns [result, lines]. */
async function withLogs(fn) {
  const lines = [];
  const { info, warn } = console;
  console.info = console.warn = (...args) => lines.push(args.join(" "));
  try {
    return [await fn(), lines];
  } finally {
    Object.assign(console, { info, warn });
  }
}

test("shopGid: its own `query{shop{id}}` to the shop with the merchant token, uncached; null on any failure or a non-Shop GID, never throws", async () => {
  let url, init;
  assert.equal(await shopGid(SHOP, "shpat_x", async (u, i) => ([url, init] = [u, i], new Response(JSON.stringify(SHOP_ID_OK.body)))), SHOP_GID);
  assert.equal(url, ADMIN_URL);
  assert.equal(JSON.parse(init.body).query, "query{shop{id}}");
  assert.equal(init.headers["X-Shopify-Access-Token"], "shpat_x");
  assert.equal(init.cache, "no-store");
  const bad = {
    "http 500": { status: 500, body: "boom" },
    "graphql error": { status: 200, body: { errors: [{ message: "access denied" }], data: { shop: { id: SHOP_GID } } } },
    "an App GID": { status: 200, body: { data: { shop: { id: "gid://shopify/App/1" } } } },
    "a suffixed GID": { status: 200, body: { data: { shop: { id: `${SHOP_GID}/x` } } } },
    "a number": { status: 200, body: { data: { shop: { id: 5678 } } } },
    "no shop": { status: 200, body: { data: { shop: null } } },
    "not json": { status: 200, body: "<html>" },
    timeout: timeoutError(),
    "network error": new Error("ECONNRESET"),
  };
  for (const [name, step] of Object.entries(bad)) assert.equal(await shopGid(SHOP, "shpat_x", sequenceFetch(step)), null, name);
});

test("paidThrough: asks the Partner API for this app and shop, with the partner token, uncached, never following a redirect", async () => {
  let url, init;
  const result = await paidThrough(SHOP_GID, PARTNER, async (u, i) => {
    [url, init] = [u, i];
    return new Response(JSON.stringify(PAID.body), { status: 200 });
  }, NOW);
  assert.deepEqual(result, { paid: true, until: "2026-10-25T16:29:00.000Z" });
  assert.equal(url, PARTNER_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.equal(init.headers["X-Shopify-Access-Token"], PARTNER.token);
  const body = JSON.parse(init.body);
  assert.equal(body.query, "query($appId:ID!,$shopId:ID!){activeSubscription(appId:$appId,shopId:$shopId){currentBillingCycle{endTime}}}");
  assert.deepEqual(body.variables, { appId: PARTNER.appGid, shopId: SHOP_GID });

  // What fetch does with a 3xx: rejects under redirect "error", follows (token and all) otherwise.
  const redirecting = async (_u, i) => {
    if (i.redirect === "error") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(PAID.body), { status: 200 });
  };
  assert.deepEqual(await paidThrough(SHOP_GID, PARTNER, redirecting, NOW), { paid: false, reason: "network_error" });
});

test("paidThrough: paid only with a zoned ISO endTime still in the future; every other answer has its own reason and none throws", async () => {
  const cases = [
    ["no_subscription", { status: 200, body: { data: { activeSubscription: null } } }],
    ["period_ended", { status: 200, body: cycle("2026-09-30T16:59:59Z") }],
    ["period_ended", { status: 200, body: cycle("2026-09-30T17:00:00Z") }], // exactly `now` is over
    ["bad_end_time", { status: 200, body: cycle("soon") }],
    ["bad_end_time", { status: 200, body: cycle("2026-10-25T16:29:00") }], // no zone: Date.parse would read local time
    ["bad_end_time", { status: 200, body: cycle("2026-10-25") }],
    ["bad_end_time", { status: 200, body: cycle("Sun, 25 Oct 2026 16:29:00 GMT") }],
    // A free trial is never a paid period, even with its end still in the future.
    ["bad_end_time", { status: 200, body: trial("2026-10-10T00:00:00Z") }],
    ["bad_end_time", { status: 200, body: trial(null) }],
    // An ended cycle is not rescued by a later trial end.
    ["period_ended", { status: 200, body: { data: { activeSubscription: { trialEndsAt: "2026-12-01T00:00:00Z", currentBillingCycle: { endTime: "2026-09-01T00:00:00Z" } } } } }],
    ["malformed", { status: 200, body: { data: {} } }],
    ["graphql_error", { status: 200, body: { errors: [{ message: "access denied" }] } }],
    ["graphql_error", { status: 200, body: "<html>" }],
    ["http_401", { status: 401, body: "unauthorized" }],
    ["http_404", { status: 404, body: "not found" }],
    ["http_503", { status: 503, body: "unavailable" }],
    ["timeout", timeoutError()],
    ["network_error", new Error("ECONNRESET")],
  ];
  for (const [reason, step] of cases) {
    assert.deepEqual(await paidThrough(SHOP_GID, PARTNER, sequenceFetch(step), NOW), { paid: false, reason }, `${reason}: ${JSON.stringify(step.body)}`);
  }
  // An explicit offset is a zone too.
  assert.deepEqual(await paidThrough(SHOP_GID, PARTNER, sequenceFetch({ status: 200, body: cycle("2026-10-25T18:29:00.5+02:00") }), NOW), { paid: true, until: "2026-10-25T16:29:00.500Z" });
  // A present cycle is what counts, whatever the trial end says.
  const both = { data: { activeSubscription: { trialEndsAt: "2026-09-01T00:00:00Z", currentBillingCycle: { endTime: "2026-10-25T16:29:00Z" } } } };
  assert.deepEqual(await paidThrough(SHOP_GID, PARTNER, sequenceFetch({ status: 200, body: both }), NOW), { paid: true, until: "2026-10-25T16:29:00.000Z" });
});

test("managedPricingRedirect: none_active but the Partner API says paid through a future date -> null (write): subscriptions, shop id, Partner = 3 fetches", async () => {
  const fetchImpl = gateFetch([{ status: 200, body: NONE_BODY }], PAID);
  const [result, lines] = await withLogs(() => gate(fetchImpl));
  assert.equal(result, null);
  assert.deepEqual(fetchImpl.kinds(), ["admin", "shop", "partner"]);
  assert.deepEqual(fetchImpl.calls.map((c) => c.url), [ADMIN_URL, ADMIN_URL, PARTNER_URL]);
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).query, ADMIN_SUBSCRIPTIONS_QUERY);
  assert.deepEqual(JSON.parse(fetchImpl.calls[2].init.body).variables, { appId: PARTNER.appGid, shopId: SHOP_GID });
  assert.deepEqual(lines, [`[connect] shopify finish paid through 2026-10-25T16:29:00.000Z shop=${SHOP}`]);
  // A paid store does not need the plan handle: nothing is redirected.
  const noHandle = fakeFail();
  assert.equal(await gate(gateFetch([{ status: 200, body: NONE_BODY }], PAID), { appHandle: undefined, fail: noHandle }), null);
  assert.deepEqual(noHandle.codes, []);
});

test("managedPricingRedirect: none_active and the Partner API does not confirm a paid period -> plan page, nothing thrown, reason in the log", async () => {
  const cases = [
    ["no_subscription", { status: 200, body: { data: { activeSubscription: null } } }],
    ["period_ended", { status: 200, body: cycle("2026-09-01T00:00:00Z") }],
    ["bad_end_time", { status: 200, body: cycle("not a date") }],
    ["bad_end_time", { status: 200, body: cycle("2026-10-25T16:29:00") }],
    ["bad_end_time", { status: 200, body: trial("2026-10-10T00:00:00Z") }], // a free trial, still running, is not paid
    ["timeout", timeoutError()],
    ["network_error", new Error("ECONNRESET")],
    ["http_401", { status: 401, body: "unauthorized" }],
    ["graphql_error", { status: 200, body: { errors: [{ message: "access denied" }] } }],
    ["malformed", { status: 200, body: {} }],
  ];
  for (const [reason, step] of cases) {
    const fetchImpl = gateFetch([{ status: 200, body: NONE_BODY }], step);
    const fail = fakeFail();
    const [result, lines] = await withLogs(() => gate(fetchImpl, { fail }));
    assert.equal(result?.status, 307, reason);
    assert.equal(result.headers.get("location"), PLAN_URL_FALLBACK, reason);
    assert.equal(result.cookies.get(PENDING_COOKIE).value, "", reason);
    assert.deepEqual(fail.codes, [], reason);
    assert.deepEqual(fetchImpl.kinds(), ["admin", "shop", "partner"], `${reason}: the Partner call is not retried`);
    assert.deepEqual(lines, [`[connect] shopify finish sent to Shopify's plan page (none_active; partner: ${reason}) shop=${SHOP}`], reason);
  }
});

test("managedPricingRedirect: Partner config unset (whole or any one value) -> plan page with no shop-id or Partner fetch", async () => {
  const partial = {
    "no config": undefined,
    "no token": { ...PARTNER, token: undefined },
    "no org id": { ...PARTNER, orgId: undefined },
    "no app gid": { ...PARTNER, appGid: undefined },
  };
  for (const [name, partner] of Object.entries(partial)) {
    // A Partner call would find PAID and write: the count AND the outcome both catch one.
    const fetchImpl = gateFetch([{ status: 200, body: NONE_BODY }], PAID);
    const [result, lines] = await withLogs(() => gate(fetchImpl, { partner }));
    assert.equal(result?.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.deepEqual(fetchImpl.kinds(), ["admin"], name);
    assert.deepEqual(lines, [`[connect] shopify finish sent to Shopify's plan page (none_active; partner: unconfigured) shop=${SHOP}`], name);
  }
});

test("managedPricingRedirect: a failed or malformed shop-id call -> plan page as no_shop_id, and no Partner call", async () => {
  const shopSteps = {
    "http 500": { status: 500, body: "boom" },
    "graphql error": { status: 200, body: { errors: [{ message: "access denied" }] } },
    "not a Shop GID": { status: 200, body: { data: { shop: { id: "gid://shopify/App/1" } } } },
    "no shop": { status: 200, body: { data: {} } },
    timeout: timeoutError(),
  };
  for (const [name, shopStep] of Object.entries(shopSteps)) {
    const fetchImpl = gateFetch([{ status: 200, body: NONE_BODY }], PAID, shopStep);
    const [result, lines] = await withLogs(() => gate(fetchImpl));
    assert.equal(result?.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.deepEqual(fetchImpl.kinds(), ["admin", "shop"], name);
    assert.deepEqual(lines, [`[connect] shopify finish sent to Shopify's plan page (none_active; partner: no_shop_id) shop=${SHOP}`], name);
  }
});

test("managedPricingRedirect: the shop id and the Partner API are asked only after a definitive none_active -- never when ACTIVE, after a failed check, or for an ungated pending", async () => {
  // Every Partner step here would say PAID, so a stray call also changes the outcome.
  const active = gateFetch([{ status: 200, body: ACTIVE_BODY }], PAID);
  assert.equal(await gate(active), null);
  assert.deepEqual(active.kinds(), ["admin"]);
  assert.equal(JSON.parse(active.calls[0].init.body).query, ADMIN_SUBSCRIPTIONS_QUERY);

  for (const [name, transient] of Object.entries(TRANSIENT)) {
    const twice = gateFetch([transient(), transient(), { status: 200, body: NONE_BODY }], PAID);
    const [result, lines] = await withLogs(() => gate(twice));
    assert.equal(result?.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.deepEqual(twice.kinds(), ["admin", "admin"], name);
    // Not even considered: the log carries the Admin reason alone, as before.
    assert.deepEqual(lines, [`[connect] shopify finish sent to Shopify's plan page (${name}) shop=${SHOP}`], name);
  }
  for (const [name, body] of Object.entries({ graphql_error: { errors: [{ message: "throttled" }] }, malformed: { data: {} } })) {
    const definitive = gateFetch([{ status: 200, body }], PAID);
    const [result, lines] = await withLogs(() => gate(definitive));
    assert.equal(result?.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.deepEqual(definitive.kinds(), ["admin"], name);
    assert.deepEqual(lines, [`[connect] shopify finish sent to Shopify's plan page (${name}) shop=${SHOP}`], name);
  }
  // A transient blip then none_active is still a definitive none_active: asked once.
  const blip = gateFetch([TRANSIENT.timeout(), { status: 200, body: NONE_BODY }], PAID);
  assert.equal((await withLogs(() => gate(blip)))[0], null);
  assert.deepEqual(blip.kinds(), ["admin", "admin", "shop", "partner"]);

  const skippedApi = fakeApi({ data: true, error: null });
  for (const pending of [{ ...INSTALL_PENDING, app: ALT_APP }, { ...TOKEN, clientId: CLIENT }]) {
    const none = gateFetch([{ status: 200, body: NONE_BODY }], PAID);
    assert.equal(await gate(none, { api: skippedApi, pending }), null);
    assert.equal(none.calls.length, 0);
  }
  assert.deepEqual(skippedApi.calls, []);
});

test("managedPricingRedirect: neither token, nor Shopify's or fetch's message text, reaches a log line, the response, or the other host", async () => {
  const LEAK = "leaky-message-text";
  const tokens = `${LEAK} ${PARTNER.token} ${INSTALL_PENDING.accessToken}`;
  const cases = {
    paid: [PAID],
    "partner graphql error": [{ status: 200, body: { errors: [{ message: tokens }] } }],
    "partner http 401": [{ status: 401, body: tokens }],
    "partner fetch throws": [new Error(tokens)],
    "junk endTime": [{ status: 200, body: cycle(tokens) }],
    "shop id fetch throws": [PAID, new Error(tokens)],
    "shop id graphql error": [PAID, { status: 200, body: { errors: [{ message: tokens }] } }],
  };
  for (const [name, [partnerStep, shopStep]] of Object.entries(cases)) {
    const fetchImpl = gateFetch([{ status: 200, body: NONE_BODY }], partnerStep, shopStep);
    const [result, lines] = await withLogs(() => gate(fetchImpl));
    const seen = [...lines, result?.headers.get("location") ?? "", result?.headers.get("set-cookie") ?? ""].join("\n");
    assert.equal(lines.length, 1, name);
    for (const secret of [PARTNER.token, INSTALL_PENDING.accessToken, INSTALL_PENDING.refreshToken, LEAK]) {
      assert.ok(!seen.includes(secret), `${name}: ${secret} leaked`);
    }
    // The partner token goes to partners.shopify.com only; the merchant token to the shop only.
    for (const call of fetchImpl.calls) {
      const sent = JSON.stringify([call.url, call.init]);
      const host = new URL(call.url).host;
      assert.equal(sent.includes(PARTNER.token), host === "partners.shopify.com", `${name}: partner token vs ${host}`);
      assert.equal(sent.includes(INSTALL_PENDING.accessToken), host === SHOP, `${name}: merchant token vs ${host}`);
    }
  }
});

test("finish route wiring: the three Partner values are read from env and handed to the gate", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/oauth/shopify/finish/route.ts", import.meta.url), "utf8");
  assert.match(route, /partner: \{ token: config\.shopifyPartnerApiToken, orgId: config\.shopifyPartnerOrgId, appGid: config\.shopifyAppGid \}/);
  const { getConfig } = await import("../lib/env.ts");
  const names = { SHOPIFY_PARTNER_API_TOKEN: " tok ", SHOPIFY_PARTNER_ORG_ID: "5179321", SHOPIFY_APP_GID: "gid://shopify/App/1" };
  // Whatever this machine exports, restored after.
  const saved = Object.fromEntries(Object.keys(names).map((name) => [name, process.env[name]]));
  try {
    for (const name of Object.keys(names)) delete process.env[name];
    const unset = getConfig();
    assert.deepEqual([unset.shopifyPartnerApiToken, unset.shopifyPartnerOrgId, unset.shopifyAppGid], [undefined, undefined, undefined]);
    Object.assign(process.env, names);
    const config = getConfig();
    assert.deepEqual(
      [config.shopifyPartnerApiToken, config.shopifyPartnerOrgId, config.shopifyAppGid],
      ["tok", "5179321", "gid://shopify/App/1"]
    );
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

// data.attach_source raises BCNS6 when another client holds the shop with a live
// token and BCNS7 when this client is already bound to a different shop; /finish
// must send each to its own copy.
test("finishErrorCode maps BCNS6 to shop-in-use, BCNS7 to shop-mismatch, anything else to connect-failed", () => {
  assert.equal(finishErrorCode({ code: "BCNS6", message: "shop_in_use" }), "shop-in-use");
  assert.equal(finishErrorCode({ code: "BCNS7", message: "shop_mismatch" }), "shop-mismatch");
  assert.equal(finishErrorCode({ code: "BCNS3", message: "validation" }), "connect-failed");
  assert.equal(finishErrorCode({}), "connect-failed");
  assert.equal(finishErrorCode(null), "connect-failed");
});

/* ----------------- rule 1.2.2 gaps: real subscription check, and route wiring */

// The install-initiated finish must send EVERYTHING that is not a confirmed ACTIVE
// subscription to the plan page — including a lapsed plan on a tenant that already
// has a Shopify source (which the route no longer even looks up) and every way the
// check itself can fail. Driven through the real hasActiveSubscription.
const rawFetch = (status, body) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const subs = (...statuses) => ({ data: { currentAppInstallation: { activeSubscriptions: statuses.map((status) => ({ status })) } } });

test("managedPricingRedirect: every non-ACTIVE outcome of the real subscription check lands on the plan page", async () => {
  const cases = {
    "no subscriptions": rawFetch(200, subs()),
    "only a CANCELLED/FROZEN/PENDING charge": rawFetch(200, subs("CANCELLED", "FROZEN", "PENDING")),
    "http 500": rawFetch(500, "boom"),
    "graphql errors": rawFetch(200, { errors: [{ message: "throttled" }] }),
    "malformed body": rawFetch(200, { data: {} }),
    "not json": rawFetch(200, "<html>"),
    "network error": async () => { throw new Error("ECONNRESET"); },
  };
  for (const [name, fetchImpl] of Object.entries(cases)) {
    const fail = fakeFail();
    const result = await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail, fetchImpl });
    assert.equal(result?.status, 307, name);
    assert.equal(result.headers.get("location"), PLAN_URL_FALLBACK, name);
    assert.deepEqual(fail.codes, [], `${name}: a check failure is the plan page, not the generic error page`);
  }
  // One ACTIVE among others writes.
  assert.equal(
    await managedPricingRedirect({ api: NO_MISMATCH, pending: INSTALL_PENDING, appHandle: APP_HANDLE, fail: fakeFail(), fetchImpl: rawFetch(200, subs("CANCELLED", "ACTIVE")) }),
    null
  );
});

test("finish route wiring: subscription gate runs before the connect_source write, with no source-exists read; BCNS errors go through finishErrorCode", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const route = read("../app/api/oauth/shopify/finish/route.ts");
  const gate = route.indexOf("managedPricingRedirect({");
  const write = route.indexOf('rpc("connect_source"');
  assert.ok(gate > 0 && write > gate, "managedPricingRedirect must be called before the connect_source rpc");
  assert.match(route, /if \(gated\) return gated;/);
  assert.doesNotMatch(route, /connector_health_v1|alreadyConnected/, "no already-connected exemption may come back");
  assert.match(route, /finishErrorCode\(error\)/);
  // The hub shows the shop-mismatch copy, and the uninstall webhook is public and delegates.
  assert.match(read("../app/page.tsx"), /searchParams\.error === "shop-mismatch"[\s\S]{0,300}one account connects one store/);
  assert.match(read("../app/api/webhooks/shopify/app-uninstalled/route.ts"), /appUninstalledRoute\(request\)/);
  assert.ok(read("../middleware.ts").includes("api/webhooks/"), "middleware matcher must leave /api/webhooks/ (Shopify sends no cookie) unauthenticated");
});
