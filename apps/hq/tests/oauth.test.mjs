/**
 * oauth.test.mjs — HQ's authorization server (lib/mcp/oauth.ts), port of apps/mcp/tests/oauth*.test.mjs
 * to Request/Response handlers. Every dependency is faked: no Supabase, no clock, no entropy, no network.
 * HQ-specific: /token returns HQ-issued OPAQUE tokens; the Supabase session stays server-side.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createOAuth,
  newState,
  redirectAllowed,
  clientIp,
  ipKey,
  publicOrigin,
  realRandomBytes,
  supabaseSessionDeps,
  supabaseTokenStore,
  CODE_TTL_MS,
  MAX_CODES,
  MAX_BODY_BYTES,
  KNOWN_IP_MAX,
  KNOWN_IP_TTL_MS,
  RETRY_AFTER_BLIP_SECONDS,
  RETRY_AFTER_SECONDS,
  TOKEN_MARGIN_SECONDS,
  REFRESH_TTL_MS,
} from "../lib/mcp/oauth.ts";
import { authorizeMcp, originAllowed, revokeMcpTokens } from "../lib/mcp/auth.ts";
import { fakeTokenDb } from "./_token-db.mjs";

delete process.env.HQ_PUBLIC_ORIGIN;
const TEST_KEY = "test-key-".padEnd(48, "k"); // stands in for MCP_TOKEN_KEY; a throwaway, not a secret
process.env.MCP_TOKEN_KEY = TEST_KEY;
const ISS = "https://hq.bcn-services.com";
const RESOURCE = `${ISS}/mcp`;
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const SB_JWT = `h.${Buffer.from(JSON.stringify({ sub: "user-1" })).toString("base64url")}.s`;
const b64u = (s) => createHash("sha256").update(s).digest("base64url");
const VERIFIER = "v".repeat(43);
const CHALLENGE = b64u(VERIFIER);
const NATE = { id: "user-1", handle: "nate" };

/** `over` replaces any dep; `t` exposes the fakes, the state maps and the fake token database (`t.db`). */
function boot(over = {}) {
  const t = { now: 1_000_000, signIns: [], refreshes: [], members: [], counter: 0 };
  const deps = {
    signIn: async (email, password) => {
      t.signIns.push([email, password]);
      return {
        ok: true,
        session: { access_token: SB_JWT, refresh_token: "sb-refresh-1", expires_in: 600 },
      };
    },
    refresh: async (rt) => {
      t.refreshes.push(rt);
      return {
        ok: true,
        session: { access_token: SB_JWT, refresh_token: "sb-refresh-2", expires_in: 600 },
      };
    },
    member: async (jwt) => (t.members.push(jwt), NATE),
    now: () => t.now,
    randomBytes: (n) => {
      const b = Buffer.alloc(n);
      b.writeUInt32BE(++t.counter);
      return b;
    },
    allowLogin: () => true,
    allowSignInUpstream: () => true,
    allowSignInIp: () => true,
    allowRefreshUpstream: () => true,
    allowKnownIpRefresh: () => true,
    allowUnknownIpRefresh: () => true,
    allowUnknownRefresh: () => true,
    ...over,
  };
  // Tokens live in Postgres: the real supabaseTokenStore, talking to a fake of the mcp_token_* functions.
  t.db = fakeTokenDb(() => t.now);
  deps.tokens ??= supabaseTokenStore(
    { url: "https://sb.test", anonKey: "anon-key" },
    { fetch: t.db.fetch }
  );
  t.state = newState();
  t.deps = deps;
  t.oauth = createOAuth(deps, t.state);
  return t;
}

const authParams = (over = {}) =>
  new URLSearchParams({
    response_type: "code",
    client_id: "client-1",
    redirect_uri: CLAUDE,
    state: "st-1",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
    ...over,
  });
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const post = (path, params, headers = {}) =>
  new Request(`${ISS}${path}`, {
    method: "POST",
    headers: { ...FORM, ...headers },
    body: params.toString(),
  });
const loginReq = (over = {}, headers = {}) => {
  const q = authParams(over);
  q.set("email", over.email ?? "owner@example.test");
  q.set("password", over.password ?? "pw");
  return post("/authorize", q, { origin: ISS, ...headers });
};
const getCode = async (t, over = {}) => {
  const res = await t.oauth.authorizePost(loginReq(over));
  assert.equal(res.status, 302);
  return new URL(res.headers.get("location")).searchParams.get("code");
};
const tokenReq = (params, headers = {}) => post("/token", new URLSearchParams(params), headers);
const exchange = (code, over = {}) =>
  tokenReq({
    grant_type: "authorization_code",
    code,
    redirect_uri: CLAUDE,
    client_id: "client-1",
    code_verifier: VERIFIER,
    ...over,
  });
const refreshReq = (rt, headers = {}) =>
  tokenReq({ grant_type: "refresh_token", refresh_token: rt }, headers);
/** A full connect: returns the opaque pair. */
async function connect(t) {
  const res = await t.oauth.token(exchange(await getCode(t)));
  assert.equal(res.status, 200);
  return res.json();
}

// ---- metadata -------------------------------------------------------------------------------

test("metadata names the configured origin, never the request host", async () => {
  const t = boot();
  const prm = await t.oauth.protectedResource().json();
  assert.deepEqual(prm, { resource: RESOURCE, authorization_servers: [ISS] });
  const as = await t.oauth.authorizationServer().json();
  assert.equal(as.issuer, ISS);
  assert.equal(as.token_endpoint, `${ISS}/token`);
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.equal(as.authorization_response_iss_parameter_supported, true);
});

test("HQ_PUBLIC_ORIGIN overrides the default and loses a trailing slash", () => {
  process.env.HQ_PUBLIC_ORIGIN = "https://hq.example.test/";
  try {
    assert.equal(publicOrigin(), "https://hq.example.test");
  } finally {
    delete process.env.HQ_PUBLIC_ORIGIN;
  }
  assert.equal(publicOrigin(), "https://hq.bcn-services.com");
});

