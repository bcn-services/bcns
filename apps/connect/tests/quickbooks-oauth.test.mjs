/**
 * QuickBooks handshake properties, asserted without a server, database or
 * Intuit account — same shape as tests/meta-monday-oauth.test.mjs. Unlike
 * Meta/Monday there is no picker: realmId arrives on the callback query
 * string, so "valid flow" is verified at exchangeCode (the one network call,
 * DI-injectable) rather than through requireOwner, which every route test
 * here fails closed on (no Supabase env) before reaching realmId at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { STATE_TTL_MS, signState } from "../lib/oauth-state.ts";
import {
  authorizeUrl, basicAuth, connectArgs, exchangeCode, handleQuickbooksToken, isValidRealmId,
  QUICKBOOKS_DEFAULTS, QUICKBOOKS_SCOPES, QUICKBOOKS_STATE_COOKIE, scheduleConfig,
} from "../lib/quickbooks-oauth.ts";
import { oauthEnabled, redirectUri } from "../lib/oauth-config.ts";

const SECRET = "qb_test_secret";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const HUB = "https://connect.bcn-services.com";

/* --------------------------------------------------------------- pure fns */

test("authorizeUrl carries the one accounting scope and no picker params", () => {
  const url = new URL(authorizeUrl("cid", `${HUB}/api/oauth/quickbooks/callback`, "STATE"));
  assert.equal(url.origin + url.pathname, "https://appcenter.intuit.com/connect/oauth2");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), `${HUB}/api/oauth/quickbooks/callback`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "STATE");
  assert.deepEqual([...QUICKBOOKS_SCOPES], ["com.intuit.quickbooks.accounting"]);
  assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
});

test("basicAuth is base64(client_id:client_secret), the only place the secret is sent", () => {
  assert.equal(basicAuth("cid", "sec"), `Basic ${Buffer.from("cid:sec").toString("base64")}`);
});

test("handleQuickbooksToken: token + expiry, missing expires_in defaults to 3600, and refusals", () => {
  assert.deepEqual(
    handleQuickbooksToken(200, { access_token: " A ", refresh_token: " R ", expires_in: 3600 }),
    { ok: true, accessToken: "A", refreshToken: "R", expiresIn: 3600 }
  );
  assert.equal(handleQuickbooksToken(200, { access_token: "A", refresh_token: "R" }).expiresIn, 3600);
  assert.equal(handleQuickbooksToken(400, { error: "invalid_grant" }).reason, "http_error");
  assert.equal(handleQuickbooksToken(200, { access_token: "A" }).reason, "malformed"); // no refresh_token
  assert.equal(handleQuickbooksToken(200, { refresh_token: "R" }).reason, "malformed"); // no access_token
  assert.equal(handleQuickbooksToken(200, null).reason, "malformed");
});

test("handleQuickbooksToken: rejects an expires_in that would make toISOString() unsafe", () => {
  const base = { access_token: "A", refresh_token: "R" };
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: 0 }).reason, "malformed");
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: -1 }).reason, "malformed");
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: 1.5 }).reason, "malformed");
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: Infinity }).reason, "malformed");
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: Number.MAX_SAFE_INTEGER }).reason, "malformed");
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: 86400 * 7 + 1 }).reason, "malformed");
  assert.equal(handleQuickbooksToken(200, { ...base, expires_in: 86400 * 7 }).ok, true);
});

test("isValidRealmId: digits only, 1-32 chars, no sign or decimal", () => {
  assert.equal(isValidRealmId("9130001234567890"), true);
  assert.equal(isValidRealmId("1"), true);
  assert.equal(isValidRealmId("1".repeat(32)), true);
  assert.equal(isValidRealmId("1".repeat(33)), false);
  assert.equal(isValidRealmId(""), false);
  assert.equal(isValidRealmId("-1"), false);
  assert.equal(isValidRealmId("1.5"), false);
  assert.equal(isValidRealmId("abc"), false);
  assert.equal(isValidRealmId("123abc"), false);
});

