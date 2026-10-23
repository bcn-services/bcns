/**
 * monday.test.mjs — the Monday panel's Daily-group read, the queued mark-done
 * write, and the "View All" board link (lib/monday.ts, app/monday-actions.ts,
 * MondayPanel.tsx).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commandStateByItem, isMondayItemId, loadDailyTasks, loadDoneCommands, mondayBoardUrl, queueMarkDone } from "../lib/monday.ts";
import { SERVICE_LINKS } from "../lib/links.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

/** A chainable fake of client.views.jobs_v1() that records every call and resolves to `result`. */
function fakeJobs(results) {
  const calls = [];
  let n = 0;
  const builder = new Proxy(
    {},
    {
      get(_t, name) {
        if (name === "then") {
          const result = results[Math.min(n++, results.length - 1)];
          return (res) => res(result);
        }
        return (...args) => {
          calls.push([name, ...args]);
          return builder;
        };
      },
    },
  );
  return { client: { views: { jobs_v1: () => builder } }, calls };
}

test("loadDailyTasks: Daily group, not-done, board order, five rows", async () => {
  const { client, calls } = fakeJobs([{ data: [{ id: "a" }], error: null }]);
  const r = await loadDailyTasks(client);
  assert.deepEqual(r.data, [{ id: "a" }]);
  assert.deepEqual(calls.filter((c) => c[0] === "eq"), [
    ["eq", "source", "monday"],
    ["eq", "kind", "task"],
    ["eq", "group_name", "Daily"],
    ["eq", "is_done", false],
  ]);
  assert.equal(calls.find((c) => c[0] === "order")[1], "position");
  assert.deepEqual(calls.find((c) => c[0] === "limit"), ["limit", 5]);
});

test("loadDailyTasks: position column not deployed yet falls back to due date", async () => {
  const { client, calls } = fakeJobs([
    { data: null, error: { message: "column jobs_v1.position does not exist" } },
    { data: [{ id: "b" }], error: null },
  ]);
  const r = await loadDailyTasks(client);
  assert.deepEqual(r.data, [{ id: "b" }]);
  assert.equal(calls.filter((c) => c[0] === "order").at(-1)[1], "due_on");
});

test("loadDailyTasks: a thrown read is returned as an error, never thrown", async () => {
  const client = { views: { jobs_v1: () => { throw new Error("boom"); } } };
  const r = await loadDailyTasks(client);
  assert.equal(r.data, null);
  assert.ok(r.error instanceof Error);
});

test("isMondayItemId: digits only", () => {
  assert.equal(isMondayItemId("1234567890"), true);
  for (const bad of ["", "12a", "1 2", "-1", "1;drop", null, 12, undefined, "1".repeat(21)]) assert.equal(isMondayItemId(bad), false);
});

const cmd = (item_id, status, created_at) => ({ payload: { item_id }, status, created_at });

test("commandStateByItem: newest command wins; queued reads pending, failed stays failed", () => {
  const tasks = [{ external_id: "1" }, { external_id: "2" }, { external_id: "3" }];
  const states = commandStateByItem(
    [cmd("1", "queued", "2026-10-23T10:00:00Z"), cmd("1", "failed", "2026-10-23T09:00:00Z"), cmd("2", "failed", "2026-10-23T09:00:00Z"), cmd("3", "done", "2026-10-23T09:00:00Z")],
    tasks,
  );
  assert.equal(states.get("1"), "pending");
  assert.equal(states.get("2"), "failed");
  assert.equal(states.get("3"), "done");
});

test("commandStateByItem: a command older than the item's last sync is ignored; other items' commands are ignored", () => {
  const tasks = [{ external_id: "1", source_updated_at: "2026-10-23T11:00:00Z" }];
  const states = commandStateByItem([cmd("1", "done", "2026-10-23T10:00:00Z"), cmd("99", "queued", "2026-10-23T12:00:00Z")], tasks);
  assert.equal(states.size, 0);
});

test("mondayBoardUrl: the connector's board_url wins, then the item URL prefix, https only", () => {
  const tasks = [{ url: "https://acme.monday.com/boards/18415538891/pulses/55" }];
  assert.equal(mondayBoardUrl([{ source: "monday", target: { board_url: "https://acme.monday.com/boards/1" } }], tasks), "https://acme.monday.com/boards/1");
  assert.equal(mondayBoardUrl([], tasks), "https://acme.monday.com/boards/18415538891");
  assert.equal(mondayBoardUrl([{ source: "monday", target: { board_url: "javascript:alert(1)" } }], []), null);
  assert.equal(mondayBoardUrl([{ source: "monday", target: { board_url: "http://acme.monday.com/boards/1" } }], []), null);
  assert.equal(mondayBoardUrl(null, [{ url: "https://x.example/item/1" }]), null);
});