// ---- redirects and register -----------------------------------------------------------------

test("redirectAllowed: exactly the spec list, every lookalike refused", () => {
  for (const ok of [
    CLAUDE,
    "https://claude.com/api/mcp/auth_callback",
    "http://localhost:6274/callback",
    "http://127.0.0.1:8080",
  ])
    assert.equal(redirectAllowed(ok), true, ok);
  for (const bad of [
    "https://claude.ai/api/mcp/auth_callback/",
    "https://claude.ai/api/mcp/auth_callback?x=1",
    "https://claude.ai.evil.test/api/mcp/auth_callback",
    "https://evil.test/https://claude.ai/api/mcp/auth_callback",
    "http://claude.ai/api/mcp/auth_callback",
    "https://localhost:6274/cb",
    "http://localhost.evil.test:6274/cb",
    "http://user:pw@localhost:6274/cb",
    "http://localhost:99999/cb",
    "http://localhost/cb",
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "https://chatgpt.com/connector/oauth/abc_DEF-1",
    "javascript:alert(1)",
    "",
    null,
    42,
  ])
    assert.equal(redirectAllowed(bad), false, String(bad));
});

test("register: good redirects get a random client_id and nothing is stored", async () => {
  const t = boot();
  const body = (o) => new Request(`${ISS}/register`, { method: "POST", body: JSON.stringify(o) });
  const res = await t.oauth.register(body({ redirect_uris: [CLAUDE] }));
  assert.equal(res.status, 201);
  const j = await res.json();
  assert.equal(j.token_endpoint_auth_method, "none");
  assert.deepEqual(j.redirect_uris, [CLAUDE]);
  assert.ok(j.client_id);
  assert.equal(t.state.codes.size + t.db.rows.size, 0);
  for (const bad of [
    {},
    { redirect_uris: [] },
    { redirect_uris: [CLAUDE, "https://evil.test/cb"] },
    { redirect_uris: "x" },
    { redirect_uris: Array(11).fill(CLAUDE) },
  ]) {
    const r = await t.oauth.register(body(bad));
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /invalid_redirect_uri/);
  }
  const junk = await t.oauth.register(
    new Request(`${ISS}/register`, { method: "POST", body: "{nope" })
  );
  assert.equal(junk.status, 400);
  assert.equal(
    (await t.oauth.register(new Request(`${ISS}/register`, { method: "POST", body: "null" })))
      .status,
    400
  );
});

// ---- authorize GET --------------------------------------------------------------------------

test("authorize GET: good request renders the hardened form; reflected values are escaped", async () => {
  const t = boot();
  const res = await t.oauth.authorizeGet(
    new Request(`${ISS}/authorize?${authParams({ state: `"><script>x</script>` })}`)
  );
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Sign in to bcns HQ/);
  assert.match(html, /make proposals as you/);
  assert.ok(!html.includes("<script>x"), "state is escaped");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "same-origin");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const csp = res.headers.get("content-security-policy");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self' https:\/\/claude\.ai/);
});

test("authorize GET: off-spec requests are a 400 page, never a redirect", async () => {
  const t = boot();
  const bad = [
    { response_type: "token" },
    { code_challenge_method: "plain" },
    { code_challenge: "short" },
    { code_challenge: `${CHALLENGE}=` },
    { redirect_uri: "https://evil.test/cb" },
    { client_id: "bad id" },
    { client_id: "" },
    { resource: "https://other.test/mcp" },
    { state: "s".repeat(1025) },
  ];
  for (const o of bad) {
    const res = await t.oauth.authorizeGet(new Request(`${ISS}/authorize?${authParams(o)}`));
    assert.equal(res.status, 400, JSON.stringify(o));
    assert.equal(res.headers.get("location"), null);
  }
});

// ---- authorize POST -------------------------------------------------------------------------

