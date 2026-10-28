/** work.test.mjs — lib/tasks.ts: pure helpers, then the writes through a fake client. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeSb } from "./_fake-sb.mjs";

const T = await import("../lib/tasks.ts");
const NOW = new Date("2026-10-27T15:00:00Z"); // 11:00 in New York
const ACTOR = "00000000-0000-4000-8000-000000000001";

test("constants are pinned to literals", () => {
  assert.deepEqual(
    [...T.AREAS],
    [
      "warm",
      "cousin-pilot",
      "interviews",
      "associations",
      "linkedin",
      "cold-calling",
      "demos",
      "seo-ads",
      "client",
      "ops",
      "leads",
    ]
  );
  assert.deepEqual([...T.OWNERS], ["nate", "brandon", "claude"]);
  assert.deepEqual([...T.STATUSES], ["todo", "doing", "waiting", "done"]);
});

test("due math: America/New_York day, whole days added", () => {
  assert.equal(T.isoDay(new Date("2026-10-28T02:00:00Z")), "2026-10-27"); // still the 27th in NY
  assert.equal(T.isoDay(NOW), "2026-10-27");
  assert.equal(T.addDays("2026-10-27", 3), "2026-10-30");
  assert.equal(T.addDays("2026-10-30", 3), "2026-11-02");
});

test("buildTaskPatch: done sets done_at, leaving done clears it, other keys leave done_at alone", () => {
  assert.deepEqual(T.buildTaskPatch({ status: "done" }, NOW), {
    status: "done",
    done_at: "2026-10-27T15:00:00.000Z",
    updated_at: "2026-10-27T15:00:00.000Z",
  });
  const reopened = T.buildTaskPatch({ status: "doing" }, NOW);
  assert.equal(reopened.done_at, null);
  assert.equal("done_at" in T.buildTaskPatch({ owner: "brandon" }, NOW), false);
});

test("buildTaskPatch: owner must be nate|brandon|claude; empty patch, bad status and bad due throw", () => {
  assert.equal(T.buildTaskPatch({ owner: "claude" }, NOW).owner, "claude");
  assert.throws(() => T.buildTaskPatch({ owner: "mallory" }, NOW), /owner/);
  assert.throws(() => T.buildTaskPatch({}, NOW), /nothing to update/);
  assert.throws(() => T.buildTaskPatch({ status: "cancelled" }, NOW), /status/);
  assert.throws(() => T.buildTaskPatch({ due: "tomorrow" }, NOW), /due/);
  assert.equal(T.buildTaskPatch({ due: "" }, NOW).due, null);
});

test("owner cycle, waiting status, list status cycle, grouping and filters", () => {
  assert.deepEqual(
    ["nate", "brandon", "claude"].map((o) => T.nextOwner(o)),
    ["brandon", "claude", "nate"]
  );
  assert.equal(T.waitingStatus("nate", "todo"), "waiting");
  assert.equal(T.waitingStatus("", "waiting"), "todo");
  assert.equal(T.waitingStatus("", "doing"), undefined);
  assert.equal(T.waitingStatus("nate", "done"), undefined);
  assert.deepEqual(
    ["todo", "reached", "scheduled", "done", "no"].map((s) => T.nextListStatus(s)),
    ["reached", "scheduled", "done", "no", "todo"]
  );
  const t = (id, owner, status, due, area = "ops") => ({ id, owner, status, due, area });
  const all = [
    t(1, "nate", "todo", "2026-11-01"),
    t(2, "nate", "doing", null),
    t(3, "nate", "todo", "2026-10-28"),
    t(4, "claude", "done", null, "leads"),
  ];
  const g = T.groupByOwner(all);
  assert.deepEqual(
    g.map((x) => x.owner),
    ["nate", "brandon", "claude"]
  );
  assert.deepEqual(
    g[0].tasks.map((x) => x.id),
    [2, 3, 1]
  ); // doing first, then todo by due
  assert.deepEqual(
    T.filterTasks(all, {}).map((x) => x.id),
    [1, 2, 3]
  ); // default hides done
  assert.deepEqual(
    T.filterTasks(all, { status: "all", area: "leads" }).map((x) => x.id),
    [4]
  );
  assert.deepEqual(
    T.filterTasks(all, { owner: "claude", status: "done" }).map((x) => x.id),
    [4]
  );
});

test("createTask / updateTask write the row and an events row with actor + via", async () => {
  const sb = fakeSb();
  const task = await T.createTask(
    sb,
    ACTOR,
    "mcp",
    { title: "  Write pitch ", owner: "claude", area: "leads", due: "2026-10-30" },
    NOW
  );
  assert.equal(task.title, "Write pitch");
  assert.equal(task.created_by, ACTOR);
  assert.equal(task.via, "mcp");
  assert.equal(task.source, "manual");
  assert.equal(task.status, "todo");
  await T.updateTask(sb, ACTOR, "ui", task.id, { status: "done" }, NOW);
  const row = sb.db.tasks[0];
  assert.equal(row.status, "done");
  assert.equal(row.done_at, "2026-10-27T15:00:00.000Z");
  assert.deepEqual(
    sb.db.events.map((e) => [e.kind, e.actor, e.via]),
    [
      ["task.created", ACTOR, "mcp"],
      ["task.updated", ACTOR, "ui"],
    ]
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "  ", owner: "nate" }),
    /title/
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owner: "nobody" }),
    /owner/
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owner: "nate", area: "bogus" }),
    /area/
  );
});

test("a failing write throws instead of reporting success", async () => {
  await assert.rejects(
    () =>
      T.createTask(fakeSb({}, { failOn: { tasks: "boom" } }), ACTOR, "ui", {
        title: "x",
        owner: "nate",
      }),
    /boom/
  );
  await assert.rejects(
    () =>
      T.createTask(fakeSb({}, { failOn: { events: "no audit" } }), ACTOR, "ui", {
        title: "x",
        owner: "nate",
      }),
    /no audit/
  );
});

test("createLeadTask: claude / leads / lead, linked to the business, due +3 days", async () => {
  const biz = "11111111-1111-4111-8111-111111111111";
  const sb = fakeSb({ businesses: [{ id: biz, name: "hq4-Test Roofing" }] });
  for (const [kind, title] of [
    ["pitch", "Pitch hq4-Test Roofing"],
    ["quote", "Quote hq4-Test Roofing"],
    ["onboard", "Onboard hq4-Test Roofing"],
  ]) {
    const t = await T.createLeadTask(sb, ACTOR, "ui", { businessId: biz, kind }, NOW);
    assert.equal(t.title, title);
    assert.equal(t.owner, "claude");
    assert.equal(t.area, "leads");
    assert.equal(t.source, "lead");
    assert.equal(t.business_id, biz);
    assert.equal(t.due, "2026-10-30");
    assert.equal(t.status, "todo");
  }
  await assert.rejects(
    () => T.createLeadTask(sb, ACTOR, "ui", { businessId: biz, kind: "refund" }, NOW),
    /kind/
  );
  await assert.rejects(
    () => T.createLeadTask(sb, ACTOR, "ui", { businessId: "nope", kind: "pitch" }, NOW),
    /business/
  );
});

test("createOpsTask is idempotent on alert_key while a task is open", async () => {
  const sb = fakeSb();
  const a = await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:connector:t1:shopify", title: "Re-auth Shopify" },
    NOW
  );
  assert.equal(a.owner, "nate");
  assert.equal(a.area, "ops");
  assert.equal(a.source, "alert");
  assert.equal(a.alert_key, "ops:connector:t1:shopify");
  assert.equal(a.due, "2026-10-29");
  const b = await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:connector:t1:shopify", title: "Re-auth Shopify" },
    NOW
  );
  assert.equal(b.id, a.id);
  assert.equal(sb.db.tasks.length, 1);
  assert.equal(sb.db.events.length, 1); // the second call wrote nothing
  await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:job:qualify", title: "Qualify failing" },
    NOW
  );
  assert.equal(sb.db.tasks.length, 2); // a different alert is a different task
  await T.updateTask(sb, ACTOR, "ui", a.id, { status: "done" }, NOW);
  const c = await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:connector:t1:shopify", title: "Re-auth Shopify" },
    NOW
  );
  assert.notEqual(c.id, a.id); // closed -> a new one may open
  await assert.rejects(
    () => T.createOpsTask(sb, ACTOR, "ui", { alertKey: " ", title: "x" }, NOW),
    /alertKey/
  );
});

test("createOpsTask: ops:ticket:<id> is ticket:platform:<id>; a done+synced task is returned, not re-spawned", async () => {
  const sb = fakeSb();
  const a = await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:ticket:u1", title: "Ticket" },
    NOW
  );
  assert.equal(a.alert_key, "ticket:platform:u1"); // the job's key, so the fire button and the job share a task
  assert.equal(
    (await T.createOpsTask(sb, ACTOR, "ui", { alertKey: "ticket:platform:u1", title: "t" }, NOW))
      .id,
    a.id
  );
  // done in HQ but not yet pushed: a fire may still open a new task (the pre-sync behaviour)
  await T.updateTask(sb, ACTOR, "ui", a.id, { status: "done" }, NOW);
  const b = await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:ticket:u1", title: "Ticket" },
    NOW
  );
  assert.notEqual(b.id, a.id);
  // done and pushed: the next fire for the same ticket returns it and inserts nothing
  const sb2 = fakeSb({
    tasks: [
      {
        id: "t-old",
        alert_key: "ticket:platform:u2",
        status: "done",
        synced_at: "2026-10-27T12:00:00Z",
      },
    ],
  });
  const got = await T.createOpsTask(
    sb2,
    ACTOR,
    "ui",
    { alertKey: "ops:ticket:u2", title: "Ticket" },
    NOW
  );
  assert.equal(got.id, "t-old");
  assert.equal(sb2.db.tasks.length, 1);
  // a non-ticket key is untouched
  const c = await T.createOpsTask(sb2, ACTOR, "ui", { alertKey: "ops:job:x", title: "x" }, NOW);
  assert.equal(c.alert_key, "ops:job:x");
});

test("addLink accepts https only; addNote / addLink need exactly one target", async () => {
  const sb = fakeSb();
  for (const url of [
    "http://example.com",
    "javascript:alert(1)",
    "ftp://x.test",
    "example.com",
    "",
  ])
    await assert.rejects(() => T.addLink(sb, ACTOR, "ui", { taskId: "t", url }), /https/, url);
  assert.equal(sb.db.links, undefined);
  const l = await T.addLink(sb, ACTOR, "mcp", {
    taskId: "t1",
    url: "https://example.com/doc",
    label: "Doc",
  });
  assert.equal(l.task_id, "t1");
  assert.equal(l.business_id, null);
  assert.equal(l.via, "mcp");
  await assert.rejects(
    () => T.addLink(sb, ACTOR, "ui", { url: "https://example.com" }),
    /exactly one/
  );
  await assert.rejects(
    () => T.addNote(sb, ACTOR, "ui", { taskId: "t", businessId: "b", body: "x" }),
    /exactly one/
  );
  await assert.rejects(() => T.addNote(sb, ACTOR, "ui", { taskId: "t", body: "  " }), /body/);
  const n = await T.addNote(sb, ACTOR, "ui", { clientSlug: "sb", body: "called" });
  assert.equal(n.client_slug, "sb");
});

test("list items: add and set status write events", async () => {
  const sb = fakeSb();
  const i = await T.addListItem(sb, ACTOR, "ui", { list: "warm", business: "hq4-Fake Hardware" });
  assert.equal(i.status, "todo");
  await T.setListItemStatus(sb, ACTOR, "ui", i.id, "reached");
  assert.equal(sb.db.list_items[0].status, "reached");
  await assert.rejects(() => T.setListItemStatus(sb, ACTOR, "ui", i.id, "archived"), /status/);
  await assert.rejects(
    () => T.addListItem(sb, ACTOR, "ui", { list: "friends", business: "x" }),
    /list/
  );
  assert.equal(sb.db.events.length, 2);
});

test("no delete path anywhere in the work code", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = ["app", "lib", "components"].flatMap((d) =>
    readdirSync(root + d, { recursive: true })
      .filter((n) => /\.tsx?$/.test(n))
      .map((n) => root + d + "/" + n)
  );
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /\.delete\(/, f);
});

test("updateTask: done_at marks the move INTO done; re-saving a done task keeps it", async () => {
  const sb = fakeSb({
    tasks: [
      { id: "t1", status: "done", done_at: "2026-10-01T00:00:00.000Z" },
      { id: "t2", status: "doing", done_at: null },
    ],
  });
  await T.updateTask(sb, ACTOR, "ui", "t1", { status: "done" }, NOW);
  assert.equal(sb.db.tasks[0].done_at, "2026-10-01T00:00:00.000Z");
  await T.updateTask(sb, ACTOR, "ui", "t2", { status: "done" }, NOW);
  assert.equal(sb.db.tasks[1].done_at, "2026-10-27T15:00:00.000Z");
  await T.updateTask(sb, ACTOR, "ui", "t1", { status: "todo" }, NOW);
  assert.equal(sb.db.tasks[0].done_at, null);
});

test("UI guards: manual-only create action, waiting_on-driven status, no fire repeated in Your tasks", () => {
  const read = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
  assert.match(read("app/(app)/work/actions.ts"), /source: "manual", alertKey: null/);
  assert.match(
    read("components/WorkTaskDetail.tsx"),
    /waiting\.trim\(\) !== \(task\.waiting_on \?\? ""\)\.trim\(\)/
  );
  assert.match(read("components/TodayNate.tsx"), /!asFire\.has\(`task:\$\{t\.id\}`\)/);
});

test("createOpsTask: the loser of a race (23505 on the open-alert index) gets the winner's task back", async () => {
  const winner = { id: "t-win", alert_key: "ops:job:x", status: "todo" };
  let selects = 0;
  const sb = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        limit: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: ++selects === 1 ? null : winner, error: null }), // winner commits between the two reads
        insert: () => q,
        single: async () => ({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        }),
      };
      return q;
    },
  };
  const got = await T.createOpsTask(sb, ACTOR, "ui", { alertKey: "ops:job:x", title: "x" }, NOW);
  assert.equal(got.id, "t-win");
  // any other insert failure still throws
  sb.from = () => {
    const q = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      limit: () => q,
      order: () => q,
      insert: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: { code: "42501", message: "denied" } }),
    };
    return q;
  };
  await assert.rejects(
    () => T.createOpsTask(sb, ACTOR, "ui", { alertKey: "ops:job:y", title: "y" }, NOW),
    /denied/
  );
});

// ---- v2: client_slug / track_id, unassigned, tracks and the board ------------------------

const TR = await import("../lib/tracks.ts");
const TRACK_A = "44444444-4444-4444-8444-444444444441";

test("createTask / updateTask accept client_slug and track_id (and an unassigned owner)", async () => {
  const sb = fakeSb();
  const t = await T.createTask(
    sb,
    ACTOR,
    "ui",
    { title: "Send invoice", owner: null, clientSlug: "acme-demo", trackId: TRACK_A },
    NOW
  );
  assert.deepEqual([t.owner, t.client_slug, t.track_id], [null, "acme-demo", TRACK_A]);
  const u = await T.updateTask(
    sb,
    ACTOR,
    "ui",
    t.id,
    { owner: "brandon", client_slug: null, track_id: null },
    NOW
  );
  assert.deepEqual([u.owner, u.client_slug, u.track_id], ["brandon", null, null]);
  await T.updateTask(sb, ACTOR, "ui", t.id, { owner: null, client_slug: "other" }, NOW);
  assert.deepEqual([sb.db.tasks[0].owner, sb.db.tasks[0].client_slug], [null, "other"]);
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owner: "nate", clientSlug: "Not A Slug" }),
    /client_slug/
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owner: "nate", trackId: "nope" }),
    /track_id/
  );
  assert.throws(() => T.buildTaskPatch({ track_id: "nope" }, NOW), /track_id/);
  // the UI create action passes both through
  const actions = readFileSync(
    fileURLToPath(new URL("../app/(app)/work/actions.ts", import.meta.url)),
    "utf8"
  );
  assert.match(actions, /\.\.\.t, source: "manual"/);
});

test("workGroups: Unassigned first, then nate / brandon / claude; empty groups are left out", () => {
  const mk = (id, owner, status = "todo", due = null) => ({
    id,
    owner,
    status,
    due,
    created_at: "x",
  });
  const g = T.workGroups([
    mk("a", "claude"),
    mk("b", null),
    mk("c", "nate", "todo", "2026-10-30"),
    mk("d", "nate", "doing"),
  ]);
  assert.deepEqual(
    g.map((x) => [x.key, x.label, x.tasks.map((t) => t.id)]),
    [
      ["unassigned", "Unassigned", ["b"]],
      ["nate", "Nate", ["d", "c"]],
      ["claude", "Claude", ["a"]],
    ]
  );
});

test("humanDay: today, a weekday within 6 days, else month + day", () => {
  assert.equal(T.humanDay("2026-10-27", "2026-10-27"), "today");
  assert.equal(T.humanDay("2026-10-28", "2026-10-27"), "Wed");
  assert.equal(T.humanDay("2026-11-02", "2026-10-27"), "Mon");
  assert.equal(T.humanDay("2026-11-03", "2026-10-27"), "Nov 3");
  assert.equal(T.humanDay("2026-10-24", "2026-10-27"), "Oct 24"); // overdue shows the date
});

test("board: Done column = tracks with done_at in the last 7 days; steps ride their track, open first", () => {
  const day = 86_400_000;
  const ago = (d) => new Date(NOW.getTime() - d * day).toISOString();
  const track = (id, column, done_at = null) => ({ id, name: id, column, done_at });
  const tracks = [
    track("now1", "now"),
    track("next1", "next"),
    track("wait1", "wait"),
    track("fresh", "done", ago(6.5)),
    track("stale", "done", ago(7.5)),
    track("nodate", "done"),
  ];
  const tasks = [
    { id: "s1", track_id: "now1", status: "done" },
    { id: "s2", track_id: "now1", status: "todo" },
    { id: "s3", track_id: null, status: "todo" },
  ];
  const b = TR.buildBoard(tracks, tasks, NOW);
  assert.deepEqual(Object.keys(b), ["now", "next", "wait", "done"]);
  assert.deepEqual(
    b.done.map((c) => c.track.id),
    ["fresh"]
  );
  assert.deepEqual(
    b.now[0].steps.map((s) => s.id),
    ["s2", "s1"]
  );
  assert.deepEqual([b.next.length, b.wait.length], [1, 1]);
});

test("tracks: create / move / update write the row and an events row; done stamps done_at, leaving clears it; no delete", async () => {
  const sb = fakeSb();
  const t = await TR.createTrack(sb, ACTOR, "mcp", { name: " Pilot ", area: "client" }, NOW);
  assert.deepEqual([t.name, t.column, t.done_at], ["Pilot", "next", null]);
  const done = await TR.moveTrack(sb, ACTOR, "ui", t.id, "done", NOW);
  assert.equal(done.done_at, "2026-10-27T15:00:00.000Z");
  const later = new Date("2026-11-01T00:00:00Z"); // done -> done keeps done_at and writes no second event
  assert.equal(
    (await TR.moveTrack(sb, ACTOR, "ui", t.id, "done", later)).done_at,
    "2026-10-27T15:00:00.000Z"
  );
  assert.equal(sb.db.events.filter((e) => e.kind === "track.moved").length, 1);
  assert.equal((await TR.moveTrack(sb, ACTOR, "ui", t.id, "now", NOW)).done_at, null);
  assert.equal(
    (await TR.updateTrack(sb, ACTOR, "ui", t.id, { name: "Pilot 2", client_slug: "acme-demo" }))
      .client_slug,
    "acme-demo"
  );
  assert.deepEqual(
    sb.db.events.map((e) => [e.kind, e.via]),
    [
      ["track.created", "mcp"],
      ["track.moved", "ui"],
      ["track.moved", "ui"],
      ["track.updated", "ui"],
    ]
  );
  await assert.rejects(() => TR.moveTrack(sb, ACTOR, "ui", t.id, "later"), /column/);
  await assert.rejects(() => TR.createTrack(sb, ACTOR, "ui", { name: " " }), /name/);
  await assert.rejects(() => TR.createTrack(sb, ACTOR, "ui", { name: "x", area: "bogus" }), /area/);
  await assert.rejects(() => TR.updateTrack(sb, ACTOR, "ui", t.id, {}), /nothing to update/);
});

test("todaySteps: only mine, due by today or doing, plus done today; undated todo and others' tasks stay off", () => {
  const t = (o) => ({
    id: o.id,
    title: o.id,
    body: null,
    owner: null,
    area: null,
    status: "todo",
    due: null,
    source: "manual",
    business_id: null,
    client_slug: null,
    track_id: null,
    alert_key: null,
    waiting_on: null,
    done_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...o,
  });
  const tasks = [
    t({ id: "due-today", owner: "nate", due: "2026-10-28" }),
    t({ id: "overdue", owner: "nate", due: "2026-10-20" }),
    t({ id: "doing-undated", owner: "nate", status: "doing" }),
    t({ id: "done-today", owner: "nate", status: "done", done_at: "2026-10-28T14:00:00Z" }),
    t({ id: "done-yesterday", owner: "nate", status: "done", done_at: "2026-10-27T14:00:00Z" }),
    // 11pm New York on Oct 27 is already Oct 28 in UTC: it belongs to the 27th
    t({ id: "done-late-27", owner: "nate", status: "done", done_at: "2026-10-28T03:00:00Z" }),
    t({ id: "tomorrow", owner: "nate", due: "2026-10-29" }),
    t({ id: "undated-todo", owner: "nate" }),
    t({ id: "brandons", owner: "brandon", due: "2026-10-28" }),
    t({ id: "unassigned", due: "2026-10-28" }),
  ];
  assert.deepEqual(
    T.todaySteps(tasks, "nate", "2026-10-28").map((x) => x.id),
    ["due-today", "overdue", "doing-undated", "done-today"]
  );
  assert.deepEqual(
    T.todaySteps(tasks, "brandon", "2026-10-28").map((x) => x.id),
    ["brandons"]
  );
  assert.deepEqual(
    T.todaySteps(tasks, "nate", "2026-10-27")
      .filter((x) => x.status === "done")
      .map((x) => x.id),
    ["done-today", "done-yesterday", "done-late-27"]
  );
});
