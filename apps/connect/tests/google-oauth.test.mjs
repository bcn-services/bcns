/**
 * Google (meet + drive) handshake properties, asserted without Next's server, a database or a Google
 * account. The pure functions are called directly; the route logic (lib/google-connect.ts) takes an
 * injected owner session and fetch, so every branch of start / callback / pick runs in-process.
 * No test makes a real network call: a stray fetch throws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const HUB = "https://connect.bcn-services.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const OTHER_TENANT = "99999999-8888-7777-6666-555555555555";
const SECRET = "google_test_secret";
const ENV = {
  GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: SECRET,
  GOOGLE_PICKER_API_KEY: "picker-key", GOOGLE_CLOUD_PROJECT_NUMBER: "123456789012",
  OAUTH_APPROVED_SOURCES: "meet,drive", HUB_BASE_URL: HUB,
};
Object.assign(process.env, ENV);
// session.ts wraps loaders in React's server-only cache(); absent outside Next.
const react = createRequire(import.meta.url)("react");
react.cache ??= (fn) => fn;
const { NextRequest } = await import("next/server");
const g = await import("../lib/google-oauth.ts");
const conn = await import("../lib/google-connect.ts");
const { signState, verifyState, STATE_TTL_MS, PICK_TTL_MS } = await import("../lib/oauth-state.ts");
const { oauthEnabled, connectPath, redirectUri } = await import("../lib/oauth-config.ts");

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const GOOD_TOKEN = { access_token: "ACCESS_TOKEN_VALUE", refresh_token: "REFRESH_TOKEN_VALUE", expires_in: 3599, scope: SCOPE };

/* ---------------------------------------------------------------- helpers */

const noNetwork = async () => { throw new Error("network must not be reached"); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

function fakeSession(clientId = CLIENT, error = null) {
  const calls = [];
  return {
    calls,
    session: { membership: { clientId, role: "owner" }, api: { rpc: async (fn, args) => { calls.push([fn, args]); return { error }; } } },
  };
}
const deps = (session, fetchImpl = noNetwork) => ({ session: async () => session, fetchImpl });
const req = (url, { cookies = {}, headers = {}, method = "GET", body } = {}) => {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(url, { method, body, headers: { ...(cookie ? { cookie } : {}), ...headers } });
};
const form = (id) => new URLSearchParams(id === undefined ? {} : { id }).toString();
const formReq = (source, id, cookies, headers = {}) =>
  req(`${HUB}/api/oauth/${source}/pick`, {
    method: "POST", cookies, body: form(id),
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", origin: HUB, ...headers },
  });
const sealedFor = (source, over = {}) =>
  g.sealGoogle({ clientId: CLIENT, accessToken: "SEALED_ACCESS", refreshToken: "SEALED_REFRESH", expiresAt: "2026-11-20T00:00:00.000Z", ...over }, SECRET, source);
const stateFor = (source, clientId = CLIENT) => signState(clientId, g.stateSecret(SECRET, source));
const loc = (res) => res.headers.get("location");
const cleared = (res, name) => { const c = res.cookies.get(name); return c !== undefined && c.value === ""; };

/* --------------------------------------------------------------- pure fns */

test("the scope is one constant, pinned to a literal, and nothing else in the app hard-codes it", () => {
  assert.deepEqual([...g.GOOGLE_SCOPES], [SCOPE]);
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (/\.(ts|tsx)$/.test(e.name) && /googleapis\.com\/auth\//.test(readFileSync(new URL(`${dir}${e.name}`, import.meta.url), "utf8"))) hits.push(`${dir}${e.name}`);
    }
  };
  walk("../lib/"); walk("../app/");
  assert.deepEqual(hits, ["../lib/google-oauth.ts"]);
});

test("authorizeUrl: Google endpoint, code flow, offline + consent, the scope constant, state, redirect", () => {
  const url = new URL(g.authorizeUrl("cid", `${HUB}/api/oauth/meet/callback`, "STATE"));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), `${HUB}/api/oauth/meet/callback`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "STATE");
  assert.equal(url.searchParams.get("scope"), g.GOOGLE_SCOPES.join(" "));
});

test("handleGoogleToken: both tokens + bounded expiry accepted", () => {
  assert.deepEqual(g.handleGoogleToken(200, { ...GOOD_TOKEN, access_token: " A ", refresh_token: " R " }), { ok: true, accessToken: "A", refreshToken: "R", expiresIn: 3599 });
  assert.equal(g.handleGoogleToken(200, { access_token: "A", refresh_token: "R" }).expiresIn, 3600); // no expires_in, no scope: defaulted
});