test("authorize POST: success is a 302 with code, state and iss; cookies are ignored", async () => {
  const t = boot();
  const res = await t.oauth.authorizePost(loginReq({}, { cookie: "sb-access-token=stolen; hq=1" }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("set-cookie"), null);
  const loc = new URL(res.headers.get("location"));
  assert.equal(`${loc.origin}${loc.pathname}`, CLAUDE);
  assert.ok(loc.searchParams.get("code"));
  assert.equal(loc.searchParams.get("state"), "st-1");
  assert.equal(loc.searchParams.get("iss"), ISS);
  assert.deepEqual(t.signIns, [["owner@example.test", "pw"]]);
  assert.deepEqual(t.members, [SB_JWT], "membership is checked with the session just issued");
});

test("authorize POST: wrong or absent Origin is 403 and nothing is attempted", async () => {
  const t = boot();
  for (const origin of [
    undefined,
    "null",
    "http://hq.bcn-services.com",
    "https://hq.bcn-services.com.evil.test",
    "https://claude.ai",
    "https://HQ.bcn-services.com",
  ]) {
    const res = await t.oauth.authorizePost(
      loginReq({}, origin === undefined ? { origin: "" } : { origin })
    );
    assert.equal(res.status, 403, String(origin));
  }
  assert.equal(t.signIns.length, 0);
});

test("authorize POST: bad content type, tampered hidden params and oversized bodies never sign in", async () => {
  const t = boot();
  const json = new Request(`${ISS}/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ISS },
    body: "{}",
  });
  assert.equal((await t.oauth.authorizePost(json)).status, 400);
  assert.equal(
    (await t.oauth.authorizePost(loginReq({ redirect_uri: "https://evil.test/cb" }))).status,
    400
  );
  assert.equal(
    (
      await t.oauth.authorizePost(
        post("/authorize", new URLSearchParams({ email: "a", password: "b" }), { origin: ISS })
      )
    ).status,
    400
  );
  const big = await t.oauth.authorizePost(loginReq({ password: "p".repeat(MAX_BODY_BYTES) }));
  assert.equal(big.status, 413);
  assert.equal(t.signIns.length, 0);
});

test("authorize POST: wrong password, empty and oversized credentials are the same generic 401", async () => {
  const wrong = boot({ signIn: async () => ({ ok: false, status: 400 }) });
  const a = await wrong.oauth.authorizePost(loginReq());
  assert.equal(a.status, 401);
  const text = await a.text();
  assert.match(text, /Wrong email or password/);
  for (const status of [401, 404, 422]) {
    const t = boot({ signIn: async () => ({ ok: false, status }) });
    const r = await t.oauth.authorizePost(loginReq());
    assert.equal(r.status, 401, String(status));
    assert.equal(await r.text(), text, "no account enumeration");
  }
  const t = boot();
  assert.equal((await t.oauth.authorizePost(loginReq({ email: "" }))).status, 401);
  assert.equal((await t.oauth.authorizePost(loginReq({ password: "x".repeat(1025) }))).status, 401);
  assert.equal(t.signIns.length, 0);
});

test("authorize POST: upstream outage is a 503 form error, not a wrong-password message", async () => {
  for (const status of [0, 429, 500, 503]) {
    const t = boot({ signIn: async () => ({ ok: false, status }) });
    const res = await t.oauth.authorizePost(loginReq());
    assert.equal(res.status, 503, String(status));
    assert.doesNotMatch(await res.text(), /Wrong email/);
    assert.equal(t.state.codes.size, 0);
  }
});

test("authorize POST: a Supabase user with no profiles row gets no code (403), a failing lookup is 503", async () => {
  const none = boot({ member: async () => null });
  const res = await none.oauth.authorizePost(loginReq());
  assert.equal(res.status, 403);
  assert.match(await res.text(), /No HQ membership/);
  assert.equal(none.state.codes.size, 0);
  const boom = boot({
    member: async () => {
      throw new Error("db down");
    },
  });
  assert.equal((await boom.oauth.authorizePost(loginReq())).status, 503);
  assert.equal(boom.state.codes.size, 0);
});

test("authorize POST: the limiters run before sign-in and spend nothing upstream when they refuse", async () => {
  const ips = [];
  const t = boot({ allowLogin: (ip) => (ips.push(ip), false) });
  assert.equal((await t.oauth.authorizePost(loginReq())).status, 429);
  assert.equal(t.signIns.length, 0);
  const g = boot({ allowSignInUpstream: () => false });
  assert.equal((await g.oauth.authorizePost(loginReq())).status, 429);
  const i = boot({ allowSignInIp: () => false });
  assert.equal((await i.oauth.authorizePost(loginReq())).status, 429);
  assert.equal(g.signIns.length + i.signIns.length, 0);
  // the key is the LAST X-Forwarded-For hop, else "unknown"
  await t.oauth.authorizePost(loginReq({}, { "x-forwarded-for": "6.6.6.6, 1.2.3.4" }));
  await t.oauth.authorizePost(loginReq());
  assert.deepEqual(ips, ["unknown", "1.2.3.4", "unknown"]);
});

test("authorize POST: a full code store is 503, and expired codes are swept to make room", async () => {
  const t = boot();
  for (let i = 0; i < MAX_CODES; i++)
    t.state.codes.set(`c${i}`, {
      session: {},
      member: NATE,
      challenge: "x",
      redirectUri: CLAUDE,
      clientId: "client-1",
      expiresAt: t.now + CODE_TTL_MS,
    });
  assert.equal((await t.oauth.authorizePost(loginReq())).status, 503);
  t.now += CODE_TTL_MS + 1;
  assert.equal((await t.oauth.authorizePost(loginReq())).status, 302);
  assert.equal(t.state.codes.size, 1);
});

// ---- token: code exchange -------------------------------------------------------------------

test("token: success returns an OPAQUE pair, uncached; the Supabase session never appears", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  const res = await t.oauth.token(exchange(await getCode(t)));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const raw = await res.text();
  const j = JSON.parse(raw);
  assert.equal(j.token_type, "Bearer");
  assert.equal(j.expires_in, 600 - TOKEN_MARGIN_SECONDS);
  assert.deepEqual(Object.keys(j).sort(), [
    "access_token",
    "expires_in",
    "refresh_token",
    "token_type",
  ]);
  for (const tok of [j.access_token, j.refresh_token]) {
    assert.match(tok, /^[A-Za-z0-9_-]{43}$/, "random base64url, no dots");
    assert.ok(!tok.includes("."));
    assert.throws(
      () => JSON.parse(Buffer.from(tok, "base64url").toString("utf8")),
      "not base64 JSON"
    );
  }
  assert.notEqual(j.access_token, j.refresh_token);
  assert.ok(
    !raw.includes(SB_JWT) && !raw.includes("sb-refresh-1"),
    "the Supabase session never reaches the client"
  );
  assert.deepEqual(await t.oauth.resolve(j.access_token), { jwt: SB_JWT, member: NATE });
  assert.equal(await t.oauth.resolve(SB_JWT), null, "the JWT itself is not a bearer");
  assert.equal(await t.oauth.resolve("nope"), null);
});

test("token: the opaque access token expires with the margin; the pair survives for refresh", async () => {
  const t = boot();
  const j = await connect(t);
  t.now += (600 - TOKEN_MARGIN_SECONDS) * 1000 - 1;
  assert.ok(await t.oauth.resolve(j.access_token));
  t.now += 1;
  assert.equal(await t.oauth.resolve(j.access_token), null);
  assert.equal((await t.oauth.token(refreshReq(j.refresh_token))).status, 200);
});

test("token: PKCE mismatch, redirect mismatch and client mismatch are invalid_grant and burn the code", async () => {
  for (const over of [
    { code_verifier: "w".repeat(43) },
    { code_verifier: "short" },
    { redirect_uri: "https://claude.com/api/mcp/auth_callback" },
    { client_id: "client-2" },
  ]) {
    const t = boot();
    const code = await getCode(t);
    const res = await t.oauth.token(exchange(code, over));
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.equal((await res.json()).error, "invalid_grant");
    assert.equal((await t.oauth.token(exchange(code))).status, 400, "burned");
    assert.equal(t.db.count("access"), 0);
  }
});

test("token: a code works once, expires at its TTL, and unknown or incomplete requests are refused", async () => {
  const t = boot();
  const code = await getCode(t);
  assert.equal((await t.oauth.token(exchange(code))).status, 200);
  const again = await t.oauth.token(exchange(code));
  assert.equal((await again.json()).error, "invalid_grant");
  const c2 = await getCode(t);
  t.now += CODE_TTL_MS - 1;
  assert.equal((await t.oauth.token(exchange(c2))).status, 200);
  const c3 = await getCode(t);
  t.now += CODE_TTL_MS;
  assert.equal((await (await t.oauth.token(exchange(c3))).json()).error, "invalid_grant");
  const e = async (req) => (await (await t.oauth.token(req)).json()).error;
  assert.equal(await e(exchange("unknown")), "invalid_grant");
  assert.equal(await e(exchange("x", { code_verifier: "" })), "invalid_request");
  assert.equal(await e(tokenReq({ grant_type: "password" })), "unsupported_grant_type");
  assert.equal(await e(tokenReq({})), "invalid_request");
  assert.equal(
    await e(
      new Request(`${ISS}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ),
    "invalid_request"
  );
  const big = await t.oauth.token(
    tokenReq({ grant_type: "authorization_code", code: "c".repeat(MAX_BODY_BYTES) })
  );
  assert.equal(big.status, 413);
});

