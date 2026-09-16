/**
 * middleware.test.mjs — tenantMiddleware routing, against a real
 * @supabase/ssr client whose session comes from a crafted request cookie and
 * whose auth-server calls are answered by a stubbed global fetch. No network.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { tenantMiddleware, TENANT_MATCHER } from "../src/middleware.ts";

const PROJECT_REF = "abcdefghijklmnopqrst";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const USER_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTHER_CLIENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const b64url = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const USER = {
  id: USER_ID,
  email: "owner@example.com",
  aud: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

/** The cookie @supabase/ssr would have written for a live session. */
function sessionCookie(claims) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `header.${b64url({ sub: USER_ID, email: USER.email, exp, ...claims })}.signature`,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: USER,
  };
  return `${STORAGE_KEY}=base64-${b64url(session)}`;
}

function request(path, { cookie, host = "sb.bcn-services.com" } = {}) {
  const headers = { host };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`https://${host}${path}`, { headers });
}

let calls = [];
let savedFetch;

beforeEach(() => {
  calls = [];
  savedFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input?.url ?? input);
    calls.push(url);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify(USER), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test("env unset: every request passes through untouched", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const response = await tenantMiddleware()(request("/dashboard"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(calls, [], "no auth call without env");
});

test("signed out: redirected to the login path", async () => {
  const response = await tenantMiddleware()(request("/dashboard"));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")).pathname, "/login");
  assert.equal(new URL(response.headers.get("location")).search, "");
});

test("signed out: the login path itself always passes through", async () => {
  const response = await tenantMiddleware()(request("/login"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("a custom loginPath is used for both the redirect and the pass-through", async () => {
  const mw = tenantMiddleware({ loginPath: "/sign-in" });
  const redirect = await mw(request("/dashboard"));
  assert.equal(new URL(redirect.headers.get("location")).pathname, "/sign-in");
  assert.equal((await mw(request("/sign-in"))).status, 200);
});

test("signed in without a membership claim: ?error=no-membership", async () => {
  const response = await tenantMiddleware()(request("/dashboard", { cookie: sessionCookie({}) }));
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "no-membership");
});

test("signed in to the pinned client: passes through", async () => {
  const cookie = sessionCookie({ client_id: CLIENT_ID, client_role: "owner" });
  const response = await tenantMiddleware({ expectedClientId: CLIENT_ID })(
    request("/dashboard", { cookie })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.ok(
    calls.some((url) => url.includes("/auth/v1/user")),
    "the token was verified with the auth server"
  );
});

test("signed in to another client: signed out and sent to ?error=wrong-client", async () => {
  const cookie = sessionCookie({ client_id: OTHER_CLIENT_ID, client_role: "owner" });
  const response = await tenantMiddleware({ expectedClientId: CLIENT_ID })(
    request("/dashboard", { cookie })
  );
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "wrong-client");
  assert.ok(
    calls.some((url) => url.includes("/auth/v1/logout")),
    "the wrong-client session was dropped"
  );
});

test("a redirect carries the cookies @supabase/ssr wrote on the response", async () => {
  // signOut() makes @supabase/ssr call setAll with the cleared auth cookie.
  // NextResponse.redirect() starts with empty headers, so the middleware has to
  // copy them over — otherwise the browser keeps the dead session and loops.
  const cookie = sessionCookie({ client_id: OTHER_CLIENT_ID, client_role: "owner" });
  const response = await tenantMiddleware({ expectedClientId: CLIENT_ID })(
    request("/dashboard", { cookie })
  );
  assert.equal(response.status, 307);
  const written = response.cookies.getAll();
  assert.ok(written.length >= 1, "the redirect must carry the Set-Cookie headers");
  assert.ok(
    written.some((c) => c.name.startsWith("sb-") && c.value === ""),
    `the cleared auth cookie must survive the redirect (got ${JSON.stringify(written)})`
  );
});

test("no membership: the stale session is signed out before the redirect", async () => {
  const response = await tenantMiddleware()(request("/dashboard", { cookie: sessionCookie({}) }));
  assert.equal(response.status, 307);
  assert.ok(
    calls.some((url) => url.includes("/auth/v1/logout")),
    "a session with no membership must be dropped, or it loops on every request"
  );
  assert.ok(response.cookies.getAll().length >= 1, "the clear must ride the redirect");
});

test("an unpinned app accepts any membership", async () => {
  const cookie = sessionCookie({ client_id: OTHER_CLIENT_ID, client_role: "member" });
  const response = await tenantMiddleware()(request("/dashboard", { cookie }));
  assert.equal(response.status, 200);
});

test("TENANT_MATCHER exempts the health route and static assets", () => {
  const pattern = new RegExp(`^${TENANT_MATCHER[0]}$`);
  for (const path of ["/api/health", "/_next/static/chunk.js", "/favicon.ico"]) {
    assert.equal(pattern.test(path), false, path);
  }
  for (const path of ["/", "/dashboard", "/api/health/deep"]) {
    assert.equal(pattern.test(path), true, path);
  }
});