test("handleGoogleToken: no refresh token is refused (an unattended worker could not renew)", () => {
  const r = g.handleGoogleToken(200, { access_token: "A", expires_in: 3600, scope: SCOPE });
  assert.deepEqual(r, { ok: false, reason: "no_refresh_token" });
  assert.equal(g.handleGoogleToken(200, { access_token: "A", refresh_token: "  " }).reason, "no_refresh_token");
});

test("handleGoogleToken: other refusals - http error, no access token, null, unticked scope, bad expires_in", () => {
  assert.equal(g.handleGoogleToken(400, { error: "invalid_grant" }).reason, "http_error");
  assert.equal(g.handleGoogleToken(200, { refresh_token: "R" }).reason, "malformed");
  assert.equal(g.handleGoogleToken(200, null).reason, "malformed");
  assert.equal(g.handleGoogleToken(200, { ...GOOD_TOKEN, scope: "openid email" }).reason, "scope_missing");
  for (const bad of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER, 86400 * 7 + 1, "3600", null]) {
    assert.equal(g.handleGoogleToken(200, { ...GOOD_TOKEN, expires_in: bad }).reason, "malformed", String(bad));
  }
  assert.equal(g.handleGoogleToken(200, { ...GOOD_TOKEN, expires_in: 86400 * 7 }).ok, true);
});

test("handleGoogleToken never echoes the response body, on any refusal", () => {
  const body = { error: "TOP_SECRET_BODY", error_description: "TOP_SECRET_BODY", access_token: "TOP_SECRET_BODY" };
  for (const status of [200, 400, 500]) assert.doesNotMatch(JSON.stringify(g.handleGoogleToken(status, body)), /TOP_SECRET_BODY/);
});

test("exchangeCode: posts client creds in the form body to Google's token endpoint, returns the tokens", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return json(GOOD_TOKEN); };
  const out = await g.exchangeCode("cid", "csecret", `${HUB}/api/oauth/drive/callback`, "AUTHCODE", fetchImpl);
  assert.deepEqual(out, { ok: true, accessToken: "ACCESS_TOKEN_VALUE", refreshToken: "REFRESH_TOKEN_VALUE", expiresIn: 3599 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0].init.method, "POST");
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "AUTHCODE");
  assert.equal(body.get("client_id"), "cid");
  assert.equal(body.get("client_secret"), "csecret");
  assert.equal(body.get("redirect_uri"), `${HUB}/api/oauth/drive/callback`);
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test("exchangeCode: a Google error and a refresh-token-less grant both refuse without throwing or echoing", async () => {
  assert.deepEqual(await g.exchangeCode("c", "s", "r", "bad", async () => json({ error: "invalid_grant" }, 400)), { ok: false, reason: "http_error", detail: "HTTP 400" });
  assert.equal((await g.exchangeCode("c", "s", "r", "code", async () => json({ access_token: "A", expires_in: 3600 }))).reason, "no_refresh_token");
  assert.equal((await g.exchangeCode("c", "s", "r", "code", async () => new Response("<html>", { status: 200 }))).reason, "malformed");
});

test("connectArgs: kind, tokens only in p_secret/p_refresh_secret, folder + client id in config, NO client secret anywhere", () => {
  for (const source of ["meet", "drive"]) {
    const args = g.connectArgs(source, "ACCESS", "REFRESH", "2026-11-20T00:00:00.000Z", FOLDER, "gid");
    assert.equal(args.p_source, source);
    assert.equal(args.p_kind, "google_oauth_refresh");
    assert.equal(args.p_secret, "ACCESS");
    assert.equal(args.p_refresh_secret, "REFRESH");
    assert.equal(args.p_expires_at, "2026-11-20T00:00:00.000Z");
    assert.deepEqual(args.p_config, { folder_id: FOLDER, oauth_client_id: "gid" });
    assert.deepEqual(Object.keys(args).sort(), ["p_backfill_depth", "p_config", "p_expires_at", "p_interval", "p_kind", "p_refresh_secret", "p_secret", "p_source"]);
    assert.doesNotMatch(JSON.stringify(args), /oauth_client_secret|client_secret/);
    assert.doesNotMatch(JSON.stringify(args.p_config), /ACCESS|REFRESH/);
  }
});

