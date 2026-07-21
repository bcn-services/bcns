/**
 * Tests for the pure health evaluation (lib/health.ts).
 * Run with: corepack pnpm --filter @nseluga/app-core test
 *
 * Covers the template contract for /api/health:
 *  - no Supabase env → ok:true, db:"unconfigured" (keyless runs never look down)
 *  - configured + reachable ping → ok:true, db:"connected"
 *  - configured + failing ping → ok:false, db:"error" (route returns 503)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth } from "../src/health.ts";

const base = { aiEnabled: false };

test("health: unconfigured Supabase env is ok/unconfigured, ping never called", async () => {
  let pinged = false;
  const report = await evaluateHealth({ ...base }, async () => {
    pinged = true;
    return true;
  });
  assert.deepEqual(report, { ok: true, db: "unconfigured" });
  assert.equal(pinged, false, "no ping without a configured URL + anon key");
});

test("health: url without anon key still counts as unconfigured", async () => {
  const report = await evaluateHealth(
    { ...base, supabaseUrl: "https://x.supabase.co" },
    async () => true,
  );
  assert.deepEqual(report, { ok: true, db: "unconfigured" });
});

test("health: reachable DB reports connected", async () => {
  const seen = [];
  const report = await evaluateHealth(
    { ...base, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" },
    async (url, key) => {
      seen.push([url, key]);
      return true;
    },
  );
  assert.deepEqual(report, { ok: true, db: "connected" });
  assert.deepEqual(seen, [["https://x.supabase.co", "anon"]]);
});

test("health: failing ping reports error and not-ok", async () => {
  const report = await evaluateHealth(
    { ...base, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" },
    async () => false,
  );
  assert.deepEqual(report, { ok: false, db: "error" });
});