test("connectArgs: token only as p_secret/p_refresh_secret, realm only in p_config, defaults match the worker", () => {
  const args = connectArgs("ACCESS", "REFRESH", "2026-11-20T00:00:00.000Z", "9130001234567890");
  assert.equal(args.p_source, "quickbooks");
  assert.equal(args.p_kind, "quickbooks_oauth_refresh");
  assert.equal(args.p_secret, "ACCESS");
  assert.equal(args.p_refresh_secret, "REFRESH");
  assert.equal(args.p_expires_at, "2026-11-20T00:00:00.000Z");
  assert.deepEqual(args.p_config, { realm_id: "9130001234567890" });
  assert.equal(args.p_interval, QUICKBOOKS_DEFAULTS.interval);
  assert.equal(args.p_backfill_depth, QUICKBOOKS_DEFAULTS.backfillDepth);
  assert.doesNotMatch(JSON.stringify(args.p_config), /ACCESS|REFRESH/);
});

test("scheduleConfig carries only realm_id", () => {
  assert.deepEqual(scheduleConfig("123"), { realm_id: "123" });
});

/* -------------------------------------------------- valid flow, mocked fetch */

test("exchangeCode: valid flow — posts Basic auth + form body, returns the rotated tokens", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ access_token: "NEWACCESS", refresh_token: "NEWREFRESH", expires_in: 3600 }), { status: 200 });
  };
  const out = await exchangeCode("cid", "sec", `${HUB}/api/oauth/quickbooks/callback`, "AUTHCODE", fetchImpl);
  assert.deepEqual(out, { ok: true, accessToken: "NEWACCESS", refreshToken: "NEWREFRESH", expiresIn: 3600 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, basicAuth("cid", "sec"));
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "AUTHCODE");
  assert.equal(body.get("redirect_uri"), `${HUB}/api/oauth/quickbooks/callback`);
});

test("exchangeCode: Intuit's HTTP error and malformed-body paths both refuse without throwing", async () => {
  const httpError = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  assert.deepEqual(await exchangeCode("cid", "sec", "r", "bad", httpError), { ok: false, reason: "http_error", detail: "HTTP 400" });
  const malformed = async () => new Response(JSON.stringify({ access_token: "A" }), { status: 200 }); // no refresh_token
  assert.equal((await exchangeCode("cid", "sec", "r", "code", malformed)).reason, "malformed");
});

/* ------------------------------------------------------------ forged state */

test("callback: a forged state is rejected before any network call or session read", async () => {
  Object.assign(process.env, {
    QUICKBOOKS_CLIENT_ID: "qid", QUICKBOOKS_CLIENT_SECRET: SECRET,
    OAUTH_APPROVED_SOURCES: "quickbooks", HUB_BASE_URL: HUB,
  });
  // session.ts wraps loaders in React's server-only cache(); absent outside Next.
  const react = createRequire(import.meta.url)("react");
  react.cache ??= (fn) => fn;
  const { NextRequest } = await import("next/server");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("network must not be reached"); };
  try {
    const { GET } = await import("../app/api/oauth/quickbooks/callback/route.ts");
    // Attacker-signed with the WRONG key, cookie set to match (attacker controls both).
    const forged = signState(CLIENT, "attacker-key");
    const req = new NextRequest(`${HUB}/api/oauth/quickbooks/callback?code=C&realmId=999&state=${forged}`, {
      headers: { cookie: `${QUICKBOOKS_STATE_COOKIE}=${forged}` },
    });
    const res = await GET(req);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
    assert.match(res.headers.get("set-cookie") ?? "", new RegExp(`${QUICKBOOKS_STATE_COOKIE}=;[^,]*Path=/api/oauth/quickbooks`, "i"));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.QUICKBOOKS_CLIENT_ID;
    delete process.env.QUICKBOOKS_CLIENT_SECRET;
  }
});

/* --------------------------------------------------------- missing realmId */