test("interval / backfill are pinned to literals and to the worker connectors (drift test)", () => {
  assert.deepEqual(g.GOOGLE_DEFAULTS.meet, { interval: "1 hour", backfillDepth: "unbounded" });
  assert.deepEqual(g.GOOGLE_DEFAULTS.drive, { interval: "1 hour", backfillDepth: "0" });
  for (const source of ["meet", "drive"]) {
    const worker = readFileSync(new URL(`../../../platform/worker/src/connectors/${source}.ts`, import.meta.url), "utf8");
    const { interval, backfillDepth } = g.GOOGLE_DEFAULTS[source];
    assert.match(worker, new RegExp(`interval:\\s*'${interval}'`), source);
    assert.match(worker, new RegExp(`backfillDepth:\\s*'${backfillDepth}'`), source);
    assert.match(worker, /tokenKind:\s*'google_oauth_refresh'/, source);
    const args = g.connectArgs(source, "A", "R", "2026-11-20T00:00:00.000Z", FOLDER, "gid");
    assert.equal(args.p_interval, interval);
    assert.equal(args.p_backfill_depth, backfillDepth === "unbounded" ? "100 years" : backfillDepth);
  }
});

test("connectArgs maps the worker's 'unbounded' to an interval literal api.connect_source can cast; drive stays '0'", () => {
  // api.connect_source runs `current_date - p_backfill_depth::interval`; "unbounded" is not an interval.
  const args = (source) => g.connectArgs(source, "A", "R", "2026-11-20T00:00:00.000Z", FOLDER, "gid");
  assert.equal(args("meet").p_backfill_depth, "100 years");
  assert.equal(args("drive").p_backfill_depth, "0");
});

test("every p_backfill_depth connectArgs can produce is interval-shaped, so 'unbounded' never reaches the RPC", () => {
  for (const source of g.GOOGLE_SOURCES) {
    const depth = g.connectArgs(source, "A", "R", "2026-11-20T00:00:00.000Z", FOLDER, "gid").p_backfill_depth;
    assert.match(depth, /^\d+ (years?|months?|days?)$|^0$/, source);
  }
});

test("sealed hand-off round-trips, and refuses tamper, expiry, the other source, a wrong secret and garbage", () => {
  const sealed = g.sealGoogle({ clientId: CLIENT, accessToken: "A", refreshToken: "R", expiresAt: "2026-11-20T00:00:00.000Z" }, SECRET, "meet", 1_000);
  const open = g.openGoogle(sealed, SECRET, "meet", 1_000);
  assert.equal(open.ok, true);
  assert.equal(open.pending.exp, 1_000 + PICK_TTL_MS);
  assert.equal(g.openGoogle(sealed, SECRET, "meet", 1_000 + PICK_TTL_MS + 1).reason, "expired");
  assert.equal(g.openGoogle(sealed, SECRET, "drive", 1_000).reason, "malformed"); // meet's cookie never opens as drive's
  assert.equal(g.openGoogle(sealed, "other", "meet", 1_000).reason, "malformed");
  for (const bad of [null, "", "abc", "x".repeat(80)]) assert.equal(g.openGoogle(bad, SECRET, "meet").ok, false);
  assert.doesNotMatch(Buffer.from(sealed, "base64url").toString("latin1"), /ACCESS|"R"/);
});

test("verifyFolder: a folder passes; a file, a 403, a mismatched id and a malformed body do not", async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return json({ id: FOLDER, mimeType: "application/vnd.google-apps.folder" }); };
  assert.deepEqual(await g.verifyFolder("TOK", FOLDER, ok), { ok: true });
  assert.equal(calls[0].url, `https://www.googleapis.com/drive/v3/files/${FOLDER}?fields=id,mimeType`);
  assert.equal(calls[0].init.headers.Authorization, "Bearer TOK");
  assert.equal((await g.verifyFolder("T", FOLDER, async () => json({ id: FOLDER, mimeType: "application/pdf" }))).reason, "not_a_folder");
  assert.equal((await g.verifyFolder("T", FOLDER, async () => json({ error: { message: "File not found" } }, 404))).reason, "http_error");
  assert.equal((await g.verifyFolder("T", FOLDER, async () => json({}, 403))).reason, "http_error");
  assert.equal((await g.verifyFolder("T", FOLDER, async () => json({ id: "someOtherId0000", mimeType: "application/vnd.google-apps.folder" }))).reason, "not_a_folder");
  assert.equal((await g.verifyFolder("T", FOLDER, async () => new Response("nope", { status: 200 }))).reason, "not_a_folder");
});

/* ------------------------------------------------------------ gate + cards */

