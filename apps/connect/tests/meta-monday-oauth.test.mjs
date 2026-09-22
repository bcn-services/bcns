/**
 * Meta + Monday handshake properties, asserted without a server, database or
 * provider account. Each is a check that would still return 200 if it broke.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { STATE_TTL_MS, signState, verifyState } from "../lib/oauth-state.ts";
import {
  META_DEFAULTS, META_SCOPES, authorizeUrl as metaUrl, codeExchangeBody, confirmationCode,
  MAX_SIGNED_REQUEST_AGE_MS, connectArgs as metaArgs, handleMetaToken, listAdAccounts, longLivedBody,
  verifySignedRequest,
} from "../lib/meta-oauth.ts";
import {
  MONDAY_DEFAULTS, MONDAY_SCOPES, authorizeUrl as mondayUrl, connectArgs as mondayArgs, handleMondayToken, listBoards,
} from "../lib/monday-oauth.ts";
import { oauthEnabled, redirectUri } from "../lib/oauth-config.ts";

const SECRET = "meta_test_secret";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const HUB = "https://connect.bcn-services.com";

/* ----------------------------------------------------------------- state */

test("state round-trips and binds the tenant", () => {
  const r = verifyState(signState(CLIENT, SECRET), SECRET);
  assert.ok(r.ok);
  assert.equal(r.payload.clientId, CLIENT);
});

test("state rejects wrong secret, tampered body, expiry and garbage", () => {
  const s = signState(CLIENT, SECRET, 1_000);
  assert.deepEqual(verifyState(s, "other", 1_000), { ok: false, reason: "bad_signature" });
  const [body, sig] = s.split(".");
  const forged = Buffer.from(JSON.stringify({ clientId: "victim", exp: 9e15, nonce: "x" })).toString("base64url");
  assert.equal(verifyState(`${forged}.${sig}`, SECRET, 1_000).reason, "bad_signature");
  assert.equal(verifyState(s, SECRET, 1_000 + STATE_TTL_MS + 1).reason, "expired");
  for (const bad of [null, "", "nodot", "a.b.c", `${body}.`]) assert.equal(verifyState(bad, SECRET).ok, false);
});

test("state signature is domain-separated from signed_request", () => {
  // Same key signs both; a state signature must not be a valid signed_request.
  const s = signState(CLIENT, SECRET);
  const [body, hex] = s.split(".");
  const asSigned = `${Buffer.from(hex, "hex").toString("base64url")}.${body}`;
  assert.equal(verifySignedRequest(asSigned, SECRET).ok, false);
});

/* ------------------------------------------------------------ token flow */

test("Meta exchange bodies carry secrets in the body, and the long-lived grant", () => {
  const a = new URLSearchParams(codeExchangeBody("cid", "sec", `${HUB}/api/oauth/meta/callback`, "CODE"));
  assert.equal(a.get("code"), "CODE");
  assert.equal(a.get("redirect_uri"), `${HUB}/api/oauth/meta/callback`);
  const b = new URLSearchParams(longLivedBody("cid", "sec", "SHORT"));
  assert.equal(b.get("grant_type"), "fb_exchange_token");
  assert.equal(b.get("fb_exchange_token"), "SHORT");
});

test("handleMetaToken: token + expiry, null expiry, and refusals", () => {
  assert.deepEqual(handleMetaToken(200, { access_token: " T ", expires_in: 5184000 }), { ok: true, accessToken: "T", expiresIn: 5184000 });
  assert.equal(handleMetaToken(200, { access_token: "T" }).expiresIn, null);
  assert.equal(handleMetaToken(400, { error: {} }).reason, "http_error");
  assert.equal(handleMetaToken(200, { access_token: "" }).reason, "malformed");
  assert.equal(handleMetaToken(200, null).reason, "malformed");
});

