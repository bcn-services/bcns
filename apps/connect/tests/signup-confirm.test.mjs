/**
 * QA (P1): the real /auth/confirm route sends exactly one notice to BCNS_EMAIL for a confirmed
 * PENDING sign-up, and none for a recovery link, an active member's email link, a failed verify,
 * or with SIGNUP_ENABLED off. Drives the production route; GoTrue and Resend are stubbed fetches.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const react = require("react");
react.cache ??= (fn) => fn;
globalThis.AsyncLocalStorage ??= require("node:async_hooks").AsyncLocalStorage;
const { NextRequest } = await import("next/server");
const { requestAsyncStorage } = require("next/dist/client/components/request-async-storage.external.js");
const { BCNS_EMAIL } = await import("../lib/request-connection.ts");
const { GET } = await import("../app/auth/confirm/route.ts");

const HUB = "https://connect.bcn-services.com";
const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER = { id: USER_ID, email: "owner@acme.example", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const HOUR_AGO = new Date(Date.now() - 3600_000).toISOString();
const PENDING = { client_status: "pending" };
const MEMBER = { client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc", client_role: "owner" };

const ENV_KEYS = ["SIGNUP_ENABLED", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "RESEND_API_KEY", "HUB_BASE_URL"];
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
const jwt = (claims) => `header.${b64url({ sub: USER_ID, email: USER.email, exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.signature`;

/** GET /auth/confirm with GoTrue answering verify with a session carrying `claims` (null = verify fails). */
async function confirm({ type, claims, enabled = true, confirmedAt = new Date().toISOString() }) {
  const user = { ...USER, email_confirmed_at: confirmedAt };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", RESEND_API_KEY: "re_test", HUB_BASE_URL: HUB });
  if (enabled) process.env.SIGNUP_ENABLED = "1";
  else delete process.env.SIGNUP_ENABLED;
  const mails = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.includes("api.resend.com")) return mails.push(JSON.parse(init.body)), json({ id: "m" });
    if (url.includes("/auth/v1/verify")) {
      if (!claims) return json({ code: 403, error_code: "otp_expired", msg: "expired" }, 403);
      return json({ access_token: jwt(claims), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });
    }
    if (url.includes("/auth/v1/user")) return json(user);
    return json({});
  };
  const request = new NextRequest(`${HUB}/auth/confirm?token_hash=th_123&type=${type}`, { headers: { host: "connect.bcn-services.com" } });
  const response = await requestAsyncStorage.run(
    { headers: request.headers, cookies: request.cookies, mutableCookies: request.cookies, draftMode: {} },
    () => GET(request)
  );
  return { location: response.headers.get("location"), mails };
}

test("confirm route: a pending sign-up's email link sends exactly one notice to BCNS_EMAIL", async () => {
  const { location, mails } = await confirm({ type: "email", claims: PENDING });
  assert.equal(location, `${HUB}/`);
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, [BCNS_EMAIL]);
  assert.equal(mails[0].reply_to, USER.email);
});

test("confirm route: a pending user whose address was confirmed an hour ago (a later type=email verify) gets no notice", async () => {
  const { mails } = await confirm({ type: "email", claims: PENDING, confirmedAt: HOUR_AGO });
  assert.equal(mails.length, 0);
});

test("confirm route: no notice for recovery, an active member, a failed verify, or the switch off", async () => {
  for (const [label, args] of [
    ["recovery (pending)", { type: "recovery", claims: PENDING }],
    ["invite (pending)", { type: "invite", claims: PENDING }],
    ["email, active member", { type: "email", claims: MEMBER }],
    ["email, verify failed", { type: "email", claims: null }],
    ["email, switch off", { type: "email", claims: PENDING, enabled: false }],
  ]) {
    const { mails } = await confirm(args);
    assert.equal(mails.length, 0, label);
  }
});