test("oauthEnabled needs ALL four GOOGLE_* vars AND approval, per source; otherwise the card keeps 'Request connection'", () => {
  const all = { googleClientId: "a", googleClientSecret: "b", googlePickerApiKey: "c", googleCloudProjectNumber: "d" };
  const cfg = (o) => ({ hubBaseUrl: HUB, approvedOAuthSources: [], ...o });
  for (const source of ["meet", "drive"]) {
    assert.equal(oauthEnabled(cfg({ ...all, approvedOAuthSources: [source] }), source), true);
    assert.equal(connectPath(cfg({ ...all, approvedOAuthSources: [source] }), source), `/api/oauth/${source}/start`);
    assert.equal(oauthEnabled(cfg(all), source), false, "credentials alone do not open it");
    assert.equal(connectPath(cfg(all), source), null);
    assert.equal(oauthEnabled(cfg({ approvedOAuthSources: [source] }), source), false, "approved but no credentials");
    for (const missing of Object.keys(all)) {
      const partial = { ...all, [missing]: undefined, approvedOAuthSources: [source] };
      assert.equal(oauthEnabled(cfg(partial), source), false, `${source} without ${missing}`);
      assert.equal(connectPath(cfg(partial), source), null, `${source} without ${missing}`);
    }
  }
  assert.equal(oauthEnabled(cfg({ ...all, approvedOAuthSources: ["meet"] }), "drive"), false, "meet approval does not open drive");
  assert.equal(redirectUri(cfg(), "meet"), `${HUB}/api/oauth/meet/callback`);
  assert.equal(redirectUri(cfg(), "drive"), `${HUB}/api/oauth/drive/callback`);
});

test("getConfig reads the four GOOGLE_* env vars; unset they are undefined", async () => {
  const { getConfig } = await import("../lib/env.ts");
  const c = getConfig();
  assert.deepEqual([c.googleClientId, c.googleClientSecret, c.googlePickerApiKey, c.googleCloudProjectNumber], ["gid.apps.googleusercontent.com", SECRET, "picker-key", "123456789012"]);
  const saved = { ...ENV };
  for (const k of Object.keys(ENV).filter((k) => k.startsWith("GOOGLE_"))) delete process.env[k];
  try {
    const u = getConfig();
    assert.deepEqual([u.googleClientId, u.googleClientSecret, u.googlePickerApiKey, u.googleCloudProjectNumber], [undefined, undefined, undefined, undefined]);
  } finally { Object.assign(process.env, saved); }
});

test("with GOOGLE_* unset, /start /callback /pick all refuse as unavailable", async () => {
  const saved = { ...ENV };
  for (const k of Object.keys(ENV).filter((k) => k.startsWith("GOOGLE_"))) delete process.env[k];
  try {
    const { session } = fakeSession();
    const start = await conn.startPOST(req(`${HUB}/api/oauth/meet/start`, { method: "POST" }), "meet", deps(session));
    assert.equal(loc(start), `${HUB}/?error=oauth-unavailable`);
    const cb = await conn.callbackGET(req(`${HUB}/api/oauth/meet/callback?code=C&state=S`), "meet", deps(session));
    assert.equal(loc(cb), `${HUB}/?error=connect-failed`);
    const pick = await conn.pickGET(req(`${HUB}/api/oauth/meet/pick`), "meet", deps(session));
    assert.equal(loc(pick), `${HUB}/?error=connect-failed`);
  } finally { Object.assign(process.env, saved); }
});

test("the hub card renders Connect for meet/drive through the generic connectPath, so page.tsx needs no edit", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<form action=\{connectPath\(config, card\.source\)!\} method="POST"/);
});

/* ---------------------------------------------------------------- /start */