test("token: concurrent redemption of one code mints exactly one pair", async () => {
  const t = boot();
  const code = await getCode(t);
  const rs = await Promise.all([
    t.oauth.token(exchange(code)),
    t.oauth.token(exchange(code)),
    t.oauth.token(exchange(code)),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 400, 400]);
  assert.equal(t.db.count("access"), 1);
});

test("token: a code is not a refresh token and a refresh token is not a code", async () => {
  const t = boot();
  const code = await getCode(t);
  assert.equal((await (await t.oauth.token(refreshReq(code))).json()).error, "invalid_grant");
  const j = await connect(t);
  assert.equal(
    (await (await t.oauth.token(exchange(j.refresh_token))).json()).error,
    "invalid_grant"
  );
  assert.equal(
    (await (await t.oauth.token(refreshReq(j.access_token))).json()).error,
    "invalid_grant",
    "the access token is not a refresh token"
  );
});

// ---- token: refresh -------------------------------------------------------------------------

test("refresh: maps opaque -> stored Supabase refresh token, issues a NEW opaque pair, drops the old one", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  const first = await connect(t);
  const res = await t.oauth.token(refreshReq(first.refresh_token));
  assert.equal(res.status, 200);
  const raw = await res.text();
  const second = JSON.parse(raw);
  assert.deepEqual(
    t.refreshes,
    ["sb-refresh-1"],
    "GoTrue got the stored Supabase refresh token, not the opaque one"
  );
  assert.ok(!raw.includes("sb-refresh-2") && !raw.includes(SB_JWT));
  assert.notEqual(second.access_token, first.access_token);
  assert.notEqual(second.refresh_token, first.refresh_token);
  assert.match(second.access_token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await t.oauth.resolve(first.access_token), null, "old access dropped");
  assert.ok(await t.oauth.resolve(second.access_token));
  assert.equal(t.db.count("access"), 1);
  assert.equal(t.db.count("refresh"), 1);
  // the old refresh token is gone: invalid_grant, and no second upstream call
  const reuse = await t.oauth.token(refreshReq(first.refresh_token));
  assert.equal((await reuse.json()).error, "invalid_grant");
  assert.equal(t.refreshes.length, 1);
  // and the next rotation uses the rotated Supabase refresh token
  await t.oauth.token(refreshReq(second.refresh_token));
  assert.deepEqual(t.refreshes, ["sb-refresh-1", "sb-refresh-2"]);
});

test("refresh: an unknown opaque refresh token is invalid_grant with no upstream call", async () => {
  const t = boot();
  for (const rt of ["nope", "sb-refresh-1", SB_JWT]) {
    assert.equal((await (await t.oauth.token(refreshReq(rt))).json()).error, "invalid_grant");
  }
  assert.equal(t.refreshes.length, 0);
  assert.equal(
    (await (await t.oauth.token(tokenReq({ grant_type: "refresh_token" }))).json()).error,
    "invalid_request"
  );
});

test("refresh: GoTrue 400/403 is invalid_grant and drops the pair; anything else is a 503 that keeps it", async () => {
  for (const status of [400, 403]) {
    const t = boot({ refresh: async () => ({ ok: false, status }) });
    const j = await connect(t);
    const res = await t.oauth.token(refreshReq(j.refresh_token));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_grant");
    assert.equal(await t.oauth.resolve(j.access_token), null);
    assert.equal(t.db.count("refresh"), 0);
  }
  for (const [status, retry] of [
    [0, String(RETRY_AFTER_BLIP_SECONDS)],
    [401, String(RETRY_AFTER_SECONDS)],
    [404, String(RETRY_AFTER_SECONDS)],
    [429, String(RETRY_AFTER_SECONDS)],
    [500, String(RETRY_AFTER_SECONDS)],
  ]) {
    const t = boot({ refresh: async () => ({ ok: false, status }) });
    const j = await connect(t);
    const res = await t.oauth.token(refreshReq(j.refresh_token));
    assert.equal(res.status, 503, String(status));
    assert.equal((await res.json()).error, "temporarily_unavailable");
    assert.equal(res.headers.get("retry-after"), retry);
    assert.ok(await t.oauth.resolve(j.access_token), "the pair is kept");
    assert.equal(t.db.count("refresh"), 1);
  }
});

