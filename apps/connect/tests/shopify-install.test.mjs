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
  FINISH_PATH,
  INSTALL_CLIENT_ID,
  INSTALL_TIMESTAMP_MAX_AGE_MS,
  STATE_TTL_MS,
  hasActiveSubscription,
  isFreshInstallTimestamp,
  PENDING_COOKIE,
  PENDING_TTL_MS,
  openPending,
  planSelectionUrl,
  sealPending,
  signState,
  verifyState,
} from "../lib/shopify-oauth.ts";

const HUB = "https://connect.bcn-services.com";
const SECRET = "shpss_install_secret";
const SHOP = "bcns-data-dev.myshopify.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const APP_HANDLE = "bcns-connect";
const PLAN_URL = `https://admin.shopify.com/store/${SHOP.split(".")[0]}/charges/${APP_HANDLE}/pricing_plans`;
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
const { NextRequest } = await import("next/server");

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
  signQuery(new URLSearchParams({ host: "YWRtaW4uc2hvcGlmeS5jb20", shop: SHOP, timestamp }), secret);

const TOKEN = { clientId: CLIENT, shop: SHOP, accessToken: "shpat_x", refreshToken: "shprt_y", expiresAt: "2026-09-21T01:00:00.000Z" };

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

/** The two fetches a Shopify-initiated callback makes: the token exchange, then the subscription check. */
function tokenThenSubscription(subscriptions) {
  return async (url) => {
    if (String(url).includes("/oauth/access_token")) {
      return new Response(
        JSON.stringify({ access_token: "shpat_x", scope: GRANTED_SCOPE, expires_in: 3600, refresh_token: "shprt_y" }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: subscriptions } } }),
      { status: 200 }
    );
  };
}

test("callback: an install-initiated handshake with an ACTIVE subscription exchanges, seals and hands off to /finish without a session", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = tokenThenSubscription([{ id: "gid://shopify/AppSubscription/1", name: "bcns Connect", status: "ACTIVE", test: true }]);
  try {
    const res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
    assert.equal(res.headers.get("location"), `${HUB}${FINISH_PATH}`);
    const opened = openPending(res.cookies.get(PENDING_COOKIE)?.value, SECRET, OTHER);
    assert.ok(opened.ok);
    assert.equal(opened.pending.accessToken, "shpat_x");
    assert.equal(opened.pending.refreshToken, "shprt_y");
    assert.equal(opened.pending.shop, SHOP);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("callback: an install-initiated handshake with NO active subscription is sent to Shopify's plan page, never bound to a tenant", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = tokenThenSubscription([{ id: "gid://shopify/AppSubscription/2", name: "old", status: "CANCELLED", test: true }]);
  const { logged, restore } = captureWarn();
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    restore();
    globalThis.fetch = realFetch;
  }
  assert.equal(res.headers.get("location"), PLAN_URL);
  assert.equal(res.cookies.get(PENDING_COOKIE), undefined, "never sealed: no pending hand-off to /finish");
  const cookie = res.cookies.get("shopify_oauth_state");
  assert.ok(cookie && cookie.value === "", "state cookie cleared");
  const lines = logged.join("\n");
  assert.match(lines, /\[connect\] shopify callback sent to Shopify's plan page \(none_active\): shop=bcns-data-dev\.myshopify\.com/);
  assert.doesNotMatch(lines, /shpat_x|shprt_y/, "no access or refresh token in the log");
});

test("callback: a failed or malformed subscription check fails closed to the plan page, never to /finish", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "shpat_x", scope: GRANTED_SCOPE, expires_in: 3600, refresh_token: "shprt_y" }), { status: 200 });
    }
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(res.headers.get("location"), PLAN_URL);
  assert.equal(res.cookies.get(PENDING_COOKIE), undefined);
});

test("callback: the bridge app (SB, SHOPIFY_ALT_*) never runs the subscription check and is never sent to the plan page", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: ALT_SHOP, clientId: INSTALL_CLIENT_ID }, ALT_SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: ALT_SHOP, state, timestamp: "1700000000" }), ALT_SECRET);
  let subscriptionQueried = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "shpat_bridge", scope: GRANTED_SCOPE, expires_in: 3600, refresh_token: "shprt_bridge" }), { status: 200 });
    }
    subscriptionQueried = true;
    return new Response(JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: [] } } }), { status: 200 });
  };
  let res;
  try {
    res = await GET(new NextRequest(`${HUB}/api/oauth/shopify/callback?${query}`, { headers: { cookie: `shopify_oauth_state=${state}` } }));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(subscriptionQueried, false, "the bridge path must never query for a subscription");
  assert.equal(res.headers.get("location"), `${HUB}${FINISH_PATH}`);
  // Sealed under the DEFAULT app's secret regardless of which app issued the token (callback/route.ts step 7).
  const opened = openPending(res.cookies.get(PENDING_COOKIE)?.value, SECRET, OTHER);
  assert.ok(opened.ok);
  assert.equal(opened.pending.accessToken, "shpat_bridge");
});

test("planSelectionUrl builds the managed-pricing redirect from the shop and appHandle", () => {
  assert.equal(planSelectionUrl(SHOP, APP_HANDLE), PLAN_URL);
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
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
});

test("finish: signed out keeps the hand-off and sends the merchant to sign in, then back", async () => {
  const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");
  const sealed = sealPending({ ...TOKEN, clientId: INSTALL_CLIENT_ID }, SECRET);
  const res = await GET(new NextRequest(`${HUB}${FINISH_PATH}`, { headers: { cookie: `${PENDING_COOKIE}=${sealed}` } }));
  assert.equal(res.headers.get("location"), `${HUB}/login?next=${encodeURIComponent(FINISH_PATH)}`);
  assert.equal(res.cookies.get(PENDING_COOKIE), undefined, "the hand-off must survive the trip to /login");
});
