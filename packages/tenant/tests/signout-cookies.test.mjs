/**
 * signout-cookies.test.mjs — what a sign-out leaves in the browser, driven
 * through the real tenantMiddleware (the path that calls
 * supabase.auth.signOut() and writes the cleared cookies with `...shared`).
 * Real @supabase/ssr client, stubbed fetch, no network.
 *
 * Coverage gap (stated, not hidden): this drives the middleware's wrong-client
 * signOut (local scope). The user-initiated global-scope sign-out in
 * apps/connect and apps/sb goes through createServerSupabase (src/index.ts),
 * which needs a Next request scope and is not driven here. Both paths share
 * cookieOptions, which is what (a) pins. Only the 3-chunk session cookie is
 * covered, not an unchunked one or the code-verifier cookie.
 *
 * Guards: (a) every cleared auth cookie carries Domain=.bcn-services.com, or the
 * browser keeps the shared cookie and the other apps stay signed in;
 * (b) every chunk of the session cookie SB reads is cleared, not just the first.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { tenantMiddleware } from "../src/middleware.ts";
import { COOKIE_DOMAIN } from "../src/cookies.ts";

const REF = "abcdefghijklmnopqrst";
const KEY = `sb-${REF}-auth-token`;
const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "owner@example.com",
  aud: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const b64url = (v) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");

/** A session cookie split into `n` chunks (`<key>.0` .. `<key>.n-1`), as ssr writes big sessions. */
function chunkedSessionCookie(n) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const claims = { sub: USER.id, exp, client_id: "dddddddd-dddd-dddd-dddd-dddddddddddd", client_role: "owner" };
  const session = {
    access_token: `h.${b64url(claims)}.s`,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: USER,
  };
  const value = `base64-${b64url(session)}`;
  const size = Math.ceil(value.length / n);
  return Array.from({ length: n }, (_, i) => `${KEY}.${i}=${value.slice(i * size, (i + 1) * size)}`);
}

/** wrong-client rejection: middleware calls signOut() and redirects with the cleared cookies. */
async function signOutVia(host, chunks, extra = []) {
  const cookie = [...chunkedSessionCookie(chunks), ...extra].join("; ");
  const req = new NextRequest(`https://${host}/dashboard`, { headers: { host, cookie } });
  return tenantMiddleware({ expectedClientId: "cccccccc-cccc-cccc-cccc-cccccccccccc" })(req);
}

let savedFetch;
beforeEach(() => {
  savedFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input?.url ?? input);
    const body = url.includes("/auth/v1/user") ? USER : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${REF}.supabase.co`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});
afterEach(() => {
  globalThis.fetch = savedFetch;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test("sign-out: every cleared auth cookie carries Domain=.bcn-services.com and is expired", async () => {
  for (const host of ["connect.bcn-services.com", "sb.bcn-services.com"]) {
    const res = await signOutVia(host, 2);
    const cleared = res.cookies.getAll().filter((c) => c.name.startsWith(KEY));
    assert.ok(cleared.length >= 1, `${host}: no cleared auth cookie on the redirect`);
    for (const c of cleared) {
      assert.equal(c.value, "", `${host}: ${c.name} must be emptied`);
      assert.equal(c.domain, COOKIE_DOMAIN, `${host}: ${c.name} must be cleared on the shared domain`);
      assert.equal(c.maxAge, 0, `${host}: ${c.name} must expire immediately`);
    }
    assert.match(res.headers.getSetCookie().join("\n"), /Domain=\.bcn-services\.com/);
  }
});

test("sign-out: every chunk of the session cookie is cleared, an unrelated cookie is not touched", async () => {
  const res = await signOutVia("sb.bcn-services.com", 3, ["theme=dark"]);
  const cleared = new Map(res.cookies.getAll().map((c) => [c.name, c]));
  for (const name of [`${KEY}.0`, `${KEY}.1`, `${KEY}.2`]) {
    const c = cleared.get(name);
    assert.ok(c, `chunk ${name} was not cleared`);
    assert.equal(c.value, "", `chunk ${name} must be emptied`);
  }
  assert.equal(cleared.has("theme"), false, "an unrelated cookie must be left alone");
});
