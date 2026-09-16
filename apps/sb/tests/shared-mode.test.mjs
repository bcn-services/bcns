/**
 * Shared-platform mode (DATA_SOURCE=shared, bcns-data DESIGN.md §8).
 *  - config: dataSource defaults to "own" (R38), "shared" only when asked
 *  - build gate: scripts/check-env.ts rejects a service-role key in shared mode,
 *    from the shell env or a .env file
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

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("config: dataSource defaults to own, 'shared' (any case) opts in", () => {
  withEnv({ DATA_SOURCE: undefined }, () => assert.equal(getConfig().dataSource, "own"));
  withEnv({ DATA_SOURCE: "SHARED" }, () => assert.equal(getConfig().dataSource, "shared"));
  withEnv({ DATA_SOURCE: "platform" }, () => assert.equal(getConfig().dataSource, "own"));
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

test("build gate: shared mode + service key fails", () => {
  assert.equal(checkEnv({ DATA_SOURCE: "shared", SUPABASE_SERVICE_ROLE_KEY: "x" }), 1);
});

test("build gate: service key in .env.local is caught too", () => {
  assert.equal(checkEnv({ DATA_SOURCE: "shared" }, "SUPABASE_SERVICE_ROLE_KEY=x\n"), 1);
});

test("build gate: shared without key, and own mode with key, both pass", () => {
  assert.equal(checkEnv({ DATA_SOURCE: "shared" }), 0);
  assert.equal(checkEnv({ SUPABASE_SERVICE_ROLE_KEY: "x" }), 0);
  assert.equal(checkEnv({}), 0);
});

const base = {
  dataSource: "shared",
  aiEnabled: false,
  supabaseUrl: "http://platform.test",
  supabaseAnonKey: "anon",
  healthEmail: "smoke+sb@bcn-services.com",
  healthPassword: "pw",
};
const okProbe = async () => {};
const failProbe = async () => {
  throw new Error("boom");
};

test("health: keyless shared run is ok/unconfigured and never probes", async () => {
  let called = false;
  const r = await evaluateSharedHealth({ dataSource: "shared", aiEnabled: false }, async () => {
    called = true;
  });
  assert.deepEqual(r, { ok: true, platform: "unconfigured" });
  assert.equal(called, false);
});

test("health: platform configured but no probe login is a failure", async () => {
  const r = await evaluateSharedHealth({ ...base, healthPassword: undefined }, okProbe);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "health_login_missing");
});

test("health: service key present fails even if the probe would pass", async () => {
  const r = await evaluateSharedHealth({ ...base, supabaseServiceRoleKey: "x" }, okProbe);
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