test("the Meta callback trades short for long before writing, and never logs a token", () => {
  const route = readFileSync(new URL("../app/api/oauth/meta/callback/route.ts", import.meta.url), "utf8");
  // The long-lived exchange consumes the short token; only the long one leaves the handshake.
  assert.match(route, /longLivedBody\(clientId, secret, short\.accessToken\)/);
  assert.match(route, /accessToken:\s*long\.accessToken/);
  assert.doesNotMatch(route, /accessToken:\s*short/);
  assert.match(route, /expiresAt:[^\n]*long\.expiresIn/);
  for (const f of ["../app/api/oauth/meta/callback/route.ts", "../app/api/oauth/monday/callback/route.ts", "../lib/oauth-connect.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /console\.\w+\([^)]*(accessToken|short|long|token)\b/, f);
  }
});

test("connectArgs carry the token only as p_secret, and the chosen id only in p_config", () => {
  const m = metaArgs("TOK", "2026-11-20T00:00:00.000Z", "act_9");
  assert.equal(m.p_secret, "TOK");
  assert.equal(m.p_config.act_id, "act_9");
  assert.equal(m.p_expires_at, "2026-11-20T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(m.p_config), /TOK/);
  const b = mondayArgs("MTOK", "42");
  assert.equal(b.p_secret, "MTOK");
  assert.deepEqual(b.p_config, { board_id: "42" });
});

test("listAdAccounts keeps every ACTIVE act_ id, named; listBoards keeps every numeric board", () => {
  assert.deepEqual(
    listAdAccounts({ data: [
      { id: "bad", account_status: 1 },
      { id: "act_123", name: " Main ", account_status: 1 },
      { id: "act_456", name: "Closed", account_status: 101 },
      { id: "act_789", account_status: 1 },
    ] }),
    [{ id: "act_123", name: "Main" }, { id: "act_789", name: "act_789" }]
  );
  assert.equal(listAdAccounts({ data: [{ id: "act_1", name: "x".repeat(99), account_status: 1 }] })[0].name.length, 40);
  assert.deepEqual(listAdAccounts({ data: [] }), []);
  assert.deepEqual(listAdAccounts(null), []);
  assert.deepEqual(listBoards({ data: { boards: [{ id: "42", name: "Ops" }, { id: 7 }, { id: "x" }] } }), [
    { id: "42", name: "Ops" }, { id: "7", name: "7" },
  ]);
  assert.deepEqual(listBoards({ data: { boards: [] } }), []);
  assert.equal(handleMondayToken(200, { access_token: "M" }).accessToken, "M");
  assert.equal(handleMondayToken(401, {}).ok, false);
});

test("both callbacks turn a throwing network call into connect-failed, not a 500", () => {
  for (const src of ["meta", "monday"]) {
    const route = readFileSync(new URL(`../app/api/oauth/${src}/callback/route.ts`, import.meta.url), "utf8");
    assert.match(route, /await handshake\(.*\)\.catch\(\s*\(\): Handshake => \(\{ ok: false, code: "network" \}\)/);
    // The failure path clears the state cookie at the path it was set on.
    assert.match(route, /cookies\.delete\(\{ name: stateCookie\("\w+"\), path: "\/api\/oauth\/\w+" \}\)/);
  }
});

/* --------------------------------------------------------- signed_request */

const b64u = (b) => Buffer.from(b).toString("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);
function sign(payload, secret = SECRET) {
  const p = b64u(JSON.stringify({ issued_at: nowSec(), ...payload }));
  return `${b64u(createHmac("sha256", secret).update(p).digest())}.${p}`;
}

test("signed_request: good", () => {
  const r = verifySignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "1234567890" }), SECRET);
  assert.deepEqual(r, { ok: true, userId: "1234567890" });
});

test("signed_request: issued_at missing, unparseable, too old or too far ahead is stale", () => {
  const now = 1_800_000_000_000;
  const at = (issued_at) => verifySignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "1", issued_at }), SECRET, now);
  assert.equal(at(now / 1000).ok, true);
  assert.equal(at(now / 1000 - MAX_SIGNED_REQUEST_AGE_MS / 1000 + 1).ok, true);
  assert.equal(at(now / 1000 - MAX_SIGNED_REQUEST_AGE_MS / 1000 - 1).reason, "stale");
  assert.equal(at(1).reason, "stale");
  assert.equal(at(now / 1000 + 4 * 60).ok, true);
  assert.equal(at(now / 1000 + 6 * 60).reason, "stale");
  for (const junk of [undefined, null, "1800000000", NaN, {}]) assert.equal(at(junk).reason, "stale", String(junk));
});

test("signed_request: bad secret, tampered payload, tampered signature, wrong algorithm, junk", () => {
  const good = sign({ algorithm: "HMAC-SHA256", user_id: "111" });
  assert.equal(verifySignedRequest(good, "wrong").reason, "bad_signature");
  // Swap the payload for another user's while keeping the original signature.
  const [sig] = good.split(".");
  const other = b64u(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999", issued_at: nowSec() }));
  assert.equal(verifySignedRequest(`${sig}.${other}`, SECRET).reason, "bad_signature");
  assert.equal(verifySignedRequest(`${b64u("short")}.${good.split(".")[1]}`, SECRET).reason, "bad_signature");
  assert.equal(verifySignedRequest(sign({ algorithm: "HMAC-SHA1", user_id: "1" }), SECRET).reason, "bad_algorithm");
  assert.equal(verifySignedRequest(sign({ algorithm: "HMAC-SHA256" }), SECRET).reason, "no_user");
  for (const bad of [null, "", "nodot", "a.b.c"]) assert.equal(verifySignedRequest(bad, SECRET).ok, false);
});

test("data-deletion route: 401 on tampered, JSON {url, confirmation_code} on good", async () => {
  process.env.META_CLIENT_SECRET = SECRET;
  const { POST } = await import("../app/api/oauth/meta/data-deletion/route.ts");
  const post = (sr) => POST(new Request(`${HUB}/x`, { method: "POST", body: new URLSearchParams({ signed_request: sr }) }));
  const good = sign({ algorithm: "HMAC-SHA256", user_id: "555" });
  const bad = `${good.split(".")[0]}.${b64u(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "666" }))}`;
  assert.equal((await post(bad)).status, 401);
  // A correctly signed body replayed after the window.
  const replayed = sign({ algorithm: "HMAC-SHA256", user_id: "555", issued_at: nowSec() - 2 * 3600 });
  assert.equal((await post(replayed)).status, 401);
  const ok = await post(good);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.confirmation_code, confirmationCode("555", SECRET));
  assert.equal(body.url, `${HUB}/api/oauth/meta/data-deletion?code=${body.confirmation_code}`);
  delete process.env.META_CLIENT_SECRET;
  assert.equal((await post(good)).status, 401);
});