test("refresh: membership is re-checked with the NEW session; revoked = invalid_grant and the pair is dropped", async () => {
  let revoked = false;
  const t = boot({ member: async (jwt) => (t.members.push(jwt), revoked ? null : NATE) });
  const j = await connect(t);
  revoked = true;
  const res = await t.oauth.token(refreshReq(j.refresh_token));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_grant");
  assert.equal(t.members.length, 2, "once at sign-in, once after the refresh");
  assert.equal(await t.oauth.resolve(j.access_token), null);
  assert.equal(t.db.count("access"), 0);
  assert.equal(t.db.count("refresh"), 0);
});

test("refresh: a failing membership lookup is a 503 that keeps the pair, pointed at GoTrue's rotated token", async () => {
  let down = false;
  const t = boot({
    member: async () => {
      if (down) throw new Error("db down");
      return NATE;
    },
  });
  const j = await connect(t);
  down = true;
  const res = await t.oauth.token(refreshReq(j.refresh_token));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "temporarily_unavailable");
  assert.ok(await t.oauth.resolve(j.access_token), "the pair is kept");
  down = false;
  const again = await t.oauth.token(refreshReq(j.refresh_token));
  assert.equal(again.status, 200);
  assert.deepEqual(
    t.refreshes,
    ["sb-refresh-1", "sb-refresh-2"],
    "the retry used the rotated token"
  );
});

test("refresh: the unknown-IP and global budgets answer 503 before GoTrue is called", async () => {
  const t = boot({ allowUnknownIpRefresh: () => false });
  const j = await connect(t);
  t.state.knownIps.clear();
  const res = await t.oauth.token(refreshReq(j.refresh_token));
  assert.equal(res.status, 503);
  assert.equal(t.refreshes.length, 0);
  const g = boot({ allowRefreshUpstream: () => false });
  const k = await connect(g);
  assert.equal((await g.oauth.token(refreshReq(k.refresh_token))).status, 503);
  assert.equal(g.refreshes.length, 0);
});

test("refresh: a good exchange makes the IP known (known budget applies), a failed one does not; known status expires", async () => {
  const calls = { known: 0, unknown: 0 };
  const t = boot({
    allowKnownIpRefresh: () => (calls.known++, true),
    allowUnknownIpRefresh: () => (calls.unknown++, true),
  });
  const ip = { "x-forwarded-for": "9.9.9.9" };
  const exchangeFrom = (code) =>
    exchange(code, {})
      .text()
      .then(
        (body) => new Request(`${ISS}/token`, { method: "POST", headers: { ...FORM, ...ip }, body })
      );
  assert.equal((await t.oauth.token(await exchangeFrom("nope"))).status, 400);
  assert.equal(t.state.knownIps.size, 0, "a failed exchange does not make the IP known");
  const j = await (await t.oauth.token(await exchangeFrom(await getCode(t)))).json();
  assert.ok(t.state.knownIps.has("9.9.9.9"));
  assert.equal((await t.oauth.token(refreshReq(j.refresh_token, ip))).status, 200);
  assert.deepEqual(calls, { known: 1, unknown: 0 });
  t.now += KNOWN_IP_TTL_MS;
  const k = await connect(t);
  assert.equal((await t.oauth.token(refreshReq(k.refresh_token, ip))).status, 200);
  assert.equal(calls.unknown, 1, "expired known status falls back to the unknown budget");
});

test("markKnown is bounded and evicts the oldest", () => {
  const t = boot();
  for (let i = 0; i <= KNOWN_IP_MAX; i++) t.oauth.markKnown(`ip${i}`);
  assert.equal(t.state.knownIps.size, KNOWN_IP_MAX);
  assert.ok(!t.state.knownIps.has("ip0"));
});

// ---- persistence (migration 0031: mcp_tokens) -------------------------------------------------

test("tokens persist: a restart (fresh process state) still resolves the bearer, and refresh still works", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  const j = await connect(t);
  // a deploy: globalThis.__hqOAuthState and every in-process Map are gone; only the database remains
  t.state = newState();
  const after = createOAuth(t.deps, t.state);
  assert.deepEqual(await after.resolve(j.access_token), { jwt: SB_JWT, member: NATE });
  const res = await after.token(refreshReq(j.refresh_token));
  assert.equal(res.status, 200);
  const second = await res.json();
  assert.deepEqual(t.refreshes, ["sb-refresh-1"]);
  assert.equal(
    await after.resolve(j.access_token),
    null,
    "rotated: the old access token is revoked"
  );
  assert.ok(await after.resolve(second.access_token));
});

