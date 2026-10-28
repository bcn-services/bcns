/**
 * login-action.test.mjs — the signInWithPassword server action, run through the REAL action and
 * the real @supabase/ssr client; only fetch (Supabase HTTP) and the Next request store are faked.
 * (The local CLI stack has the email provider off, so a real password login can't be done there.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

// Next's node server installs this global; the request store reads it at import.
globalThis.AsyncLocalStorage = AsyncLocalStorage;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://hq-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";

const { signInWithPassword, requestPasswordReset } = await import("../app/login/actions.ts");
const { setNewPassword } = await import("../app/reset/actions.ts");
const { POST: signOut } = await import("../app/signout/route.ts");
const { NextRequest } = await import("next/server");
const { requestAsyncStorage } =
  await import("next/dist/client/components/request-async-storage.external.js");

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "staff@example.test",
};
const TOKEN = {
  access_token: "a.b.c",
  refresh_token: "r",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user: USER,
};

/** Fake Supabase HTTP; records calls and whether /logout was hit. */
function fakeSupabase({ login = "ok", profile = true, recover = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(`${init.method ?? "GET"} ${new URL(u).pathname}`);
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (u.includes("/auth/v1/token") && u.includes("pkce")) {
      return login === "expired" ? json(400, { error: "invalid_grant" }) : json(200, TOKEN);
    }
    if (u.includes("/auth/v1/token") && login === "rate")
      return json(429, { error_code: "over_request_rate_limit", msg: "Request rate limit reached" });
    if (u.includes("/auth/v1/token")) {
      return login === "ok"
        ? json(200, TOKEN)
        : json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    if (u.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    if (u.includes("/auth/v1/recover"))
      return recover === 200 ? json(200, {}) : json(recover, { error_code: "over_email_send_rate_limit", msg: "rate" });
    if (u.includes("/auth/v1/user")) return json(200, USER);
    if (u.includes("/rest/v1/profiles")) {
      return profile
        ? json(200, { id: USER.id })
        : json(406, {
            code: "PGRST116",
            message: "The result contains 0 rows",
            details: null,
            hint: null,
          });
    }
    throw new Error("unexpected fetch " + u);
  };
  return calls;
}

/** Runs the action inside a fake Next request scope; resolves to the redirect target (or null). */
async function run(email = "staff@example.test", password = "pw", action = signInWithPassword, extra = {}, jar = new Map()) {
  const opts = new Map(); // cookie name -> the options the app set it with
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value, o) => void (jar.set(name, value), opts.set(name, o)),
  };
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  let to = null;
  try {
    await requestAsyncStorage.run(
      { cookies, mutableCookies: cookies, headers: new Headers({ host: "hq.example.test", "x-forwarded-proto": "https" }) },
      () => action(form)
    );
  } catch (e) {
    // next/navigation redirect() throws NEXT_REDIRECT;<type>;<url>;<status>;
    if (typeof e?.digest !== "string" || !e.digest.startsWith("NEXT_REDIRECT;")) throw e;
    to = e.digest.split(";")[2];
  }
  return { to, jar, opts };
}

test("signInWithPassword: good password + profiles row -> redirect /, session cookie set", async () => {
  const calls = fakeSupabase();
  const { to, jar, opts } = await run();
  assert.equal(to, "/");
  const name = [...jar.keys()].find((k) => k.startsWith("sb-hq-test-auth-token"));
  assert.ok(name, "session cookie written");
  assert.equal(opts.get(name).maxAge, 2592000, "30-day session, not @supabase/ssr's 400 days");
  assert.equal(opts.get(name).httpOnly, true);
  assert.ok(calls.some((c) => c.includes("/rest/v1/profiles")));
  assert.ok(!calls.some((c) => c.includes("/logout")), "not signed out");
});

test("signInWithPassword: good password but NO profiles row -> signs out, names the email", async () => {
  const calls = fakeSupabase({ profile: false });
  const { to } = await run();
  assert.equal(to, "/login?error=no-profile&email=staff%40example.test");
  assert.ok(
    calls.some((c) => c.endsWith("/auth/v1/logout")),
    "signOut hit GoTrue /logout"
  );
});

test("signInWithPassword: bad password -> error=invalid with the email, profiles never read", async () => {
  const calls = fakeSupabase({ login: "bad" });
  const { to, jar } = await run("  staff@example.test ", "wrong");
  assert.equal(to, "/login?error=invalid&email=staff%40example.test");
  assert.ok(!calls.some((c) => c.includes("/rest/v1/profiles")));
  assert.equal(jar.size, 0, "no session cookie");
});

test("signInWithPassword: Supabase env unset -> /login?error=unconfigured", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    fakeSupabase();
    assert.equal((await run()).to, "/login?error=unconfigured");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
});

test("signInWithPassword: GoTrue 5xx is 'failed', not a wrong-password claim", async () => {
  fakeSupabase();
  const fetch200 = globalThis.fetch;
  globalThis.fetch = async (url, init) =>
    String(url).includes("/auth/v1/token")
      ? new Response(JSON.stringify({ msg: "down" }), { status: 503, headers: { "content-type": "application/json" } })
      : fetch200(url, init);
  assert.equal((await run()).to, "/login?error=failed&email=staff%40example.test");
});