/* ------------------------------------------------- Monday forged callback */

test("Meta and Monday callbacks: a forged state is rejected before any network call or session read", async () => {
  Object.assign(process.env, {
    MONDAY_CLIENT_ID: "mid", MONDAY_CLIENT_SECRET: "msecret", META_CLIENT_ID: "fid", META_CLIENT_SECRET: SECRET,
    OAUTH_APPROVED_SOURCES: "meta,monday", HUB_BASE_URL: HUB,
  });
  // session.ts wraps loaders in React's server-only cache(); absent outside Next.
  const react = createRequire(import.meta.url)("react");
  react.cache ??= (fn) => fn;
  const { NextRequest } = await import("next/server");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("network must not be reached"); };
  try {
    for (const src of ["meta", "monday"]) {
      const { GET } = await import(`../app/api/oauth/${src}/callback/route.ts`);
      // Attacker-signed with the WRONG key, cookie set to match (attacker controls both).
      const forged = signState(CLIENT, "attacker-key");
      const req = new NextRequest(`${HUB}/api/oauth/${src}/callback?code=C&state=${forged}`, {
        headers: { cookie: `${src}_oauth_state=${forged}` },
      });
      const res = await GET(req);
      assert.equal(res.status, 307, src);
      assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`, src);
      assert.match(res.headers.get("set-cookie") ?? "", new RegExp(`${src}_oauth_state=;[^,]*Path=/api/oauth/${src}`, "i"), src);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.META_CLIENT_SECRET;
  }
});

/* ------------------------------------------------------ config + wiring */

test("registered URLs, scopes and dark-by-default gate", () => {
  const cfg = (o) => ({ hubBaseUrl: HUB, approvedOAuthSources: [], ...o });
  assert.equal(redirectUri(cfg(), "meta"), `${HUB}/api/oauth/meta/callback`);
  assert.equal(redirectUri(cfg(), "monday"), `${HUB}/api/oauth/monday/callback`);
  assert.deepEqual([...META_SCOPES], ["ads_read"]);
  assert.deepEqual([...MONDAY_SCOPES], ["boards:read", "me:read"]);
  assert.equal(new URL(metaUrl("cid", "r", "s")).searchParams.get("scope"), "ads_read");
  assert.equal(new URL(mondayUrl("cid", "r", "s")).searchParams.get("scope"), "boards:read me:read");
  const creds = { metaClientId: "a", metaClientSecret: "b", mondayClientId: "c", mondayClientSecret: "d" };
  assert.equal(oauthEnabled(cfg(creds), "meta"), false); // credentials alone do not open it
  assert.equal(oauthEnabled(cfg({ ...creds, approvedOAuthSources: ["meta", "monday"] }), "monday"), true);
  assert.equal(oauthEnabled(cfg({ approvedOAuthSources: ["meta"] }), "meta"), false); // approved but no secret
});

test("middleware exempts the deletion callback and no other Meta or Monday route", () => {
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(mw, /api\/oauth\/meta\/data-deletion\$/);
  // api/oauth/shopify/ is open on purpose (the Shopify-initiated install); see shopify-oauth.test.mjs.
  assert.doesNotMatch(mw, /matcher:[^\n]*api\/oauth\/(?!meta\/data-deletion|shopify\/)/);
});

test("META/MONDAY defaults still match the worker connectors", () => {
  const read = (n) => readFileSync(new URL(`../../../platform/worker/src/connectors/${n}.ts`, import.meta.url), "utf8");
  for (const [file, d] of [["meta", META_DEFAULTS], ["monday", MONDAY_DEFAULTS]]) {
    assert.match(read(file), new RegExp(`interval:\\s*'${d.interval}'`));
    assert.match(read(file), new RegExp(`backfillDepth:\\s*'${d.backfillDepth}'`));
  }
});
