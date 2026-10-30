/** board-phases.test.mjs — lib/tracks.ts: columns are task phases; a track shows in every column it has steps in. */

import { test } from "node:test";
import assert from "node:assert/strict";

const TR = await import("../lib/tracks.ts");
const NOW = new Date("2026-10-27T15:00:00Z"); // 11:00 in New York, today = 2026-10-27
const TODAY = "2026-10-27";

const task = (o) => ({
  title: o.id,
  owners: ["nate"],
  status: "todo",
  due: null,
  waiting_on: null,
  done_at: null,
  track_id: null,
  client_slug: null,
  created_at: "2026-10-01T00:00:00Z",
  ...o,
});
// every live track is stored in "now"; the board must ignore that
const track = (id, name) => ({
  id,
  name,
  area: null,
  client_slug: null,
  column: "now",
  done_at: null,
  created_at: "2026-09-01T00:00:00Z",
});
const cols = (b) =>
  Object.fromEntries(
    Object.entries(b).map(([c, cards]) => [
      c,
      cards.map((k) => [k.track.name, k.steps.map((s) => s.id)]),
    ])
  );

test("constants are pinned to literals", () => {
  assert.equal(TR.DONE_DAYS, 7);
  assert.equal(TR.DONE_CAP, 5);
  assert.equal(TR.UNASSIGNED_ID, "unassigned");
});

test("phase: doing / due within 7 days (overdue too) = now; waiting status or waiting_on = wait; other todo = next; done within 7 NY days, else off", () => {
  const p = (o) => TR.phase(task({ id: "x", ...o }), TODAY);
  assert.equal(p({ status: "doing" }), "now");
  assert.equal(p({ due: "2026-11-03" }), "now"); // today + 7
  assert.equal(p({ due: "2026-11-04" }), "next"); // today + 8
  assert.equal(p({ due: "2026-10-01" }), "now"); // overdue
  assert.equal(p({ status: "waiting" }), "wait");
  assert.equal(p({ waiting_on: "brandon" }), "wait");
  assert.equal(p({ status: "doing", waiting_on: "brandon" }), "wait"); // waiting beats doing
  assert.equal(p({ waiting_on: "  " }), "next"); // blank waiting_on is not waiting
  assert.equal(p({}), "next");
  assert.equal(p({ status: "done", done_at: "2026-10-20T15:00:00Z" }), "done"); // NY 10-20 = today - 7
  assert.equal(p({ status: "done", done_at: "2026-10-20T03:00:00Z" }), null); // NY 10-19 23:00
  assert.equal(p({ status: "done", done_at: "2026-10-17T15:00:00Z" }), null); // 10 days ago
  assert.equal(p({ status: "done", done_at: null }), null);
});

test("buildBoard on the live board shape: Outreach split across all four columns, Done capped at 5 newest, Clients only in Done, Misc last, unknown names skipped", () => {
  const tracks = [
    track("t-ops", "Ops"),
    track("t-clients", "Clients"),
    track("t-out", "Outreach"),
    track("t-warm", "Warm contacts"), // leftover non-fixed row
    track("t-soft", "Software"),
    track("t-mkt", "Marketing"),
  ];
  const doneAgo = (id, days, trackId = "t-out") =>
    task({
      id,
      track_id: trackId,
      status: "done",
      done_at: new Date(NOW.getTime() - days * 86_400_000).toISOString(),
    });
  const tasks = [
    task({ id: "ai101", track_id: "t-out", status: "doing" }),
    task({ id: "mazzone", track_id: "t-out", due: "2026-10-28", client_slug: "ta" }),
    task({ id: "pilot", track_id: "t-out", due: "2026-10-25" }),
    task({ id: "demo-template", track_id: "t-out" }),
    task({ id: "interviews", track_id: "t-out", status: "waiting", waiting_on: "replies" }),
    doneAgo("d1", 6),
    doneAgo("d2", 5),
    doneAgo("d3", 4),
    doneAgo("d4", 3),
    doneAgo("d5", 2),
    doneAgo("d6", 1),
    doneAgo("d-old", 10),
    doneAgo("c1", 2, "t-clients"),
    task({ id: "hq-fix", track_id: "t-soft", due: "2026-10-30" }),
    task({ id: "warm1", track_id: "t-warm", due: "2026-10-27" }), // on a skipped track: nowhere
    task({ id: "m-open", track_id: null }),
    task({ id: "m-done", track_id: null, status: "done", done_at: "2026-10-26T12:00:00Z" }),
  ];
  const b = TR.buildBoard(tracks, tasks, NOW);
  assert.deepEqual(Object.keys(b), ["now", "next", "wait", "done"]);
  assert.deepEqual(cols(b), {
    now: [
      ["Software", ["hq-fix"]],
      ["Outreach", ["pilot", "mazzone", "ai101"]], // by due, undated last
    ],
    next: [
      ["Outreach", ["demo-template"]],
      ["Miscellaneous", ["m-open"]],
    ],
    wait: [["Outreach", ["interviews"]]],
    done: [
      ["Outreach", ["d6", "d5", "d4", "d3", "d2"]], // 6 in the window, newest 5; d-old dropped
      ["Clients", ["c1"]],
      ["Miscellaneous", ["m-done"]], // done orphans show in Done too
    ],
  });
  const misc = b.done.at(-1).track;
  assert.deepEqual([misc.id, misc.name], ["unassigned", "Miscellaneous"]);
  assert.equal(b.now[1].steps[1].client_slug, "ta");
  // the same track object rides every column it has steps in
  assert.equal(b.now[1].track.id, "t-out");
  assert.equal(b.done[0].track.id, "t-out");
});

test("buildBoard: no tasks -> no cards (tracks alone never draw)", () => {
  const b = TR.buildBoard([track("t-out", "Outreach")], [], NOW);
  for (const c of ["now", "next", "wait", "done"]) assert.equal(b[c].length, 0);
});
