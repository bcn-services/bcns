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
  isFreshInstallTimestamp,
  PENDING_COOKIE,
  PENDING_TTL_MS,
  openPending,
  sealPending,
  signState,
  verifyState,
} from "../lib/shopify-oauth.ts";

const HUB = "https://connect.bcn-services.com";
const SECRET = "shpss_install_secret";
const SHOP = "bcns-data-dev.myshopify.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

Object.assign(process.env, {
  SHOPIFY_CLIENT_ID: "cid",
  SHOPIFY_CLIENT_SECRET: SECRET,
  OAUTH_APPROVED_SOURCES: "shopify",
  HUB_BASE_URL: HUB,
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

test("middleware rewrites Shopify's app-URL hit to /start, query intact, and gates the rest", async () => {
  const { middleware } = await import("../middleware.ts");
  const query = installQuery().toString();
  const res = await middleware(new NextRequest(`${HUB}/?${query}`));
  assert.equal(res.headers.get("x-middleware-rewrite"), `${HUB}/api/oauth/shopify/start?${query}`);
  // No hmac: the ordinary tenant gate (a pass-through here, with no Supabase env).
  const plain = await middleware(new NextRequest(`${HUB}/?shop=${SHOP}`));
  assert.equal(plain.headers.get("x-middleware-rewrite"), null);
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

/* ----------------------------------------------------------------- /callback */

test("callback: an install-initiated handshake exchanges, seals and hands off to /finish without a session", async () => {
  const { GET } = await import("../app/api/oauth/shopify/callback/route.ts");
  const state = signState({ shop: SHOP, clientId: INSTALL_CLIENT_ID }, SECRET);
  const query = signQuery(new URLSearchParams({ code: "C", shop: SHOP, state, timestamp: "1700000000" }), SECRET);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: "shpat_x", scope: "read_orders,read_all_orders,read_products,read_inventory,read_shopify_payments_accounts,read_shopify_payments_payouts,read_reports,read_customers", expires_in: 3600, refresh_token: "shprt_y" }), { status: 200 });
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
