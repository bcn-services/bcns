/**
 * Self-service sign-up (P1) on the hub: the SIGNUP_ENABLED switch (off = /signup 404 and the
 * login page byte-identical apart from the gated link), the form → Edge Function mapping, the
 * one notice to bcns on a confirmed pending sign-up, and /api/oauth/shopify/finish refusing a
 * pending session through its existing currentMembership() gate (route not edited).
 * No network: fetch is stubbed, the session comes from a crafted cookie.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
// session.ts wraps loaders in React's server-only cache(); absent outside Next.
const react = require("react");
react.cache ??= (fn) => fn;
// tsx reads the tsconfig's `jsx: preserve` as classic React.createElement (see app/nav.tsx);
// a global React renders the pages as they are, without a pragma edit to login/page.tsx.
globalThis.React = react;
// next/headers' request store is an AsyncLocalStorage Next normally installs on globalThis.
globalThis.AsyncLocalStorage ??= require("node:async_hooks").AsyncLocalStorage;
const { NextRequest } = await import("next/server");
const { requestAsyncStorage } = require("next/dist/client/components/request-async-storage.external.js");

const { signupTarget, notifySignupConfirmed, signupNotice, SIGNUP_SENT_PATH } = await import("../lib/signup.ts");
const { BCNS_EMAIL } = await import("../lib/request-connection.ts");
const { FINISH_PATH, PENDING_COOKIE, sealPending, INSTALL_CLIENT_ID } = await import("../lib/shopify-oauth.ts");

const HUB = "https://connect.bcn-services.com";
const PROJECT_REF = "abcdefghijklmnopqrst";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER = { id: USER_ID, email: "owner@acme.example", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", email_confirmed_at: new Date().toISOString() };
const FORM = { name: "Acme Bakery", email: "owner@acme.example", password: "correct-horse" };

const ENV_KEYS = ["SIGNUP_ENABLED", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "OAUTH_APPROVED_SOURCES", "HUB_BASE_URL"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const savedFetch = globalThis.fetch;
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  globalThis.fetch = savedFetch;
});

const b64url = (v) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
const token = (claims) => `header.${b64url({ sub: USER_ID, email: USER.email, exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.signature`;
/** The cookie @supabase/ssr writes for a live session. */
const sessionCookie = (claims) =>
  `sb-${PROJECT_REF}-auth-token=base64-${b64url({ access_token: token(claims), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER })}`;

/** A stand-in for the bits of SupabaseClient the notice touches. */
const stubSupabase = (claims) => ({
  auth: {
    getUser: async () => ({ data: { user: claims ? USER : null }, error: null }),
    getSession: async () => ({ data: { session: claims ? { access_token: token(claims) } : null }, error: null }),
  },
});

const isNotFound = (error) => error?.digest === "NEXT_NOT_FOUND" || error?.message === "NEXT_NOT_FOUND";

/* ---------------------------------------------------------------- the switch */

test("switch off: /signup is a 404, its action is a 404, and /login has no Create account link", async () => {
  delete process.env.SIGNUP_ENABLED;
  const { default: SignupPage } = await import("../app/signup/page.tsx");
  const { signUp } = await import("../app/signup/actions.ts");
  const { default: LoginPage } = await import("../app/login/page.tsx");
  assert.throws(() => SignupPage({ searchParams: {} }), isNotFound);
  await assert.rejects(signUp(new FormData()), isNotFound);
  for (const searchParams of [{}, { next: FINISH_PATH }, { error: "invalid" }]) {
    const html = renderToStaticMarkup(createElement(LoginPage, { searchParams }));
    assert.doesNotMatch(html, /signup|Create account/, JSON.stringify(searchParams));
  }
  process.env.SIGNUP_ENABLED = "yes"; // anything but 1/true stays off
  assert.throws(() => SignupPage({ searchParams: {} }), isNotFound);
});

test("switch on vs off: the login page (plain and Shopify finish) differs ONLY by the gated link", async () => {
  const { default: LoginPage } = await import("../app/login/page.tsx");
  const LINK = /<a href="\/signup"[^>]*>Create account<\/a>/;
  for (const searchParams of [{}, { next: FINISH_PATH }, { ok: "reset-sent" }, { forgot: "1" }]) {
    delete process.env.SIGNUP_ENABLED;
    const off = renderToStaticMarkup(createElement(LoginPage, { searchParams }));
    process.env.SIGNUP_ENABLED = "1";
    const on = renderToStaticMarkup(createElement(LoginPage, { searchParams }));
    if (searchParams.forgot) assert.equal(on, off, "the reset form never shows the link");
    else {
      assert.match(on, LINK, JSON.stringify(searchParams));
      assert.equal(on.replace(LINK, ""), off, JSON.stringify(searchParams));
    }
  }
});

test("switch on: /signup renders the form (business name, email, password >= 8)", async () => {
  process.env.SIGNUP_ENABLED = "true";
  const { default: SignupPage } = await import("../app/signup/page.tsx");
  const html = renderToStaticMarkup(SignupPage({ searchParams: {} }));
  for (const name of ["name", "email", "password"]) assert.match(html, new RegExp(`name="${name}"`));
  assert.match(html, /minLength="8"/);
  assert.match(renderToStaticMarkup(SignupPage({ searchParams: { ok: "check-email" } })), /Check your email/);
});