for (const source of ["meet", "drive"]) {
  test(`${source} /start: POST-only, refuses cross-site before the session, then needs an owner`, async () => {
    const mod = await import(`../app/api/oauth/${source}/start/route.ts`);
    assert.equal(mod.GET, undefined, "no GET: a link cannot start a reconnect");
    const { session } = fakeSession();
    let sessionReads = 0;
    const counting = { session: async () => { sessionReads++; return session; }, fetchImpl: noNetwork };
    const url = `${HUB}/api/oauth/${source}/start`;
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }]) {
      const res = await conn.startPOST(req(url, { method: "POST", headers }), source, counting);
      assert.equal(res.status, 303);
      assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    }
    assert.equal(sessionReads, 0);
    const anon = await conn.startPOST(req(url, { method: "POST", headers: { "sec-fetch-site": "same-origin", origin: HUB } }), source, deps(null));
    assert.equal(loc(anon), `${HUB}/?error=forbidden`);
    // The unmocked route has no Supabase session in this process: same-origin reaches the owner check.
    const real = await mod.POST(req(url, { method: "POST", headers: { "sec-fetch-site": "same-origin", origin: HUB } }));
    assert.equal(loc(real), `${HUB}/?error=forbidden`);
  });

  test(`${source} /start happy path: 303 to Google with a state bound to the tenant, cookie scoped to the source`, async () => {
    const { session } = fakeSession();
    const res = await conn.startPOST(req(`${HUB}/api/oauth/${source}/start`, { method: "POST", headers: { "sec-fetch-site": "same-origin" } }), source, deps(session));
    assert.equal(res.status, 303);
    const to = new URL(loc(res));
    assert.equal(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(to.searchParams.get("client_id"), ENV.GOOGLE_CLIENT_ID);
    assert.equal(to.searchParams.get("redirect_uri"), `${HUB}/api/oauth/${source}/callback`);
    assert.equal(to.searchParams.get("access_type"), "offline");
    const state = to.searchParams.get("state");
    const cookie = res.cookies.get(`${source}_oauth_state`);
    assert.equal(cookie.value, state);
    assert.equal(cookie.path, `/api/oauth/${source}`);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.maxAge, STATE_TTL_MS / 1000);
    const verified = verifyState(state, g.stateSecret(SECRET, source));
    assert.equal(verified.ok && verified.payload.clientId, CLIENT);
    assert.equal(verifyState(state, g.stateSecret(SECRET, source === "meet" ? "drive" : "meet")).ok, false, "a state is bound to its source");
  });
}

/* ------------------------------------------------------------- /callback */

const cbUrl = (source, state, extra = "code=AUTHCODE") => `${HUB}/api/oauth/${source}/callback?${extra}&state=${state}`;

for (const source of ["meet", "drive"]) {
  test(`${source} /callback: a forged state is rejected before the session or any network call`, async () => {
    const forged = signState(CLIENT, "attacker-key");
    let sessionReads = 0;
    const d = { session: async () => { sessionReads++; return fakeSession().session; }, fetchImpl: noNetwork };
    const res = await conn.callbackGET(req(cbUrl(source, forged), { cookies: { [`${source}_oauth_state`]: forged } }), source, d);
    assert.equal(res.status, 303);
    assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    assert.ok(cleared(res, `${source}_oauth_state`), "state cookie cleared");
    assert.equal(sessionReads, 0);
    assert.equal(res.cookies.get(`${source}_pick`)?.value ?? "", "");
  });

  test(`${source} /callback: a state signed for the OTHER source, an expired state, and garbage are rejected`, async () => {
    const other = stateFor(source === "meet" ? "drive" : "meet");
    const expired = signState(CLIENT, g.stateSecret(SECRET, source), Date.now() - STATE_TTL_MS - 1000);
    for (const state of [other, expired, "garbage", ""]) {
      const res = await conn.callbackGET(req(cbUrl(source, state), { cookies: { [`${source}_oauth_state`]: state } }), source, deps(fakeSession().session));
      assert.equal(loc(res), `${HUB}/?error=connect-failed`, state);
    }
  });

  test(`${source} /callback: a valid state without the matching cookie (login-CSRF) is rejected`, async () => {
    const state = stateFor(source);
    const none = await conn.callbackGET(req(cbUrl(source, state)), source, deps(fakeSession().session));
    assert.equal(loc(none), `${HUB}/?error=connect-failed`);
    const attackers = await conn.callbackGET(req(cbUrl(source, state), { cookies: { [`${source}_oauth_state`]: stateFor(source) + "x" } }), source, deps(fakeSession().session));
    assert.equal(loc(attackers), `${HUB}/?error=connect-failed`);
  });

  test(`${source} /callback: signed-in tenant differing from the state's tenant is rejected before the exchange`, async () => {
    const state = stateFor(source);
    const fetches = [];
    // Google would happily answer: only the tenant check stands between this session and a sealed token.
    const fetchImpl = async (url) => { fetches.push(url); return json(GOOD_TOKEN); };
    const res = await conn.callbackGET(req(cbUrl(source, state), { cookies: { [`${source}_oauth_state`]: state } }), source, deps(fakeSession(OTHER_TENANT).session, fetchImpl));
    assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    assert.ok(cleared(res, `${source}_oauth_state`));
    assert.equal(fetches.length, 0, "the code was not spent");
    assert.equal(res.cookies.get(`${source}_pick`)?.value ?? "", "", "no sealed tokens set");
  });

  test(`${source} /callback: access_denied is a clean connect-failed with the state cookie cleared, no exchange`, async () => {
    const state = stateFor(source);
    const res = await conn.callbackGET(req(cbUrl(source, state, "error=access_denied"), { cookies: { [`${source}_oauth_state`]: state } }), source, deps(fakeSession().session));
    assert.equal(res.status, 303);
    assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    assert.ok(cleared(res, `${source}_oauth_state`));
  });

  test(`${source} /callback: no code, a Google refusal, a network failure and a grant without a refresh token all fail cleanly`, async () => {
    const state = stateFor(source);
    const cookies = { [`${source}_oauth_state`]: state };
    const run = (url, fetchImpl) => conn.callbackGET(req(url, { cookies }), source, deps(fakeSession().session, fetchImpl));
    const cases = [
      [cbUrl(source, state, ""), noNetwork],
      [cbUrl(source, state), async () => json({ error: "invalid_grant" }, 400)],
      [cbUrl(source, state), async () => { throw new Error("ENOTFOUND"); }],
      [cbUrl(source, state), async () => json({ access_token: "A", expires_in: 3600, scope: SCOPE })], // no refresh_token
    ];
    for (const [url, f] of cases) {
      const res = await run(url, f);
      assert.equal(loc(res), `${HUB}/?error=connect-failed`);
      assert.ok(cleared(res, `${source}_oauth_state`));
      assert.equal(res.cookies.get(`${source}_pick`)?.value ?? "", "", "nothing sealed on a refusal");
    }
  });

  test(`${source} /callback happy path: seals the tokens into a pick-path cookie, clears state, redirects to pick, writes nothing`, async () => {
    const state = stateFor(source);
    const { session, calls } = fakeSession();
    const fetches = [];
    const fetchImpl = async (url) => { fetches.push(url); return json(GOOD_TOKEN); };
    const res = await conn.callbackGET(req(cbUrl(source, state), { cookies: { [`${source}_oauth_state`]: state } }), source, deps(session, fetchImpl));
    assert.equal(res.status, 303);
    assert.equal(loc(res), `${HUB}/api/oauth/${source}/pick`);
    assert.deepEqual(fetches, ["https://oauth2.googleapis.com/token"]);
    assert.equal(calls.length, 0, "the callback never writes");
    assert.ok(cleared(res, `${source}_oauth_state`));
    const pick = res.cookies.get(`${source}_pick`);
    assert.equal(pick.path, `/api/oauth/${source}/pick`);
    assert.equal(pick.httpOnly, true);
    assert.equal(pick.sameSite, "lax");
    assert.equal(pick.maxAge, PICK_TTL_MS / 1000);
    const opened = g.openGoogle(pick.value, SECRET, source);
    assert.equal(opened.ok, true);
    assert.equal(opened.pending.clientId, CLIENT);
    assert.equal(opened.pending.accessToken, "ACCESS_TOKEN_VALUE");
    assert.equal(opened.pending.refreshToken, "REFRESH_TOKEN_VALUE");
    assert.doesNotMatch(pick.value, /ACCESS_TOKEN_VALUE|REFRESH_TOKEN_VALUE/);
  });
}