test("signInWithPassword: GoTrue 429 is its own 'rate' message, not wrong-password", async () => {
  fakeSupabase({ login: "rate" });
  assert.equal((await run()).to, "/login?error=rate&email=staff%40example.test");
});

test("requestPasswordReset: a 4xx (unknown email, or 429 send limit on a real one) still lands on sent; only 5xx and network failures say failed", async () => {
  for (const recover of [200, 400, 422, 429]) {
    fakeSupabase({ recover });
    assert.equal((await run("staff@example.test", "", requestPasswordReset)).to, "/login?mode=forgot&sent=1&email=staff%40example.test", String(recover));
  }
  fakeSupabase({ recover: 503 });
  assert.equal((await run("staff@example.test", "", requestPasswordReset)).to, "/login?mode=forgot&error=failed&email=staff%40example.test");
  fakeSupabase();
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal((await run("staff@example.test", "", requestPasswordReset)).to, "/login?mode=forgot&error=failed&email=staff%40example.test");
});

test("login page source: errors name the email, forgot link, no reset mode", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(src, /`wrong password for \$\{email\}`/);
  assert.match(src, /`no HQ account for \$\{email\}`/);
  assert.match(src, /unconfigured: "HQ is not configured"/);
  assert.match(src, /`too many tries for \$\{email\}, wait a minute`/);
  // the email query param is echoed only when it is a plain address (no spaces, no angle brackets), else dropped
  assert.match(src, /\^\[\^\\s@<>\]\+@/);
  assert.match(src, /const who = email \|\| "that email"/);
  assert.match(src, /same browser you request it from/);
  assert.match(src, /href="\/login\?mode=forgot"/);
  assert.doesNotMatch(src, /setNewPassword|mode=reset/);
  const reset = readFileSync(new URL("../app/reset/page.tsx", import.meta.url), "utf8");
  assert.match(reset, /searchParams\.code \? \(/);
  assert.match(reset, /action=\{setNewPassword\}/);
});

test("requestPasswordReset: asks GoTrue to recover, redirectTo is the public /reset, lands on sent", async () => {
  const calls = fakeSupabase();
  const bodies = [];
  const f = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/auth/v1/recover")) bodies.push(String(url) + " " + String(init?.body));
    return f(url, init);
  };
  const { to } = await run("staff@example.test", "", requestPasswordReset);
  assert.equal(to, "/login?mode=forgot&sent=1&email=staff%40example.test");
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /redirect_to=https%3A%2F%2Fhq\.example\.test%2Freset(&|\s|$)/);
  assert.ok(calls.some((c) => c.includes("/auth/v1/recover")));
});

test("setNewPassword: short or mismatched password never spends the code; good one exchanges, updates, enters", async () => {
  const calls = fakeSupabase();
  // the PKCE verifier lives in the cookie jar that requested the reset email
  const { jar } = await run("staff@example.test", "", requestPasswordReset);
  const go = (password, confirm) => run("", password, setNewPassword, { code: "abc", confirm }, jar);
  assert.equal((await go("short", "short")).to, "/reset?code=abc&error=weak");
  assert.equal((await go("longenough1", "different1")).to, "/reset?code=abc&error=mismatch");
  assert.ok(!calls.some((c) => c.includes("/auth/v1/token")), "code untouched");
  assert.equal((await go("longenough1", "longenough1")).to, "/");
  assert.ok(calls.some((c) => c.includes("/auth/v1/token")) && calls.some((c) => c.startsWith("PUT") && c.includes("/auth/v1/user")));
  fakeSupabase({ login: "expired" }); // GoTrue refuses the code (used or past its hour)
  const again = await run("staff@example.test", "", requestPasswordReset);
  const goAgain = () => run("", "longenough1", setNewPassword, { code: "abc", confirm: "longenough1" }, again.jar);
  assert.equal((await goAgain()).to, "/login?mode=forgot&error=expired");
});

test("POST /signout: Supabase logout fails (5xx) -> still 303 /login with every sb-* cookie expired", async () => {
  const cookie =
    "sb-hq-test-auth-token=base64-" + Buffer.from(JSON.stringify(TOKEN)).toString("base64url");
  globalThis.fetch = async () =>
    new Response("{}", { status: 500, headers: { "content-type": "application/json" } });
  const request = new NextRequest("http://localhost:3105/signout", {
    method: "POST",
    headers: { cookie: `${cookie}; other=keep` },
  });
  const jar = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value) => void jar.set(name, value),
  };
  const res = await requestAsyncStorage.run(
    { cookies, mutableCookies: cookies, headers: new Headers() },
    () => signOut(request)
  );
  assert.equal(res.status, 303);
  assert.equal(new URL(res.headers.get("location"), "http://localhost").pathname, "/login");
  const set = res.headers.getSetCookie();
  assert.equal(set.length, 1, "only the sb-* cookie is touched");
  assert.match(set[0], /^sb-hq-test-auth-token=; Path=\/;/);
  assert.match(set[0], /Max-Age=0/);
  assert.match(set[0], /Expires=Thu, 01 Jan 1970/); // item-3: Next re-serializes and drops Max-Age alone
});
