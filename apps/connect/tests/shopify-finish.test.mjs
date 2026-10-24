/**
 * /finish with a signed-in owner: the code-exchange order that #162 introduced.
 * @bcn-services/tenant is replaced in require.cache (as in source-disconnect-role.test.mjs)
 * so lib/session.ts runs unmodified; the token endpoint is a fake global fetch.
 * A spent code must read as "Start again" and never reach connect_source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { FINISH_PATH, PENDING_COOKIE, SHOPIFY_SCOPES, sealPending } from "../lib/shopify-oauth.ts";

const HUB = "https://connect.bcn-services.com";
const SECRET = "shpss_finish_secret";
const SHOP = "bcns-data-dev.myshopify.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";

const calls = [];
const api = { rpc: async (fn) => (calls.push(fn), { data: fn.startsWith("shopify_") ? false : null, error: null }) };
const supabase = { schema: () => api };
const fake = {
  createServerSupabase: () => supabase,
  requireMembership: async () => ({ ok: true, membership: { userId: "u", email: null, clientId: CLIENT, role: "owner" } }),
};
const require = createRequire(new URL("../lib/session.ts", import.meta.url));
const tenantPath = require.resolve("@bcn-services/tenant");
require.cache[tenantPath] = { id: tenantPath, filename: tenantPath, loaded: true, exports: fake, children: [], paths: [] };
Object.assign(process.env, { SHOPIFY_CLIENT_ID: "cid", SHOPIFY_CLIENT_SECRET: SECRET, OAUTH_APPROVED_SOURCES: "shopify", HUB_BASE_URL: HUB });
require("react").cache ??= (fn) => fn;
const { NextRequest } = await import("next/server");
const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");

const pending = (over = {}) => sealPending({ clientId: CLIENT, shop: SHOP, code: "shpcode_x", storeHandle: null, ...over }, SECRET);
const finish = (cookie) => GET(new NextRequest(`${HUB}${FINISH_PATH}`, { headers: cookie ? { cookie } : {} }));

/** Answers the token POST with `status`; every other call (the uninstall webhook) is a harmless 200. */
async function withTokenEndpoint(status, run) {
  const realFetch = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/admin/oauth/access_token")) {
      exchanges++;
      return status === 200
        ? new Response(JSON.stringify({ access_token: "shpat_x", scope: SHOPIFY_SCOPES.join(","), expires_in: 3600, refresh_token: "shprt_y" }), { status })
        : new Response("{}", { status });
    }
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  };
  calls.length = 0;
  try {
    await run();
    return exchanges;
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("finish: no hand-off cookie -> connect-expired, shop carried, no RPC", async () => {
  calls.length = 0;
  const res = await finish(`shopify_last_shop=${SHOP}`);
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-expired&shop=${SHOP}`);
  assert.deepEqual(calls, []);
});

test("finish: a hand-off past its exp -> connect-expired, no exchange, no RPC", async () => {
  // sealPending(…, now) stamps exp = now + TTL; now=1_000 is long past.
  const stale = sealPending({ clientId: CLIENT, shop: SHOP, code: "c", storeHandle: null }, SECRET, 1_000);
  let res;
  const exchanges = await withTokenEndpoint(200, async () => {
    res = await finish(`${PENDING_COOKIE}=${stale}; shopify_last_shop=${SHOP}`);
  });
  assert.equal(exchanges, 0);
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-expired&shop=${SHOP}`);
  assert.deepEqual(calls, []);
});

test("finish: a spent code (token endpoint 400) -> connect-expired and connect_source is never called", async () => {
  let res;
  const exchanges = await withTokenEndpoint(400, async () => {
    res = await finish(`${PENDING_COOKIE}=${pending()}; shopify_last_shop=${SHOP}`);
  });
  assert.equal(exchanges, 1);
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-expired&shop=${SHOP}`);
  assert.equal(calls.includes("connect_source"), false);
});

test("finish: happy path exchanges once and reaches connect_source once, after the shop checks", async () => {
  let res;
  const exchanges = await withTokenEndpoint(200, async () => {
    res = await finish(`${PENDING_COOKIE}=${pending()}; shopify_last_shop=${SHOP}`);
  });
  assert.equal(exchanges, 1);
  assert.equal(res.headers.get("location"), `${HUB}/?connected=shopify`);
  assert.deepEqual(calls, ["shopify_shop_in_use", "shopify_shop_mismatch", "connect_source"]);
});
