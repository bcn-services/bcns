/**
 * The /access "Let AI see customer contact info" switch: the owner is re-checked before any
 * RPC, only an explicit `on` turns sharing on, and an RPC failure answers with a friendly
 * message instead of throwing. requireOwner/revalidate are injected, no Next or network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_SETTINGS_FAILED,
  parseShare,
  readShareContact,
  saveShareContact,
} from "../lib/ai-settings.ts";

const form = (share) => {
  const f = new FormData();
  if (share !== undefined) f.set("share", share);
  return f;
};

function harness({ owner = true, rpcResult = { data: null, error: null }, rpcThrows = false } = {}) {
  const calls = { rpc: [], revalidate: 0 };
  const api = {
    rpc: async (fn, args) => {
      calls.rpc.push({ fn, args });
      if (rpcThrows) throw new Error("network down");
      return rpcResult;
    },
  };
  const deps = {
    // The real requireOwner redirect()s, which throws; model that.
    requireOwner: async () => {
      if (!owner) throw new Error("NEXT_REDIRECT");
      return { api };
    },
    revalidate: () => {
      calls.revalidate += 1;
    },
  };
  return { api, deps, calls };
}

test("a non-owner is refused before any RPC runs", async () => {
  const { deps, calls } = harness({ owner: false });
  await assert.rejects(saveShareContact(form("on"), deps), /NEXT_REDIRECT/);
  assert.equal(calls.rpc.length, 0, "set_ai_settings must not be called");
  assert.equal(calls.revalidate, 0);
});

test("only an explicit 'on' parses to true", () => {
  assert.equal(parseShare(form("on")), true);
  for (const v of [undefined, "off", "", "true", "1", "ON", "yes", " on"]) {
    assert.equal(parseShare(form(v)), false, `${JSON.stringify(v)} must not turn sharing on`);
  }
});

test("the parsed boolean is what reaches set_ai_settings", async () => {
  for (const [input, expected] of [["on", true], ["off", false], ["true", false], [undefined, false]]) {
    const { deps, calls } = harness();
    const result = await saveShareContact(form(input), deps);
    assert.deepEqual(result, { ok: true, share: expected });
    assert.deepEqual(calls.rpc, [{ fn: "set_ai_settings", args: { p_share_customer_contact: expected } }]);
    assert.equal(calls.revalidate, 1);
  }
});

test("an RPC error returns a friendly message, does not throw, and does not revalidate", async () => {
  const { deps, calls } = harness({ rpcResult: { data: null, error: { message: "forbidden_role" } } });
  const result = await saveShareContact(form("on"), deps);
  assert.deepEqual(result, { ok: false, message: AI_SETTINGS_FAILED });
  assert.ok(!result.message.includes("forbidden_role"), "raw database text must not leak");
  assert.equal(calls.revalidate, 0);
});

test("a thrown RPC (network) also returns the friendly message", async () => {
  const { deps } = harness({ rpcThrows: true });
  assert.deepEqual(await saveShareContact(form("on"), deps), { ok: false, message: AI_SETTINGS_FAILED });
});

test("readShareContact: true only for a literal true; errors read as off and unknown", async () => {
  const rpc = (r) => ({ rpc: async () => r });
  assert.deepEqual(await readShareContact(rpc({ data: { share_customer_contact: true }, error: null })), { share: true, known: true });
  assert.deepEqual(await readShareContact(rpc({ data: { share_customer_contact: "true" }, error: null })), { share: false, known: true });
  assert.deepEqual(await readShareContact(rpc({ data: null, error: null })), { share: false, known: true });
  assert.deepEqual(await readShareContact(rpc({ data: null, error: { message: "x" } })), { share: false, known: false });
  assert.deepEqual(await readShareContact({ rpc: async () => { throw new Error("x"); } }), { share: false, known: false });
});
