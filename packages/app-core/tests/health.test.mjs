/**
 * Tests for the pure health evaluation (lib/health.ts).
 * Run with: corepack pnpm --filter @bcn-services/app-core test
 *
 * Covers the template contract for /api/health:
 *  - no Supabase env → ok:true, db:"unconfigured" (keyless runs never look down)
 *  - configured + reachable ping → ok:true, db:"connected"
 *  - configured + failing ping → ok:false, db:"error" (route returns 503)
 *  - a 401/403 from Supabase (rejected key) is a failing ping, other <500 stays up
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, pingSupabase } from "../src/health.ts";

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

test("pingSupabase: probes a nonexistent table; 401/403, 5xx and network errors are down", async () => {
  const realFetch = globalThis.fetch;
  try {
    let seen;
    const up = {};
    for (const status of [200, 404, 401, 403, 500]) {
      globalThis.fetch = async (url, init) => {
        seen = [url, init.headers.apikey];
        return new Response("", { status });
      };
      up[status] = await pingSupabase("https://x.supabase.co", "anon");
    }
    assert.deepEqual(up, { 200: true, 404: true, 401: false, 403: false, 500: false });
    assert.deepEqual(seen, ["https://x.supabase.co/rest/v1/_health_probe?limit=1", "anon"]);
    globalThis.fetch = async () => {
      throw new Error("network");
    };
    assert.equal(await pingSupabase("https://x.supabase.co", "anon"), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
