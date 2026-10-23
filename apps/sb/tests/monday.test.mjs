/**
 * monday.test.mjs — the Monday panel's Daily-group read, the queued mark-done
 * write, and the "View All" board link (lib/monday.ts, app/monday-actions.ts,
 * MondayPanel.tsx).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KEEP_DONE_MS,
  commandStateByItem,
  isChecked,
  isMondayItemId,
  keptItemIds,
  loadDailyTasks,
  loadDoneCommands,
  mondayBoardUrl,
  queueMarkDone,
  queueMarkUndone,
  rowBadge,
} from "../lib/monday.ts";
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

const cmd = (item_id, status, created_at, kind = "set_status_done") => ({ kind, payload: { item_id }, status, created_at });

test("commandStateByItem: newest command wins; queued reads pending, failed stays failed", () => {
  const tasks = [{ external_id: "1" }, { external_id: "2" }, { external_id: "3" }];
  const states = commandStateByItem(
    [cmd("1", "queued", "2026-10-23T10:00:00Z"), cmd("1", "failed", "2026-10-23T09:00:00Z"), cmd("2", "failed", "2026-10-23T09:00:00Z"), cmd("3", "done", "2026-10-23T09:00:00Z")],
    tasks,
  );
  assert.deepEqual(states.get("1"), { kind: "done", state: "pending" });
  assert.deepEqual(states.get("2"), { kind: "done", state: "failed" });
  assert.deepEqual(states.get("3"), { kind: "done", state: "done" });
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
  assert.match(lib, /client\.rpc\.enqueue_source_command\(\{\s*p_source: "monday",\s*p_kind: want === "done" \? MARK_DONE_KIND : MARK_UNDO_KIND,\s*p_payload: \{ item_id: itemId \},?\s*\}\)/);
  assert.match(lib, /isChecked\(task, cmd\) !== \(want === "undo"\)/);
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
  const rows = await loadDoneCommands({ views: { source_commands_v1: () => b } }, new Date("2026-10-23T12:00:00Z"));
  assert.equal(rows.length, 1);
  assert.deepEqual(calls.filter((c) => c[0] === "eq"), [["eq", "source", "monday"]]);
  assert.deepEqual(calls.find((c) => c[0] === "in"), ["in", "kind", ["set_status_done", "set_status_undone"]]);
  const gte = calls.find((c) => c[0] === "gte");
  assert.equal(gte[1], "created_at");
  assert.equal(gte[2], "2026-10-22T12:00:00.000Z", "window is 24h back from the injected clock");

  assert.deepEqual(await loadDoneCommands({ views: { source_commands_v1: () => { throw new Error("no such view"); } } }), []);
  assert.deepEqual(await loadDoneCommands(null), []);
});

test("MondayRow: form posts through useFormState; a refused enqueue shows the quiet note, pending a dot", () => {
  const row = read("../app/_components/MondayRow.tsx");
  assert.match(row, /useFormState<MarkDoneState, FormData>\(checked \? markMondayUndone : markMondayDone, null\)/);
  assert.match(row, /<form className="task-row" action=\{action\}>/);
  assert.match(row, /name="item_id"/);
  assert.match(row, /cmd === "failed" \|\| state\?\.error/);
  assert.match(row, /Couldn’t update/);
  assert.match(row, /task-dot/);
  assert.match(read("../app/_components/MondayPanel.tsx"), /<MondayRow /);
});

// ---- undo: the 24h window, selection, row state and the guard

const NOW = new Date("2026-10-23T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const H = 60 * 60 * 1000;

test("KEEP_DONE_MS is 24 hours", () => {
  assert.equal(KEEP_DONE_MS, 86_400_000);
});

test("keptItemIds: a mark-done within 24h is kept; a later undo drops it; a failed command is skipped", () => {
  const kept = keptItemIds(
    [
      cmd("1", "done", ago(1 * H)), // kept
      cmd("2", "done", ago(1 * H), "set_status_undone"), // undone after...
      cmd("2", "done", ago(2 * H)), // ...its done
      cmd("3", "failed", ago(1 * H)), // failed done alone: nothing changed
      cmd("4", "failed", ago(1 * H), "set_status_undone"), // failed undo: still done, still kept
      cmd("4", "done", ago(3 * H)),
      cmd("5", "queued", ago(1000)), // in flight counts
    ],
    NOW,
  );
  assert.deepEqual(kept.sort(), ["1", "4", "5"]);
});

test("keptItemIds: the window edge is 24h exactly; re-marking after an undo keeps it again", () => {
  assert.deepEqual(keptItemIds([cmd("1", "done", ago(24 * H - 1000))], NOW), ["1"]);
  assert.deepEqual(keptItemIds([cmd("1", "done", ago(24 * H + 1000))], NOW), []);
  assert.deepEqual(keptItemIds([cmd("1", "queued", ago(1 * H)), cmd("1", "done", ago(2 * H), "set_status_undone"), cmd("1", "done", ago(3 * H))], NOW), ["1"]);
  // order of the input does not matter
  assert.deepEqual(keptItemIds([cmd("1", "done", ago(3 * H)), cmd("1", "done", ago(2 * H), "set_status_undone")], NOW), []);
  assert.deepEqual(keptItemIds([cmd("1", "done", ago(1 * H), "set_status_other"), cmd("x", "done", ago(1 * H))], NOW), []);
});

test("loadDailyTasks: kept done items are merged in board order and the list stays five", async () => {
  const open = [1, 2, 4, 5, 6].map((p) => ({ external_id: `o${p}`, position: p, due_on: null }));
  const kept = [{ external_id: "d3", position: 3, due_on: null, is_done: true }, { external_id: "o2", position: 2, due_on: null }];
  const { client, calls } = fakeJobs([{ data: open, error: null }, { data: kept, error: null }]);
  const r = await loadDailyTasks(client, ["d3", "o2"]);
  assert.deepEqual(r.data.map((t) => t.external_id), ["o1", "o2", "d3", "o4", "o5"], "d3 holds its slot; o6 does not slide in; o2 is not duplicated");
  assert.deepEqual(calls.find((c) => c[0] === "in"), ["in", "external_id", ["d3", "o2"]]);
});

test("loadDailyTasks: no kept ids is one query; a failed kept read degrades to the not-done list", async () => {
  const one = fakeJobs([{ data: [{ external_id: "a" }], error: null }]);
  await loadDailyTasks(one.client, []);
  assert.equal(one.calls.some((c) => c[0] === "in"), false);
  const bad = fakeJobs([{ data: [{ external_id: "a" }], error: null }, { data: null, error: { message: "x" } }]);
  assert.deepEqual((await loadDailyTasks(bad.client, ["9"])).data, [{ external_id: "a" }]);
});

test("isChecked: an in-flight or applied command decides; a failed one leaves the board's state", () => {
  assert.equal(isChecked({ is_done: false }, undefined), false);
  assert.equal(isChecked({ is_done: true }, undefined), true);
  assert.equal(isChecked({ is_done: false }, { kind: "done", state: "pending" }), true);
  assert.equal(isChecked({ is_done: true }, { kind: "undo", state: "pending" }), false);
  assert.equal(isChecked({ is_done: true }, { kind: "undo", state: "done" }), false);
  assert.equal(isChecked({ is_done: true }, { kind: "undo", state: "failed" }), true);
  assert.equal(isChecked({ is_done: false }, { kind: "done", state: "failed" }), false);
});

test("rowBadge: Done when checked; an item being undone reads To Do, not the stale Done status", () => {
  assert.deepEqual(rowBadge({ is_done: false, status: "Working on it" }, true), { label: "Done", tone: "done" });
  assert.deepEqual(rowBadge({ is_done: true, status: "Done" }, true), { label: "Done", tone: "done" });
  assert.deepEqual(rowBadge({ is_done: true, status: "Done" }, false), { label: "To Do", tone: "todo" });
  assert.deepEqual(rowBadge({ is_done: false, status: "Working on it" }, false), { label: "Working on it", tone: "progress" });
});

/** queueMarkUndone / queueMarkDone with a job row, recent commands and an rpc that records. */
function fakeToggle({ job, commands = [] }) {
  const calls = [];
  const proxy = (result) => { const b = new Proxy({}, { get: (_t, n) => (n === "then" ? (res) => res(result) : () => b) }); return b; };
  return {
    calls,
    client: {
      views: {
        jobs_v1: () => proxy({ data: job ? [job] : [], error: null }),
        source_commands_v1: () => proxy({ data: commands, error: null }),
      },
      rpc: { enqueue_source_command: async (args) => { calls.push(args); return "id"; } },
    },
  };
}

