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

const { signInWithPassword } = await import("../app/login/actions.ts");
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
function fakeSupabase({ login = "ok", profile = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(`${init.method ?? "GET"} ${new URL(u).pathname}`);
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (u.includes("/auth/v1/token")) {
      return login === "ok"
        ? json(200, TOKEN)
        : json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    if (u.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
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
async function run(email = "staff@example.test", password = "pw") {
  const jar = new Map();
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value) => void jar.set(name, value),
  };
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  let to = null;
  try {
    await requestAsyncStorage.run(
      { cookies, mutableCookies: cookies, headers: new Headers() },
      () => signInWithPassword(form)
    );
  } catch (e) {
    // next/navigation redirect() throws NEXT_REDIRECT;<type>;<url>;<status>;
    if (typeof e?.digest !== "string" || !e.digest.startsWith("NEXT_REDIRECT;")) throw e;
    to = e.digest.split(";")[2];
  }
  return { to, jar };
}

test("signInWithPassword: good password + profiles row -> redirect /, session cookie set", async () => {
  const calls = fakeSupabase();
  const { to, jar } = await run();
  assert.equal(to, "/");
  assert.ok(
    [...jar.keys()].some((k) => k.startsWith("sb-hq-test-auth-token")),
    "session cookie written"
  );
  assert.ok(calls.some((c) => c.includes("/rest/v1/profiles")));
  assert.ok(!calls.some((c) => c.includes("/logout")), "not signed out");
});

test("signInWithPassword: good password but NO profiles row -> signs out, /login?error=no-profile", async () => {
  const calls = fakeSupabase({ profile: false });
  const { to } = await run();
  assert.equal(to, "/login?error=no-profile");
  assert.ok(
    calls.some((c) => c.endsWith("/auth/v1/logout")),
    "signOut hit GoTrue /logout"
  );
});

test("signInWithPassword: bad password -> /login?error=invalid, profiles never read", async () => {
  const calls = fakeSupabase({ login: "bad" });
  const { to, jar } = await run("staff@example.test", "wrong");
  assert.equal(to, "/login?error=invalid");
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
  assert.equal(new URL(res.headers.get("location")).pathname, "/login");
  const set = res.headers.getSetCookie();
  assert.equal(set.length, 1, "only the sb-* cookie is touched");
  assert.match(set[0], /^sb-hq-test-auth-token=; Path=\/; Max-Age=0/);
});
