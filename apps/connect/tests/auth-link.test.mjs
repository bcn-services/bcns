/**
 * Invite + password-reset decisions, with a fake supabase: no network.
 * The route and pages are thin wrappers over these functions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  MIN_PASSWORD_LENGTH,
  confirmTarget,
  requestResetTarget,
  safeNext,
  setPasswordGuard,
  setPasswordTarget,
} from "../lib/auth-link.ts";
import { CONNECT_PUBLIC_ROUTES } from "../../../packages/tenant/src/middleware.ts";

const otp = (error = null) => {
  const calls = [];
  return { calls, auth: { verifyOtp: async (p) => (calls.push(p), { error }) } };
};

test("safeNext refuses every off-origin shape", () => {
  for (const bad of [
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/%2Fevil.com",
    "/%5Cevil.com",
    "/%2f%2fevil.com",
    "/\t/evil.com",
    "/%09/evil.com",
    "evil.com",
    "",
    null,
    undefined,
    "/%E0%A4%A",
  ]) {
    assert.equal(safeNext(bad), null, String(bad));
  }
  assert.equal(safeNext("/team"), "/team");
  assert.equal(safeNext("/data?x=1"), "/data?x=1");
});

test("type=email honors a safe next and drops an unsafe one", async () => {
  assert.equal(await confirmTarget(otp(), { token_hash: "h", type: "email", next: "/team" }), "/team");
  for (const next of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:x", "/%2Fevil.com"]) {
    assert.equal(await confirmTarget(otp(), { token_hash: "h", type: "email", next }), "/", next);
  }
});

test("invite and recovery end on /set-password whatever next says", async () => {
  for (const type of ["invite", "recovery"]) {
    const s = otp();
    assert.equal(await confirmTarget(s, { token_hash: "h", type, next: "https://evil.com" }), "/set-password");
    assert.deepEqual(s.calls, [{ token_hash: "h", type }]);
  }
});

test("expired, used or invalid token goes to /login?error=link-expired", async () => {
  assert.equal(await confirmTarget(otp({ message: "Token has expired" }), { token_hash: "h", type: "invite" }), "/login?error=link-expired");
  const throwing = { auth: { verifyOtp: async () => { throw new Error("boom"); } } };
  assert.equal(await confirmTarget(throwing, { token_hash: "h", type: "recovery" }), "/login?error=link-expired");
});

test("missing token, unsupported type or no client never reach verifyOtp", async () => {
  const s = otp();
  for (const p of [{ type: "invite" }, { token_hash: "h" }, { token_hash: "h", type: "magiclink" }, { token_hash: "h", type: "signup" }]) {
    assert.equal(await confirmTarget(s, p), "/login?error=link-expired");
  }
  assert.equal(await confirmTarget(null, { token_hash: "h", type: "invite" }), "/login?error=link-expired");
  assert.equal(s.calls.length, 0);
});

test("forgot-password answers identically for known, unknown, erroring and throwing", async () => {
  const known = { auth: { resetPasswordForEmail: async () => ({ data: {}, error: null }) } };
  const unknown = { auth: { resetPasswordForEmail: async () => ({ data: null, error: { message: "User not found" } }) } };
  const throwing = { auth: { resetPasswordForEmail: async () => { throw new Error("smtp down"); } } };
  const results = await Promise.all(
    [known, unknown, throwing, null].map((s) => requestResetTarget(s, "a@b.co", "https://h/auth/confirm"))
  );
  assert.deepEqual(new Set(results), new Set(["/login?ok=reset-sent"]));
  assert.equal(await requestResetTarget(known, "", "x"), "/login?ok=reset-sent");
});

test("forgot-password passes the trimmed email and redirectTo", async () => {
  const seen = [];
  const s = { auth: { resetPasswordForEmail: async (e, o) => (seen.push([e, o]), {}) } };
  await requestResetTarget(s, "  a@b.co ", "https://h/auth/confirm");
  assert.deepEqual(seen, [["a@b.co", { redirectTo: "https://h/auth/confirm" }]]);
});

const user = (signedIn, updateError = null, signOutThrows = false) => {
  const updates = [];
  const signOuts = [];
  return {
    updates,
    signOuts,
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: "u" } : null } }),
      updateUser: async (a) => (updates.push(a), { error: updateError }),
      signOut: async (o) => (signOuts.push(o), signOutThrows ? Promise.reject(new Error("x")) : {}),
    },
  };
};
const GOOD = "x".repeat(MIN_PASSWORD_LENGTH);

test("/set-password signed out goes to /login and never updates", async () => {
  const s = user(false);
  assert.equal(await setPasswordGuard(s), "/login?error=signed-out");
  assert.equal(await setPasswordTarget(s, GOOD, GOOD), "/login?error=signed-out");
  assert.equal(s.updates.length, 0);
  assert.equal(await setPasswordGuard(user(true)), null);
});

test("set-password: mismatch and short go back with an error, success goes to /", async () => {
  const a = user(true);
  assert.equal(await setPasswordTarget(a, GOOD, GOOD + "y"), "/set-password?error=mismatch");
  assert.equal(await setPasswordTarget(a, "short", "short"), "/set-password?error=short");
  assert.equal(a.updates.length, 0);
  assert.equal(await setPasswordTarget(a, GOOD, GOOD), "/");
  assert.deepEqual(a.updates, [{ password: GOOD }]);
  assert.equal(await setPasswordTarget(user(true, { message: "weak" }), GOOD, GOOD), "/set-password?error=failed");
});

test("the platform min length is not below config.toml's", () => {
  const toml = readFileSync(new URL("../../../platform/supabase/config.toml", import.meta.url), "utf8");
  const min = Number(toml.match(/^minimum_password_length\s*=\s*(\d+)/m)[1]);
  assert.ok(MIN_PASSWORD_LENGTH >= min);
});

test("a successful password change signs out other sessions; nothing else does", async () => {
  const ok = user(true);
  assert.equal(await setPasswordTarget(ok, GOOD, GOOD), "/");
  assert.deepEqual(ok.signOuts, [{ scope: "others" }]);
  for (const [s, p, c] of [
    [user(false), GOOD, GOOD],
    [user(true), GOOD, GOOD + "y"],
    [user(true), "short", "short"],
    [user(true, { message: "weak" }), GOOD, GOOD],
  ]) {
    await setPasswordTarget(s, p, c);
    assert.equal(s.signOuts.length, 0);
  }
  assert.equal(await setPasswordTarget(user(true, null, true), GOOD, GOOD), "/", "a signOut failure is swallowed");
});

test("the minimum password length is 8: 7 chars is short, 8 reaches updateUser", async () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  const a = user(true);
  assert.equal(await setPasswordTarget(a, "1234567", "1234567"), "/set-password?error=short");
  assert.equal(a.updates.length, 0);
  assert.equal(await setPasswordTarget(a, "12345678", "12345678"), "/");
  assert.deepEqual(a.updates, [{ password: "12345678" }]);
});

test("invite redirect, confirm route, reset redirectTo and the public allowlist agree", () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const handler = read("../../../platform/supabase/functions/invite-member/handler.ts");
  const invite = handler.match(/INVITE_REDIRECT\s*=\s*"([^"]+)"/)[1];
  assert.equal(new URL(invite).pathname, "/auth/confirm");
  assert.ok(existsSync(new URL("../app/auth/confirm/route.ts", import.meta.url)));
  assert.ok(read("../app/login/actions.ts").includes("/auth/confirm"));
  assert.ok(CONNECT_PUBLIC_ROUTES.includes("auth/confirm$"), "tenant allowlist");
  assert.ok(read("../middleware.ts").includes("auth/confirm$|"), "connect matcher literal");
});