/* -------------------------------------------------------------- GET /pick */

for (const source of ["meet", "drive"]) {
  test(`${source} GET /pick: renders the Picker page with a per-response CSP nonce and no-store`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    const a = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick`, { cookies }), source, deps(fakeSession().session));
    const b = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick`, { cookies }), source, deps(fakeSession().session));
    assert.equal(a.status, 200);
    assert.equal(a.headers.get("cache-control"), "no-store");
    // Not no-referrer: that makes the Picker callback's form POST carry `Origin: null`, which isCrossSite refuses.
    assert.equal(a.headers.get("referrer-policy"), "strict-origin");
    const csp = a.headers.get("content-security-policy");
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)[1];
    const html = await a.text();
    assert.equal(html.match(/nonce="/g).length, 2, "both script tags carry the nonce");
    assert.ok(html.includes(`nonce="${nonce}"`));
    assert.notEqual(nonce, b.headers.get("content-security-policy").match(/script-src 'nonce-([^']+)'/)[1], "fresh nonce per response");
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /form-action 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
    for (const origin of ["https://apis.google.com", "https://docs.google.com", "https://www.googleapis.com"]) assert.ok(csp.includes(origin), origin);
    assert.match(html, /https:\/\/apis\.google\.com\/js\/api\.js/);
    assert.match(html, /gapi\.load\("picker"/);
    assert.match(html, /DocsView\(google\.picker\.ViewId\.FOLDERS\)\.setIncludeFolders\(true\)\.setSelectFolderEnabled\(true\)\.setMimeTypes/);
    assert.match(html, /setOAuthToken\(c\.token\)\.setDeveloperKey\(c\.key\)\.setAppId\(c\.appId\)/);
    assert.ok(html.includes('"key":"picker-key"') && html.includes('"appId":"123456789012"') && html.includes('"token":"SEALED_ACCESS"'));
    assert.ok(html.includes(`<form id="f" method="post" action="/api/oauth/${source}/pick">`));
    assert.doesNotMatch(html, /SEALED_REFRESH/, "the refresh token never reaches the browser");
  });

  test(`${source} GET /pick: ?cancel=1 clears the cookie and returns to the hub; no cookie, expired, wrong tenant, anon all fail`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    const cancel = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick?cancel=1`, { cookies }), source, deps(fakeSession().session));
    assert.equal(cancel.status, 303);
    assert.equal(loc(cancel), `${HUB}/`);
    assert.ok(cleared(cancel, `${source}_pick`));
    const none = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick`), source, deps(fakeSession().session));
    assert.equal(loc(none), `${HUB}/?error=connect-failed`);
    const old = g.sealGoogle({ clientId: CLIENT, accessToken: "A", refreshToken: "R", expiresAt: "x" }, SECRET, source, Date.now() - PICK_TTL_MS - 1000);
    const expired = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick`, { cookies: { [`${source}_pick`]: old } }), source, deps(fakeSession().session));
    assert.equal(loc(expired), `${HUB}/?error=connect-failed`);
    const wrong = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick`, { cookies }), source, deps(fakeSession(OTHER_TENANT).session));
    assert.equal(loc(wrong), `${HUB}/?error=connect-failed`);
    const anon = await conn.pickGET(req(`${HUB}/api/oauth/${source}/pick`, { cookies }), source, deps(null));
    assert.equal(loc(anon), `${HUB}/?error=forbidden`);
  });
}

