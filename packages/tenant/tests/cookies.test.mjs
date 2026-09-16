/**
 * cookies.test.mjs — the cookie-domain rule and the env reader.
 * Pure unit tests: no network, no Next runtime.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COOKIE_DOMAIN, cookieOptions, readTenantEnv } from "../src/cookies.ts";

test("cookieOptions: the apex and its subdomains get the shared parent domain", () => {
  for (const host of ["bcn-services.com", "sb.bcn-services.com", "connect.bcn-services.com"]) {
    assert.deepEqual(cookieOptions(host), {
      domain: COOKIE_DOMAIN,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  }
});

test("cookieOptions: a port and mixed case do not change the verdict", () => {
  assert.equal(cookieOptions("sb.bcn-services.com:3101").domain, COOKIE_DOMAIN);
  assert.equal(cookieOptions("SB.BCN-Services.com").domain, COOKIE_DOMAIN);
  assert.equal(cookieOptions("sb.bcn-services.com:3101").secure, true);
});

test("cookieOptions: localhost and previews get a host-only, non-secure cookie", () => {
  for (const host of ["localhost:3000", "localhost", "bcns-abc123.vercel.app", "127.0.0.1:3101"]) {
    assert.deepEqual(cookieOptions(host), { path: "/", sameSite: "lax", secure: false });
  }
});

test("cookieOptions: a missing host is treated as not-our-domain", () => {
  for (const host of [null, undefined, ""]) {
    assert.deepEqual(cookieOptions(host), { path: "/", sameSite: "lax", secure: false });
  }
});

test("cookieOptions: a lookalike host does not get our cookie", () => {
  // Suffix match must be on ".bcn-services.com", not "bcn-services.com".
  for (const host of ["evilbcn-services.com", "bcn-services.com.attacker.test"]) {
    assert.equal(cookieOptions(host).domain, undefined);
    assert.equal(cookieOptions(host).secure, false);
  }
});

function withEnv(values, fn) {
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const saved = keys.map((k) => [k, process.env[k]]);
  try {
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(values)) process.env[k] = v;
    return fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("readTenantEnv: both values present, trimmed", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "  https://ref.supabase.co \n",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "\tanon-key  ",
    },
    () =>
      assert.deepEqual(readTenantEnv(), {
        supabaseUrl: "https://ref.supabase.co",
        supabaseAnonKey: "anon-key",
      })
  );
});

test("readTenantEnv: unset, empty or whitespace-only reads as null", () => {
  withEnv({}, () => assert.equal(readTenantEnv(), null));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co" }, () =>
    assert.equal(readTenantEnv(), null)
  );
  withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "   " },
    () => assert.equal(readTenantEnv(), null)
  );
});

test("readTenantEnv reads at call time, not at import time", () => {
  withEnv({}, () => assert.equal(readTenantEnv(), null));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }, () =>
    assert.deepEqual(readTenantEnv(), { supabaseUrl: "u", supabaseAnonKey: "k" })
  );
});
