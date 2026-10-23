/**
 * Staff switch server action and component with @bcn-services/tenant and next/cache replaced in
 * require.cache (the real ones need Next's request scope). The real proof that the refreshed token
 * carries the new workspace is platform/test/staff-switch.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../app/staff-actions.ts", import.meta.url));
const state = { user: { id: "u" }, rpcError: null, workspaces: [], log: [] };
const supabase = {
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
    refreshSession: async () => void state.log.push("refresh"),
  },
  schema: () => ({
    rpc: async (fn, args) => {
      state.log.push(`rpc:${fn}:${args?.p_slug ?? ""}`);
      return fn === "staff_workspaces" ? { data: state.workspaces } : { error: state.rpcError };
    },
  }),
};
const stub = (id, exports) => {
  const path = require.resolve(id);
  require.cache[path] = { id: path, filename: path, loaded: true, exports, children: [], paths: [] };
};
stub("@bcn-services/tenant", { createServerSupabase: () => supabase });
stub("next/cache", { revalidatePath: (p, t) => state.log.push(`revalidate:${p}:${t}`) });
globalThis.React = require("react"); // tsx compiles JSX to React.createElement
const { switchWorkspace } = await import(new URL("../app/staff-actions.ts", import.meta.url).href);
const { StaffSwitcher } = await import(new URL("../app/staff-switcher.tsx", import.meta.url).href);

const run = async (slug) => {
  state.log = [];
  const form = new FormData();
  form.set("slug", slug);
  try {
    await switchWorkspace(form);
  } catch (e) {
    return String(e.digest ?? e.message);
  }
};

test("switch calls the RPC, refreshes the token, then lands on /", async () => {
  assert.match(await run("sb"), /NEXT_REDIRECT;[a-z]+;\/;/);
  assert.deepEqual(state.log, ["rpc:staff_switch_client:sb", "refresh", "revalidate:/:layout"]);
});

test("a refused switch does not refresh and goes to an error", async () => {
  state.rpcError = { code: "BCNS4" };
  assert.match(await run("pjg"), /\/\?error=failed/);
  assert.deepEqual(state.log, ["rpc:staff_switch_client:pjg"]);
  state.rpcError = null;
});

test("signed out goes to login without touching the RPC", async () => {
  state.user = null;
  assert.match(await run("sb"), /\/login\?error=signed-out/);
  assert.deepEqual(state.log, []);
  state.user = { id: "u" };
});

test("the switcher renders nothing for [] and a form for staff", async () => {
  state.workspaces = [];
  assert.equal(await StaffSwitcher(), null);
  state.workspaces = [{ slug: "sb", name: "SB", current: true }];
  assert.notEqual(await StaffSwitcher(), null);
});