test("tokens are stored under an HMAC hex key with an expiry, never in the clear", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  const j = await connect(t);
  assert.equal(t.db.rows.size, 2);
  const ah = createHmac("sha256", TEST_KEY).update(j.access_token).digest("hex");
  const rh = createHmac("sha256", TEST_KEY).update(j.refresh_token).digest("hex");
  assert.match(ah, /^[0-9a-f]{64}$/);
  assert.equal(t.deps.tokens.id(j.access_token), ah);
  assert.notEqual(
    ah,
    createHash("sha256").update(j.access_token).digest("hex"),
    "not a bare sha256"
  );
  assert.deepEqual([...t.db.rows.keys()].sort(), [ah, rh].sort());
  const a = t.db.rows.get(ah);
  const r = t.db.rows.get(rh);
  assert.equal(a.expires_at, t.now + (600 - TOKEN_MARGIN_SECONDS) * 1000);
  assert.equal(r.expires_at, t.now + REFRESH_TTL_MS);
  assert.equal(a.kind, "access");
  assert.equal(r.kind, "refresh");
  assert.equal(a.payload.refresh_hash, rh, "the pair is linked by hash");
  const stored = JSON.stringify([...t.db.rows.entries()]);
  assert.ok(!stored.includes(j.access_token) && !stored.includes(j.refresh_token));
  // the store is called with the user's own JWT; lookups and revokes carry only the anon key
  const store = t.db.calls.filter((c) => c.fn === "mcp_token_store");
  assert.ok(store.length === 2 && store.every((c) => c.auth === SB_JWT));
  await t.oauth.resolve(j.access_token);
  assert.equal(t.db.calls.at(-1).fn, "mcp_token_lookup");
  assert.equal(t.db.calls.at(-1).auth, "anon-key");
});

test("an expired row is refused: the access token at its TTL, the refresh token at 30 days", async () => {
  const t = boot();
  const j = await connect(t);
  t.now += (600 - TOKEN_MARGIN_SECONDS) * 1000;
  assert.equal(await t.oauth.resolve(j.access_token), null);
  t.now += REFRESH_TTL_MS - (600 - TOKEN_MARGIN_SECONDS) * 1000 - 1;
  assert.equal(
    (await t.oauth.token(refreshReq(j.refresh_token))).status,
    200,
    "still live at 30d - 1ms"
  );
  const k = await connect(t);
  t.now += REFRESH_TTL_MS;
  const res = await t.oauth.token(refreshReq(k.refresh_token));
  assert.equal((await res.json()).error, "invalid_grant");
  assert.equal(t.refreshes.length, 1, "no upstream call for an expired row");
});

test("a bad or missing row kind never resolves: a refresh token is not a bearer", async () => {
  const t = boot();
  const j = await connect(t);
  assert.equal(await t.oauth.resolve(j.refresh_token), null);
});

test("a token-store outage is a 503, not invalid_grant: resolve throws, refresh retries, issue fails closed", async () => {
  const t = boot();
  const j = await connect(t);
  const down = createOAuth(
    {
      ...t.deps,
      tokens: supabaseTokenStore(
        { url: "https://sb.test", anonKey: "anon-key" },
        { fetch: async () => new Response("{}", { status: 500 }) }
      ),
    },
    newState()
  );
  await assert.rejects(down.resolve(j.access_token));
  const res = await down.token(refreshReq(j.refresh_token));
  assert.equal(res.status, 503);
  assert.equal(t.refreshes.length, 0, "GoTrue was not called, so its token was not rotated");
  // issuing with a store that refuses writes: 503, and no half-written pair survives
  const u = boot({
    tokens: {
      put: async () => {
        throw new Error("down");
      },
      get: async () => null,
      del: async () => {},
      delUser: async () => {},
    },
  });
  const r = await u.oauth.token(exchange(await getCode(u)));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "temporarily_unavailable");
});

test("issue: a failed access-row write removes the refresh row that was stored first", async () => {
  let n = 0;
  const t = boot();
  const inner = t.deps.tokens;
  const flaky = createOAuth(
    {
      ...t.deps,
      tokens: {
        ...inner,
        put: (jwt, row) => (++n === 2 ? Promise.reject(new Error("x")) : inner.put(jwt, row)),
      },
    },
    newState()
  );
  const res = await flaky.token(exchange(await getCode({ oauth: flaky })));
  assert.equal(res.status, 503);
  assert.equal(t.db.rows.size, 0);
});