test("queueMarkUndone: enqueues set_status_undone for a done item", async () => {
  const f = fakeToggle({ job: { external_id: "7", is_done: true, source_updated_at: ago(1 * H) } });
  assert.equal(await queueMarkUndone(f.client, "7", NOW), true);
  assert.deepEqual(f.calls, [{ p_source: "monday", p_kind: "set_status_undone", p_payload: { item_id: "7" } }]);
});

test("queueMarkUndone: refused for an item that is not done, a bad id, no client, or an item the user cannot see", async () => {
  const open = fakeToggle({ job: { external_id: "7", is_done: false, source_updated_at: ago(1 * H) } });
  assert.equal(await queueMarkUndone(open.client, "7", NOW), false);
  assert.equal(await queueMarkUndone(open.client, "7;drop", NOW), false);
  assert.equal(await queueMarkUndone(null, "7", NOW), false);
  const none = fakeToggle({ job: null });
  assert.equal(await queueMarkUndone(none.client, "7", NOW), false);
  assert.deepEqual([...open.calls, ...none.calls], []);
});

test("queueMarkUndone: a mark-done not yet synced can be undone; an already-queued undo cannot be undone twice", async () => {
  const pendingDone = fakeToggle({ job: { external_id: "7", is_done: false, source_updated_at: ago(2 * H) }, commands: [cmd("7", "queued", ago(1000))] });
  assert.equal(await queueMarkUndone(pendingDone.client, "7", NOW), true);
  const undoing = fakeToggle({
    job: { external_id: "7", is_done: true, source_updated_at: ago(2 * H) },
    commands: [cmd("7", "queued", ago(1000), "set_status_undone")],
  });
  assert.equal(await queueMarkUndone(undoing.client, "7", NOW), false);
  assert.deepEqual(undoing.calls, []);
});

test("queueMarkDone: refused while a mark-done is already in flight (the row reads checked); allowed again after an undo", async () => {
  const inFlight = fakeToggle({ job: { external_id: "7", is_done: false, source_updated_at: ago(2 * H) }, commands: [cmd("7", "queued", ago(1000))] });
  assert.equal(await queueMarkDone(inFlight.client, "7", NOW), false);
  const after = fakeToggle({ job: { external_id: "7", is_done: true, source_updated_at: ago(2 * H) }, commands: [cmd("7", "done", ago(1000), "set_status_undone")] });
  assert.equal(await queueMarkDone(after.client, "7", NOW), true);
});

test("markMondayUndone: queues through queueMarkUndone as the signed-in user, no Monday token", () => {
  const src = read("../app/monday-actions.ts");
  assert.match(src, /export async function markMondayUndone/);
  assert.match(src, /queueMarkUndone\(await getDataClient\(\), form\.get\("item_id"\)\)/);
  assert.match(read("../lib/monday.ts"), /MARK_UNDO_KIND = "set_status_undone"/);
  assert.doesNotMatch(src, /MONDAY_(API_)?TOKEN|api\.monday\.com|SERVICE_ROLE/i);
});
