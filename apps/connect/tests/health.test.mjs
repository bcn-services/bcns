/**
 * /api/health evaluation. The hub's probe must answer without credentials —
 * a keyless run is "unconfigured", not "down".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth } from "../lib/health.ts";

test("no NEXT_PUBLIC_SUPABASE_URL is 200 unconfigured, and never calls out", async () => {
  let called = false;
  const report = await evaluateHealth({}, async () => {
    called = true;
    return new Response("", { status: 200 });
  });
  assert.deepEqual(report, { status: 200, body: { ok: true, platform: "unconfigured" } });
  assert.equal(called, false);
});

test("a reachable GoTrue is 200 connected, probed with the anon key", async () => {
  const calls = [];
  const report = await evaluateHealth(
    { supabaseUrl: "https://p.supabase.co", supabaseAnonKey: "anon" },
    async (url, init) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }
  );
  assert.deepEqual(report.body, { ok: true, platform: "connected" });
  assert.equal(calls[0].url, "https://p.supabase.co/auth/v1/health");
  assert.equal(calls[0].init.headers.apikey, "anon");
});

test("a trailing slash on the project URL does not double up", async () => {
  const calls = [];
  await evaluateHealth({ supabaseUrl: "https://p.supabase.co/" }, async (url) => {
    calls.push(url);
    return new Response("{}", { status: 200 });
  });
  assert.equal(calls[0], "https://p.supabase.co/auth/v1/health");
});

test("a bad status is 503 unreachable", async () => {
  const report = await evaluateHealth(
    { supabaseUrl: "https://p.supabase.co" },
    async () => new Response("", { status: 500 })
  );
  assert.deepEqual(report, { status: 503, body: { ok: false, platform: "unreachable" } });
});

test("a thrown fetch is the same answer, not an unhandled rejection", async () => {
  const report = await evaluateHealth({ supabaseUrl: "https://p.supabase.co" }, async () => {
    throw new Error("ENOTFOUND");
  });
  assert.equal(report.status, 503);
  assert.equal(report.body.platform, "unreachable");
});