test("the chatgpt redirects are gone: neither the allowlist nor register accepts them", async () => {
  const t = boot();
  for (const uri of [
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "https://chatgpt.com/connector/oauth/abc",
  ]) {
    assert.equal(redirectAllowed(uri), false);
    const r = await t.oauth.register(
      new Request(`${ISS}/register`, {
        method: "POST",
        body: JSON.stringify({ redirect_uris: [uri] }),
      })
    );
    assert.equal(r.status, 400);
  }
  const src = readFileSync(new URL("../lib/mcp/oauth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /chatgpt/i);
});

test("supabaseTokenStore: the real RPC shape (paths, bodies, credentials) and fail-closed parsing", async () => {
  const calls = [];
  const store = supabaseTokenStore(
    { url: "https://sb.test/", anonKey: "sb_publishable_x" },
    {
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        const fn = String(url).split("/").pop();
        if (fn === "mcp_token_lookup") {
          const j = JSON.parse(init.body).p_hash;
          if (j === "bad") return new Response(JSON.stringify({ kind: "weird" }), { status: 200 });
          return new Response(
            JSON.stringify({
              kind: "access",
              user_id: "u1",
              payload: { jwt: "j" },
              expires_at: "2026-10-27T10:00:00+00:00",
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 204 });
      },
    }
  );
  const row = {
    hash: "h".repeat(64),
    kind: "access",
    userId: "u1",
    payload: { jwt: "j" },
    expiresAt: 1_000,
  };
  await store.put("user-jwt", row);
  assert.equal(calls[0].url, "https://sb.test/rest/v1/rpc/mcp_token_store");
  assert.equal(calls[0].init.headers.Authorization, "Bearer user-jwt");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_hash: row.hash,
    p_kind: "access",
    p_user_id: "u1",
    p_payload: { jwt: "j" },
    p_expires_at: new Date(1_000).toISOString(),
  });
  const got = await store.get("x".repeat(64));
  assert.deepEqual(got, {
    hash: "x".repeat(64),
    kind: "access",
    userId: "u1",
    payload: { jwt: "j" },
    expiresAt: Date.parse("2026-10-27T10:00:00+00:00"),
  });
  assert.equal(
    calls[1].init.headers.Authorization,
    undefined,
    "a publishable key is never a Bearer"
  );
  assert.equal(await store.get("bad"), null, "a malformed row is a miss");
  await store.delUser("user-jwt", "u1");
  assert.equal(calls.at(-1).url, "https://sb.test/rest/v1/rpc/mcp_token_revoke_user");
});

test("auth.ts: a bearer issued before a restart still becomes an McpCaller; outage = 503, unknown = 401", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  const j = await connect(t);
  const clients = [];
  const rtFor = (oauth) => ({
    oauth,
    limiter: { allow: () => true },
    client: (jwt) => (clients.push(jwt), { sb: "client" }),
  });
  const req = (bearer, headers = {}) =>
    new Request(`${ISS}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, ...headers },
    });
  // the process restarts: globalThis.__hqOAuthState is reset and a new createOAuth reads it
  globalThis.__hqOAuthState = undefined;
  const fresh = createOAuth(t.deps);
  assert.equal(fresh.resolve !== t.oauth.resolve, true);
  const caller = await authorizeMcp(req(j.access_token), rtFor(fresh));
  assert.deepEqual(caller.actor, NATE);
  assert.deepEqual(caller.sb, { sb: "client" });
  assert.deepEqual(clients, [SB_JWT]);
  globalThis.__hqOAuthState = undefined;
  assert.equal((await authorizeMcp(req("nope"), rtFor(fresh))).status, 401);
  assert.equal((await authorizeMcp(req(j.refresh_token), rtFor(fresh))).status, 401);
  const down = createOAuth({
    ...t.deps,
    tokens: supabaseTokenStore(
      { url: "https://sb.test", anonKey: "k" },
      { fetch: async () => new Response("", { status: 502 }) }
    ),
  });
  assert.equal((await authorizeMcp(req(j.access_token), rtFor(down))).status, 503);
  // chatgpt.com is no longer an allowed browser origin
  assert.equal(originAllowed("https://chatgpt.com"), false);
  assert.equal(originAllowed("https://claude.ai"), true);
  assert.equal(
    (await authorizeMcp(req(j.access_token, { origin: "https://chatgpt.com" }), rtFor(fresh)))
      .status,
    403
  );
});

test("sign-out revokes the user's MCP tokens: revokeMcpTokens deletes every row of the signed-in user only", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  await connect(t);
  await connect(t);
  t.db.rows.set("f".repeat(64), {
    kind: "access",
    user_id: "someone-else",
    payload: {},
    expires_at: t.now + 1e6,
  });
  assert.equal(t.db.rows.size, 5);
  const store = supabaseTokenStore(
    { url: "https://sb.test", anonKey: "anon-key" },
    { fetch: t.db.fetch }
  );
  // the cookie-session client: getUser() and rpc() as that user. rpc goes through the same fake database.
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    rpc: async (fn, args) => (
      assert.equal(fn, "mcp_token_revoke_user"),
      await store.delUser(SB_JWT, args.p_user_id),
      { error: null }
    ),
  };
  await revokeMcpTokens(sb);
  assert.deepEqual(
    [...t.db.rows.values()].map((r) => r.user_id),
    ["someone-else"]
  );
  // signed out already: nothing to revoke, no rpc
  await revokeMcpTokens({ auth: { getUser: async () => ({ data: { user: null } }) } });
  // an rpc error surfaces (the route logs it and still signs out)
  await assert.rejects(
    revokeMcpTokens({ auth: sb.auth, rpc: async () => ({ error: { message: "boom" } }) }),
    /mcp_token_revoke_user/
  );
  const route = readFileSync(new URL("../app/signout/route.ts", import.meta.url), "utf8");
  assert.match(route, /revokeMcpTokens\(sb\)/);
  assert.ok(
    route.indexOf("revokeMcpTokens(sb)") < route.indexOf("sb?.auth.signOut()"),
    "revoke runs before the session is cleared"
  );
  assert.match(route, /\.catch\(/, "a revoke failure never blocks sign-out");
});

// ---- ip helpers -----------------------------------------------------------------------------

test("clientIp: the last hop wins; ipKey: IPv4 whole, mapped as IPv4, other IPv6 as /64", () => {
  const r = (xff) =>
    new Request(ISS, { headers: xff === undefined ? {} : { "x-forwarded-for": xff } });
  assert.equal(clientIp(r("1.1.1.1, 2.2.2.2, 3.3.3.3")), "3.3.3.3");
  assert.equal(clientIp(r("6.6.6.6,")), "unknown");
  assert.equal(clientIp(r()), "unknown");
  assert.equal(ipKey("203.0.113.9"), "203.0.113.9");
  assert.equal(ipKey("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), ipKey("2001:db8:1:2::1"));
  assert.notEqual(ipKey("2001:db8:1:3::1"), ipKey("2001:db8:1:2::1"));
});

// ---- real GoTrue deps (fetch stubbed) -------------------------------------------------------

function stubFetch(handler) {
  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(url, init);
  };
  return { fetchStub, calls };
}
const ENV = { url: "https://sb.example.test/", anonKey: "anon.jwt.key" };
const session = {
  access_token: SB_JWT,
  refresh_token: "r",
  expires_in: 3600,
  user: { email: "x" },
};

test("real deps: request shape, session mapping, and statuses pass through", async () => {
  const { fetchStub, calls } = stubFetch(
    async () => new Response(JSON.stringify(session), { status: 200 })
  );
  const d = supabaseSessionDeps(ENV, { fetch: fetchStub, log: () => {} });
  const r = await d.signIn("a@example.test", "pw");
  assert.deepEqual(r, {
    ok: true,
    session: { access_token: SB_JWT, refresh_token: "r", expires_in: 3600 },
  });
  assert.equal(calls[0].url, "https://sb.example.test/auth/v1/token?grant_type=password");
  assert.equal(calls[0].init.headers.apikey, "anon.jwt.key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer anon.jwt.key");
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: "a@example.test", password: "pw" });
  await d.refresh("tok");
  assert.equal(calls[1].url, "https://sb.example.test/auth/v1/token?grant_type=refresh_token");
  assert.deepEqual(JSON.parse(calls[1].init.body), { refresh_token: "tok" });
  for (const status of [400, 403, 429, 500]) {
    const f = stubFetch(async () => new Response("{}", { status }));
    const out = await supabaseSessionDeps(ENV, { fetch: f.fetchStub, log: () => {} }).refresh("t");
    assert.deepEqual(out, { ok: false, status });
    assert.equal(f.calls.length, 1, "a single attempt");
  }
});

test("real deps: a new-format publishable key goes in apikey only, never as a Bearer token", async () => {
  const { fetchStub, calls } = stubFetch(async () => new Response(JSON.stringify(session)));
  await supabaseSessionDeps(
    { ...ENV, anonKey: "sb_publishable_abc" },
    { fetch: fetchStub, log: () => {} }
  ).signIn("a", "b");
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_abc");
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test("real deps: unreachable, hung and malformed answers are status 0 and log one status-only line", async () => {
  const lines = [];
  const log = (l) => lines.push(l);
  const boom = supabaseSessionDeps(ENV, {
    fetch: async () => {
      throw new Error("ECONNREFUSED secret-body");
    },
    log,
  });
  assert.deepEqual(await boom.signIn("a", "b"), { ok: false, status: 0 });
  const keepAlive = setTimeout(() => {}, 2000); // AbortSignal.timeout is unref'd; keep the loop up
  const hung = supabaseSessionDeps(ENV, {
    timeoutMs: 20,
    log,
    fetch: (u, init) =>
      new Promise((_, rej) =>
        init.signal.addEventListener("abort", () => rej(new Error("aborted")))
      ),
  });
  assert.deepEqual(await hung.refresh("t"), { ok: false, status: 0 });
  clearTimeout(keepAlive);
  const junk = supabaseSessionDeps(ENV, {
    fetch: async () => new Response(JSON.stringify({ access_token: 1 })),
    log,
  });
  assert.deepEqual(await junk.signIn("a", "b"), { ok: false, status: 0 });
  const http = supabaseSessionDeps(ENV, {
    fetch: async () => new Response("secret-body", { status: 400 }),
    log,
  });
  assert.deepEqual(await http.signIn("a", "b"), { ok: false, status: 400 });
  assert.equal(lines.length, 4);
  for (const l of lines) {
    assert.doesNotMatch(l, /secret-body|pw|Bearer/);
    assert.equal(JSON.parse(l).level, "error");
  }
  assert.equal(JSON.parse(lines[0]).event, "gotrue_signin_failed");
  assert.equal(JSON.parse(lines[1]).event, "gotrue_refresh_failed");
});

test("MCP_TOKEN_KEY: a row key derived from the bearer alone (plain sha256) misses; the key is required", async () => {
  const t = boot({ randomBytes: realRandomBytes });
  const j = await connect(t);
  // what a bearer holder can compute with no server secret: the public anon-callable lookup finds nothing
  const sha = (x) => createHash("sha256").update(x).digest("hex");
  const rpc = async (hash) =>
    (
      await t.db.fetch("https://sb.test/rest/v1/rpc/mcp_token_lookup", {
        method: "POST",
        headers: {
          apikey: "anon-key",
          authorization: "Bearer anon-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_hash: hash }),
      })
    ).json();
  assert.equal(await rpc(sha(j.access_token)), null);
  assert.equal(await rpc(sha(j.refresh_token)), null);
  assert.notEqual(
    await rpc(t.deps.tokens.id(j.access_token)),
    null,
    "control: the keyed hash does hit"
  );
  // a restart with the key still set resolves it
  globalThis.__hqOAuthState = undefined;
  assert.ok(await createOAuth(t.deps).resolve(j.access_token));
  // another key (or none) cannot resolve it
  for (const key of ["", "short", "x".repeat(64)]) {
    const other = createOAuth({
      ...t.deps,
      tokens: supabaseTokenStore(
        { url: "https://sb.test", anonKey: "anon-key" },
        { fetch: t.db.fetch, key }
      ),
    });
    if (key.length < 32) await assert.rejects(other.resolve(j.access_token), /MCP_TOKEN_KEY/);
    else assert.equal(await other.resolve(j.access_token), null);
  }
});

test("MCP_TOKEN_KEY unset or short: nothing is issued (503), refresh is 503, bearer is a 503, no row is written", async () => {
  const saved = process.env.MCP_TOKEN_KEY;
  try {
    const t = boot({ randomBytes: realRandomBytes });
    const good = await connect(t);
    const rowsBefore = t.db.rows.size;
    for (const v of [undefined, "", "k".repeat(31)]) {
      if (v === undefined) delete process.env.MCP_TOKEN_KEY;
      else process.env.MCP_TOKEN_KEY = v;
      const res = await t.oauth.token(exchange(await getCode(t)));
      assert.equal(res.status, 503, `issue refused with key ${JSON.stringify(v)}`);
      const refresh = await t.oauth.token(refreshReq(good.refresh_token));
      assert.equal(refresh.status, 503);
      await assert.rejects(t.oauth.resolve(good.access_token), /MCP_TOKEN_KEY/);
      const rt = { oauth: t.oauth, limiter: { allow: () => true }, client: () => ({}) };
      const r = await authorizeMcp(
        new Request(`${ISS}/mcp`, {
          method: "POST",
          headers: { authorization: `Bearer ${good.access_token}` },
        }),
        rt
      );
      assert.equal(r.status, 503);
      assert.equal(t.db.rows.size, rowsBefore, "no row written while the key is missing");
    }
  } finally {
    process.env.MCP_TOKEN_KEY = saved;
  }
});