/* -------------------------------------------------------- form → function */

test("signupTarget: posts to the signup function and maps every answer onto one redirect", async () => {
  const calls = [];
  const fetchWith = (status) => async (url, init) => (calls.push({ url, init }), new Response("{}", { status }));
  const deps = { supabaseUrl: `${SUPABASE_URL}/`, supabaseAnonKey: "anon" };
  assert.equal(await signupTarget(FORM, { ...deps, fetchImpl: fetchWith(200) }), SIGNUP_SENT_PATH);
  assert.equal(calls[0].url, `${SUPABASE_URL}/functions/v1/signup`);
  assert.equal(calls[0].init.headers.apikey, "anon");
  assert.deepEqual(JSON.parse(calls[0].init.body), FORM);
  assert.equal(await signupTarget(FORM, { ...deps, fetchImpl: fetchWith(400) }), "/signup?error=invalid");
  assert.equal(await signupTarget(FORM, { ...deps, fetchImpl: fetchWith(502) }), "/signup?error=failed");
  assert.equal(await signupTarget(FORM, { ...deps, fetchImpl: async () => { throw new Error("down"); } }), "/signup?error=failed");
  calls.length = 0;
  assert.equal(await signupTarget({ ...FORM, password: "1234567" }, { ...deps, fetchImpl: fetchWith(200) }), "/signup?error=short");
  assert.equal(await signupTarget({ ...FORM, name: "  " }, { ...deps, fetchImpl: fetchWith(200) }), "/signup?error=invalid");
  assert.equal(calls.length, 0, "a locally invalid form never reaches the function");
  assert.equal(await signupTarget(FORM, {}), "/signup?error=unconfigured");
});

/* ------------------------------------------------------------- the notice */

test("notifySignupConfirmed: one mail to BCNS_EMAIL for a pending sign-up, none for a member or nobody", async () => {
  const sent = [];
  const deps = { apiKey: "re_test", fetchImpl: async (_url, init) => (sent.push(JSON.parse(init.body)), new Response("{}", { status: 200 })), log: () => {} };
  assert.equal(await notifySignupConfirmed(stubSupabase({ client_status: "pending" }), deps), true);
  assert.deepEqual(sent, [signupNotice(USER.email)]);
  assert.deepEqual(sent[0].to, [BCNS_EMAIL]);
  assert.match(sent[0].text, /activate-client\.ts --slug/);
  assert.equal(await notifySignupConfirmed(stubSupabase({ client_id: "c", client_role: "owner" }), deps), false);
  assert.equal(await notifySignupConfirmed(stubSupabase(null), deps), false);
  assert.equal(await notifySignupConfirmed(null, deps), false);
  assert.equal(sent.length, 1);
});

/* ------------------------------------------- finish refuses a pending session */

/** Run a route handler inside the request store next/headers reads cookies() from. */
function inRequest(request, fn) {
  return requestAsyncStorage.run(
    { headers: request.headers, cookies: request.cookies, mutableCookies: request.cookies, draftMode: {} },
    fn
  );
}

test("finish: a signed-in PENDING session is refused like signed-out (to /login, hand-off kept); a member gets past that gate", async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SHOPIFY_CLIENT_ID: "cid",
    SHOPIFY_CLIENT_SECRET: "shpss_finish",
    OAUTH_APPROVED_SOURCES: "shopify",
    HUB_BASE_URL: HUB,
  });
  const authCalls = [];
  globalThis.fetch = async (input) => {
    const url = String(input?.url ?? input);
    authCalls.push(url);
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify(USER), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const { GET } = await import("../app/api/oauth/shopify/finish/route.ts");
  const sealed = sealPending({ clientId: INSTALL_CLIENT_ID, shop: "acme.myshopify.com", accessToken: "shpat_x", refreshToken: "shprt_y", expiresAt: "2026-09-21T01:00:00.000Z", storeHandle: null }, "shpss_finish");
  const finish = (claims) => {
    const request = new NextRequest(`${HUB}${FINISH_PATH}`, { headers: { host: "connect.bcn-services.com", cookie: `${PENDING_COOKIE}=${sealed}; ${sessionCookie(claims)}` } });
    return inRequest(request, () => GET(request));
  };

  const pending = await finish({ client_status: "pending" });
  assert.ok(authCalls.some((u) => u.includes("/auth/v1/user")), "the pending session was really verified, not read as signed out");
  assert.equal(pending.headers.get("location"), `${HUB}/login?next=${encodeURIComponent(FINISH_PATH)}`);
  assert.equal(pending.cookies.get(PENDING_COOKIE), undefined, "nothing consumed: the hand-off cookie is untouched");

  // Contrast: a real owner session passes currentMembership() and reaches the next gate.
  const owner = await finish({ client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc", client_role: "owner" });
  assert.notEqual(owner.headers.get("location"), `${HUB}/login?next=${encodeURIComponent(FINISH_PATH)}`);
});
