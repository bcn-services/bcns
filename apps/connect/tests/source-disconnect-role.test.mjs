/**
 * Owner disconnect route with a signed-in session: the behaviour the source-text test in
 * source-disconnect.test.mjs cannot show. @bcn-services/tenant is replaced in require.cache
 * (the real one reads next/headers cookies, absent outside Next), so lib/session.ts runs
 * unmodified and the route gets a real member or owner session with a recording RPC client.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const HUB = "https://connect.bcn-services.com";
const require = createRequire(new URL("../lib/session.ts", import.meta.url));
const SAME = { "sec-fetch-site": "same-origin" };

const state = { role: "member", rpcError: null, calls: [] };
const supabase = { schema: (name) => ({ rpc: async (fn, args) => (state.calls.push({ schema: name, fn, args }), { error: state.rpcError }) }) };
const fake = {
  createServerSupabase: () => supabase,
  requireMembership: async () => ({ ok: true, membership: { userId: "u", email: null, clientId: "c", role: state.role } }),
};
const tenantPath = require.resolve("@bcn-services/tenant");
require.cache[tenantPath] = { id: tenantPath, filename: tenantPath, loaded: true, exports: fake, children: [], paths: [] };
Object.assign(process.env, { HUB_BASE_URL: HUB });
require("react").cache ??= (fn) => fn;
const { NextRequest } = await import("next/server");
const { POST } = await import(new URL("../app/api/sources/[source]/disconnect/route.ts", import.meta.url).href);
const post = (source) =>
  POST(new NextRequest(`${HUB}/api/sources/${source}/disconnect`, { method: "POST", headers: SAME }), { params: { source } });
const SOURCES = ["quickbooks", "meet", "drive", "monday", "meta"];
const reset = (role, rpcError = null) => Object.assign(state, { role, rpcError, calls: [] });

test("a signed-in MEMBER is refused with forbidden and no RPC call is made", async () => {
  for (const source of SOURCES) {
    reset("member");
    const res = await post(source);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), `${HUB}/?error=forbidden`, source);
    assert.deepEqual(state.calls, [], `${source}: member must not reach the RPC`);
  }
});

test("an OWNER reaches api.disconnect_source with exactly the posted source", async () => {
  for (const source of SOURCES) {
    reset("owner");
    const res = await post(source);
    assert.equal(res.headers.get("location"), `${HUB}/?disconnected=${source}`, source);
    assert.deepEqual(state.calls, [{ schema: "api", fn: "disconnect_source", args: { p_source: source } }], source);
  }
});

test("an owner posting shopify or an unknown source never reaches the RPC", async () => {
  for (const source of ["shopify", "upload", "nope"]) {
    reset("owner");
    const res = await post(source);
    assert.equal(res.headers.get("location"), `${HUB}/?error=disconnect-failed`, source);
    assert.deepEqual(state.calls, [], source);
  }
});

test("RPC errors: BCNS2 answers forbidden, anything else disconnect-failed", async () => {
  reset("owner", { code: "BCNS2" });
  assert.equal((await post("meet")).headers.get("location"), `${HUB}/?error=forbidden`);
  reset("owner", { code: "BCNS3" });
  assert.equal((await post("meet")).headers.get("location"), `${HUB}/?error=disconnect-failed`);
});
