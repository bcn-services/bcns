/**
 * Shared-platform mode is the only mode (platform-v1, superseding bcns-data
 * DESIGN.md §8's own/shared switch).
 *  - config: no `dataSource` field — there is nothing to switch
 *  - build gate: scripts/check-env.ts rejects a service-role key, from the
 *    shell env or a .env file, whenever the platform is configured
 *  - health: evaluateSharedHealth branches (no network; probe injected)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../lib/env.ts";
import { evaluateSharedHealth } from "../lib/shared-health.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("config: no dataSource switch — shared mode is the only mode", () => {
  assert.equal("dataSource" in getConfig(), false, "AppConfig must not carry an own/shared switch");
});

// Runs the gate in an empty temp cwd so the repo's own .env files never leak in.
function checkEnv(env, envFile) {
  const cwd = mkdtempSync(join(tmpdir(), "check-env-"));
  try {
    if (envFile) writeFileSync(join(cwd, ".env.local"), envFile);
    const clean = { PATH: process.env.PATH, HOME: process.env.HOME, ...env };
    return spawnSync(join(root, "node_modules/.bin/tsx"), [join(root, "scripts/check-env.ts")], {
      cwd,
      env: clean,
      encoding: "utf8",
    }).status;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const PLATFORM = { NEXT_PUBLIC_SUPABASE_URL: "https://platform.supabase.co" };

test("build gate: a service key in the shell env fails", () => {
  assert.equal(checkEnv({ ...PLATFORM, SUPABASE_SERVICE_ROLE_KEY: "x" }), 1);
});

test("build gate: a service key in .env.local is caught too", () => {
  assert.equal(
    checkEnv({}, `NEXT_PUBLIC_SUPABASE_URL=${PLATFORM.NEXT_PUBLIC_SUPABASE_URL}\nSUPABASE_SERVICE_ROLE_KEY=x\n`),
    1,
  );
});

test("build gate: a keyless build ignores an unrelated service key in the shell", () => {
  // No NEXT_PUBLIC_SUPABASE_URL = nothing to bypass RLS on. Failing here would
  // block `pnpm build` on any dev machine that exports a service key for
  // something else entirely.
  assert.equal(checkEnv({ SUPABASE_SERVICE_ROLE_KEY: "x" }), 0);
});

test("build gate: no service key passes", () => {
  assert.equal(checkEnv({ ...PLATFORM }), 0);
});

const base = {
  aiEnabled: false,
  supabaseUrl: "http://platform.test",
  supabaseAnonKey: "anon",
  expectedClientId: "a0000000-0000-4000-8000-000000000001",
  healthEmail: "smoke+sb@bcn-services.com",
  healthPassword: "pw",
  hasServiceRoleKey: false,
};
const okProbe = async () => {};
const failProbe = async () => {
  throw new Error("boom");
};

test("health: keyless run is ok/unconfigured and never probes", async () => {
  let called = false;
  const r = await evaluateSharedHealth({ aiEnabled: false, hasServiceRoleKey: false }, async () => {
    called = true;
  });
  assert.deepEqual(r, { ok: true, platform: "unconfigured" });
  assert.equal(called, false);
});

test("health: platform configured but no tenant pin fails (mirrors pinOrDeny; /api/health is outside the middleware)", async () => {
  let called = false;
  const r = await evaluateSharedHealth({ ...base, expectedClientId: undefined }, async () => {
    called = true;
  });
  assert.deepEqual(r, { ok: false, platform: "error", reason: "tenant_pin_missing" });
  assert.equal(called, false);
  const blank = await evaluateSharedHealth({ ...base, expectedClientId: "  " }, okProbe);
  assert.equal(blank.reason, "tenant_pin_missing");
});

test("health: platform configured but no probe login is a failure", async () => {
  const r = await evaluateSharedHealth({ ...base, healthPassword: undefined }, okProbe);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "health_login_missing");
});

test("health: service key present fails even if the probe would pass", async () => {
  const r = await evaluateSharedHealth({ ...base, hasServiceRoleKey: true }, okProbe);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "service_key_present");
});

test("health: probe passes -> connected; probe throws -> probe_failed", async () => {
  const seen = [];
  const r = await evaluateSharedHealth(base, async (c) => void seen.push(c));
  assert.deepEqual(r, { ok: true, platform: "connected" });
  assert.deepEqual(seen[0], { supabaseUrl: "http://platform.test", anonKey: "anon", email: base.healthEmail, password: "pw" });
  const bad = await evaluateSharedHealth(base, failProbe);
  assert.deepEqual(bad, { ok: false, platform: "error", reason: "probe_failed" });
});
