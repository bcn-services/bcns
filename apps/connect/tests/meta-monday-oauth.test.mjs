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
  handleMetaToken, longLivedBody, pickAdAccount, verifySignedRequest,
} from "../lib/meta-oauth.ts";
import {
  MONDAY_DEFAULTS, MONDAY_SCOPES, authorizeUrl as mondayUrl, handleMondayToken, pickBoard,
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
  // The long-lived exchange consumes the short token; the write uses the long one.
  assert.match(route, /longLivedBody\(clientId, secret, short\.accessToken\)/);
  assert.match(route, /p_secret:\s*long\.accessToken/);
  assert.doesNotMatch(route, /p_secret:\s*short/);
  assert.match(route, /p_expires_at:[^\n]*long\.expiresIn/);
  assert.doesNotMatch(route, /console\.\w+\([^)]*(accessToken|short|long)\b/);
});

test("pickAdAccount / pickBoard take the first valid id and refuse the rest", () => {
  assert.equal(pickAdAccount({ data: [{ id: "bad" }, { id: "act_123" }] }), "act_123");
  assert.equal(pickAdAccount({ data: [] }), null);
  assert.equal(pickBoard({ data: { boards: [{ id: "42" }] } }), "42");
  assert.equal(pickBoard({ data: { boards: [{ id: 7 }] } }), "7");
  assert.equal(pickBoard({ data: { boards: [] } }), null);
  assert.equal(handleMondayToken(200, { access_token: "M" }).accessToken, "M");
  assert.equal(handleMondayToken(401, {}).ok, false);
});

/* --------------------------------------------------------- signed_request */

const b64u = (b) => Buffer.from(b).toString("base64url");
function sign(payload, secret = SECRET) {
  const p = b64u(JSON.stringify(payload));
  return `${b64u(createHmac("sha256", secret).update(p).digest())}.${p}`;
}

test("signed_request: good", () => {
  const r = verifySignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1 }), SECRET);
  assert.deepEqual(r, { ok: true, userId: "1234567890" });
});

test("signed_request: bad secret, tampered payload, tampered signature, wrong algorithm, junk", () => {
  const good = sign({ algorithm: "HMAC-SHA256", user_id: "111" });
  assert.equal(verifySignedRequest(good, "wrong").reason, "bad_signature");
  // Swap the payload for another user's while keeping the original signature.
  const [sig] = good.split(".");
  const other = b64u(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" }));
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
  const ok = await post(good);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.confirmation_code, confirmationCode("555", SECRET));
  assert.equal(body.url, `${HUB}/api/oauth/meta/data-deletion?code=${body.confirmation_code}`);
  delete process.env.META_CLIENT_SECRET;
  assert.equal((await post(good)).status, 401);
});

/* ------------------------------------------------- Monday forged callback */

test("Monday callback: a forged state is rejected before any network call or session read", async () => {
  Object.assign(process.env, {
    MONDAY_CLIENT_ID: "mid", MONDAY_CLIENT_SECRET: "msecret", OAUTH_APPROVED_SOURCES: "monday", HUB_BASE_URL: HUB,
  });
  // session.ts wraps loaders in React's server-only cache(); absent outside Next.
  const react = createRequire(import.meta.url)("react");
  react.cache ??= (fn) => fn;
  const { GET } = await import("../app/api/oauth/monday/callback/route.ts");
  const { NextRequest } = await import("next/server");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("network must not be reached"); };
  try {
    // Attacker-signed with the WRONG key, cookie set to match (attacker controls both).
    const forged = signState(CLIENT, "attacker-key");
    const req = new NextRequest(`${HUB}/api/oauth/monday/callback?code=C&state=${forged}`, {
      headers: { cookie: `monday_oauth_state=${forged}` },
    });
    const res = await GET(req);
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
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

test("middleware exempts the deletion callback and nothing else under /api/oauth", () => {
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(mw, /api\/oauth\/meta\/data-deletion\$/);
  assert.doesNotMatch(mw, /matcher:[^\n]*api\/oauth\/(?!meta\/data-deletion)/);
});

test("META/MONDAY defaults still match the worker connectors", () => {
  const read = (n) => readFileSync(new URL(`../../../platform/worker/src/connectors/${n}.ts`, import.meta.url), "utf8");
  for (const [file, d] of [["meta", META_DEFAULTS], ["monday", MONDAY_DEFAULTS]]) {
    assert.match(read(file), new RegExp(`interval:\\s*'${d.interval}'`));
    assert.match(read(file), new RegExp(`backfillDepth:\\s*'${d.backfillDepth}'`));
  }
});