/* ------------------------------------------------------------- POST /pick */

const folderOk = (calls) => async (url, init) => { calls.push({ url, init }); return json({ id: FOLDER, mimeType: "application/vnd.google-apps.folder" }); };

for (const source of ["meet", "drive"]) {
  test(`${source} POST /pick: a cross-site POST is refused before the cookie, session or any fetch`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    let sessionReads = 0;
    const d = { session: async () => { sessionReads++; return fakeSession().session; }, fetchImpl: noNetwork };
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }, { "sec-fetch-site": "same-site" }]) {
      const res = await conn.pickPOST(formReq(source, FOLDER, cookies, headers), source, d);
      assert.equal(res.status, 303);
      assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    }
    assert.equal(sessionReads, 0);
  });

  test(`${source} POST /pick: Origin "null" is refused as cross-site even with Sec-Fetch-Site same-origin (the page must keep Origin intact)`, async () => {
    // What a form POST sends under Referrer-Policy: no-referrer. isCrossSite stays strict; pickGET's header is what keeps Origin.
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    let sessionReads = 0;
    const d = { session: async () => { sessionReads++; return fakeSession().session; }, fetchImpl: noNetwork };
    const res = await conn.pickPOST(formReq(source, FOLDER, cookies, { origin: "null", "sec-fetch-site": "same-origin" }), source, d);
    assert.equal(res.status, 303);
    assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    assert.equal(sessionReads, 0, "refused at the cross-site check, before the session");
  });

  test(`${source} POST /pick: no/foreign/expired cookie, wrong tenant and anon are refused with no fetch and no write`, async () => {
    const good = { [`${source}_pick`]: sealedFor(source) };
    const otherSource = source === "meet" ? "drive" : "meet";
    const fetches = [];
    const answers = async (url) => { fetches.push(url); return json({ id: FOLDER, mimeType: "application/vnd.google-apps.folder" }); };
    const cases = [
      [formReq(source, FOLDER, {}), CLIENT],
      [formReq(source, FOLDER, { [`${source}_pick`]: sealedFor(otherSource) }), CLIENT],
      [formReq(source, FOLDER, { [`${source}_pick`]: g.sealGoogle({ clientId: CLIENT, accessToken: "A", refreshToken: "R", expiresAt: "x" }, SECRET, source, Date.now() - PICK_TTL_MS - 1000) }), CLIENT],
      [formReq(source, FOLDER, good), OTHER_TENANT], // wrong tenant: Drive would say yes, the write would succeed
    ];
    for (const [r, tenant] of cases) {
      const { session, calls } = fakeSession(tenant);
      const res = await conn.pickPOST(r, source, deps(session, answers));
      assert.equal(loc(res), `${HUB}/?error=connect-failed`);
      assert.ok(cleared(res, `${source}_pick`));
      assert.equal(calls.length, 0, "no connect_source");
    }
    const anon = await conn.pickPOST(formReq(source, FOLDER, good), source, deps(null, answers));
    assert.equal(loc(anon), `${HUB}/?error=forbidden`);
    assert.equal(fetches.length, 0, "the sealed token was never used");
  });

  test(`${source} POST /pick: a malformed or missing folder id never reaches Drive`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    for (const bad of [undefined, "", "short", "../../etc/passwd0000", `${FOLDER}/../x`, `${FOLDER}?fields=*`, "a".repeat(129), "has space in id 12345"]) {
      const { session, calls } = fakeSession();
      const res = await conn.pickPOST(formReq(source, bad, cookies), source, deps(session));
      assert.equal(loc(res), `${HUB}/?error=connect-failed`, String(bad));
      assert.equal(calls.length, 0);
    }
  });

  test(`${source} POST /pick: Drive says not-a-folder, 403/404, or the call dies - refused, nothing written`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    const answers = [
      async () => json({ id: FOLDER, mimeType: "application/vnd.google-apps.document" }),
      async () => json({ error: { message: "forbidden" } }, 403),
      async () => json({ error: { message: "notFound" } }, 404),
      async () => { throw new Error("ETIMEDOUT"); },
    ];
    for (const fetchImpl of answers) {
      const { session, calls } = fakeSession();
      const res = await conn.pickPOST(formReq(source, FOLDER, cookies), source, deps(session, fetchImpl));
      assert.equal(loc(res), `${HUB}/?error=connect-failed`);
      assert.ok(cleared(res, `${source}_pick`));
      assert.equal(calls.length, 0, "connect_source never ran");
    }
  });

  test(`${source} POST /pick happy path: folder verified with the sealed token, ONE connect_source write, cookies cleared, 303`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    const { session, calls } = fakeSession();
    const fetchCalls = [];
    const res = await conn.pickPOST(formReq(source, FOLDER, cookies), source, deps(session, folderOk(fetchCalls)));
    assert.equal(res.status, 303);
    assert.equal(loc(res), `${HUB}/?connected=${source}`);
    assert.ok(cleared(res, `${source}_pick`));
    assert.ok(cleared(res, `${source}_oauth_state`));
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, `https://www.googleapis.com/drive/v3/files/${FOLDER}?fields=id,mimeType`);
    assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer SEALED_ACCESS");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "connect_source");
    assert.deepEqual(calls[0][1], g.connectArgs(source, "SEALED_ACCESS", "SEALED_REFRESH", "2026-11-20T00:00:00.000Z", FOLDER, ENV.GOOGLE_CLIENT_ID));
    assert.doesNotMatch(JSON.stringify(calls[0][1]), /client_secret|google_test_secret/);
  });

  test(`${source} POST /pick: a failed write is connect-failed with the cookie cleared and no token in the redirect`, async () => {
    const cookies = { [`${source}_pick`]: sealedFor(source) };
    const { session } = fakeSession(CLIENT, { code: "P0001", message: "SEALED_ACCESS leaked in message" });
    const res = await conn.pickPOST(formReq(source, FOLDER, cookies), source, deps(session, folderOk([])));
    assert.equal(loc(res), `${HUB}/?error=connect-failed`);
    assert.ok(cleared(res, `${source}_pick`));
    assert.doesNotMatch(loc(res), /SEALED/);
  });
}