test("callback: requires realmId as well as code, and checks it before exchangeCode", () => {
  // requireOwner needs a real Supabase session to reach past it in-process, so the
  // no-realmId guard (which runs right after) is verified the way this suite already
  // verifies other post-session logic (see meta-monday-oauth.test.mjs's "trades short
  // for long" check): read the route and assert the guard is there, in order.
  const route = readFileSync(new URL("../app/api/oauth/quickbooks/callback/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!code\) return fail\("no_code"\)/);
  assert.match(route, /if \(!realmId\) return fail\("no_realm_id"\)/);
  assert.match(route, /if \(!isValidRealmId\(realmId\)\) return fail\("bad_realm_id"\)/);
  const codeIdx = route.indexOf('if (!code)');
  const realmIdx = route.indexOf('if (!realmId)');
  const validIdx = route.indexOf('if (!isValidRealmId');
  const exchangeIdx = route.indexOf('exchangeCode(');
  assert.ok(
    codeIdx > 0 && realmIdx > codeIdx && validIdx > realmIdx && exchangeIdx > validIdx,
    "all three are checked, in order, before the network call"
  );
});

/* ------------------------------------------------------ malformed realmId */

test("callback: a non-numeric realmId would be rejected before exchangeCode's fetch ever runs", () => {
  // Same constraint as the no-realmId test above: requireOwner needs a live Supabase
  // session to reach past it in-process, so this is proven the same way — by the
  // guard's presence and its position strictly before exchangeCode (the only fetch
  // in this flow) — plus isValidRealmId's own unit test above for the regex itself.
  assert.equal(isValidRealmId("abc123"), false, "a non-numeric realmId fails the guard");
  const route = readFileSync(new URL("../app/api/oauth/quickbooks/callback/route.ts", import.meta.url), "utf8");
  const validIdx = route.indexOf('if (!isValidRealmId');
  const exchangeIdx = route.indexOf('exchangeCode(');
  assert.ok(validIdx > 0 && exchangeIdx > validIdx, "the realmId guard runs before the one network call");
});

/* ------------------------------------------------------ config + wiring */

test("registered URL, dark-by-default gate, and no picker route exists", () => {
  const cfg = (o) => ({ hubBaseUrl: HUB, approvedOAuthSources: [], ...o });
  assert.equal(redirectUri(cfg(), "quickbooks"), `${HUB}/api/oauth/quickbooks/callback`);
  const creds = { quickbooksClientId: "a", quickbooksClientSecret: "b" };
  assert.equal(oauthEnabled(cfg(creds), "quickbooks"), false); // credentials alone do not open it
  assert.equal(oauthEnabled(cfg({ ...creds, approvedOAuthSources: ["quickbooks"] }), "quickbooks"), true);
  assert.equal(oauthEnabled(cfg({ approvedOAuthSources: ["quickbooks"] }), "quickbooks"), false); // approved but no secret
  assert.throws(() => readFileSync(new URL("../app/api/oauth/quickbooks/pick/route.ts", import.meta.url)));
});

test("the state cookie lives exactly as long as the state, same TTL as Meta/Monday", () => {
  const src = readFileSync(new URL("../app/api/oauth/quickbooks/start/route.ts", import.meta.url), "utf8");
  assert.match(src, /maxAge:\s*STATE_TTL_MS \/ 1000/);
  assert.equal(STATE_TTL_MS / 1000, 300);
});

test("QUICKBOOKS_DEFAULTS still match the worker connector", () => {
  const worker = readFileSync(new URL("../../../platform/worker/src/connectors/quickbooks.ts", import.meta.url), "utf8");
  assert.match(worker, new RegExp(`interval:\\s*'${QUICKBOOKS_DEFAULTS.interval}'`));
  assert.match(worker, new RegExp(`backfillDepth:\\s*'${QUICKBOOKS_DEFAULTS.backfillDepth}'`));
});

test("no token ever reaches a console.* call in the quickbooks flow", () => {
  for (const f of ["../app/api/oauth/quickbooks/callback/route.ts", "../app/api/oauth/quickbooks/start/route.ts", "../lib/quickbooks-oauth.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /console\.\w+\([^)]*(accessToken|refreshToken|token)\b/i, f);
  }
});