test("View All never points at the SERVICE_LINKS placeholder", () => {
  assert.equal("monday" in SERVICE_LINKS, false);
  const panel = read("../app/_components/MondayPanel.tsx");
  assert.doesNotMatch(panel, /SERVICE_LINKS/);
  assert.match(panel, /<ViewAll href=\{boardUrl\} external \/>/);
});

test("markMondayDone: queues through the typed api RPC as the signed-in user, no Monday token in apps/sb", () => {
  const src = read("../app/monday-actions.ts");
  assert.match(src, /^"use server";/);
  assert.match(src, /queueMarkDone\(await getDataClient\(\), form\.get\("item_id"\)\)/);
  assert.match(src, /return \{ error: !ok \}/);
  const lib = read("../lib/monday.ts");
  assert.match(lib, /client\.rpc\.enqueue_source_command\(\{ p_source: "monday", p_kind: MARK_DONE_KIND, p_payload: \{ item_id: itemId \} \}\)/);
  assert.match(lib, /\.eq\("is_done", false\)/);
  assert.match(lib, /set_status_done/);
  for (const f of ["../app/monday-actions.ts", "../lib/monday.ts", "../app/_components/MondayPanel.tsx", "../app/_components/MondayRow.tsx"]) {
    assert.doesNotMatch(read(f), /MONDAY_(API_)?TOKEN|api\.monday\.com|SERVICE_ROLE|contract-b/i);
  }
});

/** client with a jobs_v1 read resolving to `jobs` and an rpc that records calls (or throws). */
function fakeQueue({ jobs = { data: [{ id: "1" }], error: null }, rpc } = {}) {
  const calls = [];
  const jobsBuilder = new Proxy({}, { get: (_t, n) => (n === "then" ? (res) => res(jobs) : () => jobsBuilder) });
  return {
    calls,
    client: {
      views: { jobs_v1: () => jobsBuilder },
      rpc: { enqueue_source_command: async (args) => { calls.push(args); if (rpc) throw rpc; return "cmd-id"; } },
    },
  };
}

test("queueMarkDone: enqueues the typed RPC for a visible not-done item and reports true", async () => {
  const f = fakeQueue();
  assert.equal(await queueMarkDone(f.client, "123"), true);
  assert.deepEqual(f.calls, [{ p_source: "monday", p_kind: "set_status_done", p_payload: { item_id: "123" } }]);
});

test("queueMarkDone: RPC missing or raising returns false (the row shows an error), never throws", async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    const raising = fakeQueue({ rpc: new Error("function api.enqueue_source_command does not exist") });
    assert.equal(await queueMarkDone(raising.client, "123"), false);
    const missing = fakeQueue();
    delete missing.client.rpc.enqueue_source_command;
    assert.equal(await queueMarkDone(missing.client, "123"), false);
  } finally {
    console.error = origError;
  }
});

test("queueMarkDone: nothing queued for a bad id, no client, or an item the user cannot see", async () => {
  const f = fakeQueue();
  assert.equal(await queueMarkDone(f.client, "12;drop"), false);
  assert.equal(await queueMarkDone(null, "123"), false);
  const none = fakeQueue({ jobs: { data: [], error: null } });
  assert.equal(await queueMarkDone(none.client, "123"), false);
  assert.equal(await queueMarkDone(fakeQueue({ jobs: { data: null, error: { message: "x" } } }).client, "123"), false);
  assert.deepEqual([...f.calls, ...none.calls], []);
});

test("loadDoneCommands: reads source_commands_v1 through the typed client; a failing read is empty", async () => {
  const calls = [];
  const b = new Proxy({}, { get: (_t, n) => (n === "then" ? (res) => res({ data: [{ payload: { item_id: "1" }, status: "queued", created_at: "t" }], error: null }) : (...a) => (calls.push([n, ...a]), b)) });
  const rows = await loadDoneCommands({ views: { source_commands_v1: () => b } });
  assert.equal(rows.length, 1);
  assert.deepEqual(calls.filter((c) => c[0] === "eq"), [["eq", "source", "monday"], ["eq", "kind", "set_status_done"]]);
  assert.deepEqual(await loadDoneCommands({ views: { source_commands_v1: () => { throw new Error("no such view"); } } }), []);
  assert.deepEqual(await loadDoneCommands(null), []);
});

test("MondayRow: form posts through useFormState; a refused enqueue shows the quiet note, pending a dot", () => {
  const row = read("../app/_components/MondayRow.tsx");
  assert.match(row, /useFormState<MarkDoneState, FormData>\(markMondayDone, null\)/);
  assert.match(row, /<form className="task-row" action=\{action\}>/);
  assert.match(row, /name="item_id"/);
  assert.match(row, /cmd === "failed" \|\| state\?\.error/);
  assert.match(row, /Couldn’t update/);
  assert.match(row, /task-dot/);
  assert.match(read("../app/_components/MondayPanel.tsx"), /<MondayRow /);
});