/* ---------------------------------------------------------------- wiring */

test("route files: start POST-only, callback GET-only, pick GET+POST, for meet and drive", async () => {
  for (const s of ["meet", "drive"]) {
    const start = await import(`../app/api/oauth/${s}/start/route.ts`);
    const cb = await import(`../app/api/oauth/${s}/callback/route.ts`);
    const pick = await import(`../app/api/oauth/${s}/pick/route.ts`);
    assert.equal(typeof start.POST, "function"); assert.equal(start.GET, undefined);
    assert.equal(typeof cb.GET, "function"); assert.equal(cb.POST, undefined);
    assert.equal(typeof pick.GET, "function"); assert.equal(typeof pick.POST, "function");
  }
});

test("the state and pick cookies live exactly as long as their TTLs", () => {
  const src = readFileSync(new URL("../lib/google-connect.ts", import.meta.url), "utf8");
  assert.match(src, /googleStatePath\(source\), STATE_TTL_MS/);
  assert.match(src, /googlePickPath\(source\), PICK_TTL_MS/);
  assert.equal(STATE_TTL_MS / 1000, 300);
  assert.equal(PICK_TTL_MS / 1000, 600);
});

test("no token ever reaches a console.* call in the google flow", () => {
  for (const f of ["../lib/google-connect.ts", "../lib/google-oauth.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /console\.\w+\([^)]*(accessToken|refreshToken|token)\b/i, f);
  }
});
