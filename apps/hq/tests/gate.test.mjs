/**
 * gate.test.mjs — HQ's fail-closed gate, exercised through the REAL middleware.ts and the real
 * @supabase/ssr client; only fetch (the Supabase HTTP API) is faked. A session AND a profiles
 * row are required for everything outside the public set.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://hq-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";

const { middleware, config } = await import("../middleware.ts");
const { PUBLIC_PATHS, PUBLIC_PREFIX, isPublic } = await import("../lib/gate.ts");

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const USER = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "staff@example.test" };

// cookie name is sb-<first host label>-auth-token; value is "base64-" + base64url(session JSON)
const session = Buffer.from(
  JSON.stringify({ access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: USER }),
).toString("base64url");
const COOKIE = `sb-hq-test-auth-token=base64-${session}`;

/** Fake Supabase HTTP: auth user lookup and the profiles read. */
function fakeSupabase({ user = USER, profile = { id: USER.id }, down = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (down) throw new TypeError("fetch failed");
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/auth/v1/user")) return user ? json(200, user) : json(401, { message: "bad jwt" });
    if (u.includes("/rest/v1/profiles")) {
      return profile ? json(200, profile) : json(406, { code: "PGRST116", message: "The result contains 0 rows", details: null, hint: null });
    }
    throw new Error("unexpected fetch " + u);
  };
  return calls;
}

const req = (path, { cookie, method = "GET" } = {}) =>
  new NextRequest(`http://localhost:3105${path}`, { method, headers: cookie ? { cookie } : {} });

test("PUBLIC_PATHS is exactly /login /signout /api/health /mcp /authorize /token /register, plus the /.well-known/ prefix", () => {
  assert.deepEqual([...PUBLIC_PATHS], ["/login", "/signout", "/api/health", "/mcp", "/authorize", "/token", "/register"]);
  assert.equal(PUBLIC_PREFIX, "/.well-known/");
});

test("isPublic: the set is exact — near-misses and sub-paths are not public", () => {
  for (const p of [...PUBLIC_PATHS, "/.well-known/oauth-authorization-server", "/.well-known/x/y"]) assert.ok(isPublic(p), p);
  for (const p of ["/", "/leads", "/loginx", "/login/x", "/api", "/api/health/x", "/api/healthz", "/mcp/x", "/.well-known", "/x/.well-known/y", "/signout/"]) {
    assert.ok(!isPublic(p), p);
  }
});

test("matcher excludes _next/static, _next/image and favicon.ico only", () => {
  assert.deepEqual(config.matcher, ["/((?!_next/static|_next/image|favicon.ico).*)"]);
});

test("public path passes without touching Supabase", async () => {
  const calls = fakeSupabase();
  for (const p of ["/login", "/api/health", "/.well-known/jwks.json"]) {
    const res = await middleware(req(p));
    assert.equal(res.headers.get("x-middleware-next"), "1", p);
  }
  assert.equal(calls.length, 0);
});

test("no session -> 307 to /login", async () => {
  fakeSupabase();
  const res = await middleware(req("/?x=1"));
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")).pathname, "/login");
  assert.equal(new URL(res.headers.get("location")).search, "");
});

test("session WITHOUT a profiles row -> 307 to /login (signups never grant access)", async () => {
  const calls = fakeSupabase({ profile: null });
  const res = await middleware(req("/leads", { cookie: COOKIE }));
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")).pathname, "/login");
  assert.ok(calls.some((u) => u.includes("/rest/v1/profiles")), "the profiles table was consulted");
});

test("session with a profiles row -> next", async () => {
  fakeSupabase();
  const res = await middleware(req("/leads", { cookie: COOKIE }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-middleware-next"), "1");
});

test("an invalid session (auth rejects the token) -> 307", async () => {
  fakeSupabase({ user: null });
  assert.equal((await middleware(req("/", { cookie: COOKIE }))).status, 307);
});

test("Supabase unreachable fails closed -> 307", async () => {
  fakeSupabase({ down: true });
  assert.equal((await middleware(req("/", { cookie: COOKIE }))).status, 307);
});

test("a non-GET denial is 303 so the POST is not replayed against /login", async () => {
  fakeSupabase();
  assert.equal((await middleware(req("/leads", { method: "POST" }))).status, 303);
});

test("no Supabase env at all fails closed", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    fakeSupabase();
    assert.equal((await middleware(req("/", { cookie: COOKIE }))).status, 307);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
});

test("cookies are host-only: no domain option in the Supabase client setup", () => {
  for (const f of ["../middleware.ts", "../lib/supabase.ts"]) assert.doesNotMatch(read(f), /domain\s*:/i, f);
});
