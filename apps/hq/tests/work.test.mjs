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
  assert.equal("done_at" in T.buildTaskPatch({ owners: ["brandon"] }, NOW), false);
});

test("buildTaskPatch: owners must be nate|brandon|claude; empty patch, bad status and bad due throw", () => {
  assert.deepEqual(T.buildTaskPatch({ owners: ["claude"] }, NOW).owners, ["claude"]);
  assert.deepEqual(T.buildTaskPatch({ owners: ["nate", "brandon", "nate"] }, NOW).owners, ["nate", "brandon"]);
  assert.deepEqual(T.buildTaskPatch({ owners: [] }, NOW).owners, []);
  assert.throws(() => T.buildTaskPatch({ owners: ["mallory"] }, NOW), /owner/);
  assert.throws(() => T.buildTaskPatch({ owners: ["nate", "mallory"] }, NOW), /owner/);
  assert.throws(() => T.buildTaskPatch({}, NOW), /nothing to update/);
  assert.throws(() => T.buildTaskPatch({ status: "cancelled" }, NOW), /status/);
  assert.throws(() => T.buildTaskPatch({ due: "tomorrow" }, NOW), /due/);
  assert.equal(T.buildTaskPatch({ due: "" }, NOW).due, null);
});

test("owner cycle, waiting status, list status cycle, grouping and filters", () => {
  assert.deepEqual(
    [["nate"], ["brandon"], ["claude"], []].map((o) => T.nextOwner(o)),
    [["brandon"], ["claude"], ["nate"], ["nate"]]
  );
  // the first owner steps, the rest stay (and a step onto a co-owner does not duplicate it)
  assert.deepEqual(T.nextOwner(["nate", "claude"]), ["brandon", "claude"]);
  assert.deepEqual(T.nextOwner(["nate", "brandon"]), ["brandon"]);
  assert.deepEqual(T.assertOwners("brandon"), ["brandon"]); // the old single-owner shape
  assert.deepEqual([T.assertOwners(""), T.assertOwners(null), T.assertOwners(undefined)], [[], [], []]);
  assert.equal(T.waitingStatus("nate", "todo"), "waiting");
  assert.equal(T.waitingStatus("", "waiting"), "todo");
  assert.equal(T.waitingStatus("", "doing"), undefined);
  assert.equal(T.waitingStatus("nate", "done"), undefined);
  assert.deepEqual(
    ["todo", "reached", "scheduled", "done", "no"].map((s) => T.nextListStatus(s)),
    ["reached", "scheduled", "done", "no", "todo"]
  );
  const t = (id, owner, status, due, area = "ops") => ({ id, owners: [].concat(owner), status, due, area });
  const all = [
    t(1, "nate", "todo", "2026-11-01"),
    t(2, "nate", "doing", null),
    t(3, "nate", "todo", "2026-10-28"),
    t(4, "claude", "done", null, "leads"),
    t(5, ["brandon", "nate"], "todo", "2026-10-29"),
  ];
  const g = T.groupByOwner(all);
  assert.deepEqual(
    g.map((x) => x.owner),
    ["nate", "brandon", "claude"]
  );
  assert.deepEqual(
    g[0].tasks.map((x) => x.id),
    [2, 3, 1]
  ); // doing first, then todo by due; task 5 sits under its first owner (brandon) only
  assert.deepEqual(g[1].tasks.map((x) => x.id), [5]);
  assert.deepEqual(
    T.filterTasks(all, { owner: "nate" }).map((x) => x.id),
    [1, 2, 3, 5]
  ); // the owner filter matches any co-owner
  assert.deepEqual(
    T.filterTasks(all, {}).map((x) => x.id),
    [1, 2, 3, 5]
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
    { title: "  Write pitch ", owners: ["claude"], area: "leads", due: "2026-10-30" },
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
    () => T.createTask(sb, ACTOR, "ui", { title: "  ", owners: ["nate"] }),
    /title/
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owners: ["nobody"] }),
    /owner/
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owners: ["nate"], area: "bogus" }),
    /area/
  );
});

test("a failing write throws instead of reporting success", async () => {
  await assert.rejects(
    () =>
      T.createTask(fakeSb({}, { failOn: { tasks: "boom" } }), ACTOR, "ui", {
        title: "x",
        owners: ["nate"],
      }),
    /boom/
  );
  await assert.rejects(
    () =>
      T.createTask(fakeSb({}, { failOn: { events: "no audit" } }), ACTOR, "ui", {
        title: "x",
        owners: ["nate"],
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
    assert.deepEqual(t.owners, ["claude"]);
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
  assert.deepEqual(a.owners, ["nate"]);
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
  // done in HQ but not yet pushed: still that task (a new one would bury its resolution from the job)
  await T.updateTask(sb, ACTOR, "ui", a.id, { status: "done" }, NOW);
  const b = await T.createOpsTask(
    sb,
    ACTOR,
    "ui",
    { alertKey: "ops:ticket:u1", title: "Ticket" },
    NOW
  );
  assert.equal(b.id, a.id);
  assert.equal(sb.db.tasks.length, 1);
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

test("UI guards: create action pins source (manual, or lead with a business), waiting_on-driven status, no fire repeated in Your tasks", () => {
  const read = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
  assert.match(read("app/(app)/work/actions.ts"), /source: t\.businessId \? "lead" : "manual", alertKey: null/);
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
    { title: "Send invoice", owners: [], clientSlug: "acme-demo", trackId: TRACK_A },
    NOW
  );
  assert.deepEqual([t.owners, t.client_slug, t.track_id], [[], "acme-demo", TRACK_A]);
  const u = await T.updateTask(
    sb,
    ACTOR,
    "ui",
    t.id,
    { owners: ["brandon"], client_slug: null, track_id: null },
    NOW
  );
  assert.deepEqual([u.owners, u.client_slug, u.track_id], [["brandon"], null, null]);
  await T.updateTask(sb, ACTOR, "ui", t.id, { owners: [], client_slug: "other" }, NOW);
  assert.deepEqual([sb.db.tasks[0].owners, sb.db.tasks[0].client_slug], [[], "other"]);
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owners: ["nate"], clientSlug: "Not A Slug" }),
    /client_slug/
  );
  await assert.rejects(
    () => T.createTask(sb, ACTOR, "ui", { title: "x", owners: ["nate"], trackId: "nope" }),
    /track_id/
  );
  assert.throws(() => T.buildTaskPatch({ track_id: "nope" }, NOW), /track_id/);
  // the UI create action passes both through
  const actions = readFileSync(
    fileURLToPath(new URL("../app/(app)/work/actions.ts", import.meta.url)),
    "utf8"
  );
  assert.match(actions, /\.\.\.t, source: t\.businessId \? "lead" : "manual"/);
});

test("workGroups: Unassigned first, then nate / brandon / claude; empty groups are left out", () => {
  const mk = (id, owner, status = "todo", due = null) => ({
    id,
    owners: [].concat(owner ?? []),
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

test("tracks: create / update write the row and an events row; fixed names only; no delete", async () => {
  const sb = fakeSb();
  const t = await TR.createTrack(sb, ACTOR, "mcp", { name: " Software ", area: "client" }, NOW);
  assert.deepEqual([t.name, t.column, t.done_at], ["Software", "next", null]);
  assert.equal(TR.moveTrack, undefined); // columns are task phases; nothing moves a track
  assert.equal(
    (await TR.updateTrack(sb, ACTOR, "ui", t.id, { name: "Ops", client_slug: "acme-demo" }))
      .client_slug,
    "acme-demo"
  );
  assert.deepEqual(
    sb.db.events.map((e) => [e.kind, e.via]),
    [
      ["track.created", "mcp"],
      ["track.updated", "ui"],
    ]
  );
  await assert.rejects(() => TR.createTrack(sb, ACTOR, "ui", { name: "Ops", column: "later" }), /column/);
  await assert.rejects(() => TR.createTrack(sb, ACTOR, "ui", { name: " " }), /name/);
  await assert.rejects(() => TR.createTrack(sb, ACTOR, "ui", { name: "Ops", area: "bogus" }), /area/);
  await assert.rejects(() => TR.createTrack(sb, ACTOR, "ui", { name: "Pilot" }), /tracks are fixed/);
  await assert.rejects(() => TR.updateTrack(sb, ACTOR, "ui", t.id, { name: "Pilot" }), /tracks are fixed/);
  await assert.rejects(() => TR.updateTrack(sb, ACTOR, "ui", t.id, {}), /nothing to update/);
});

test("todayQueue: mine only; queue = doing first, then due within 7d soonest first then oldest created, cap 8; waiting split; done within 7 days", () => {
  const t = (o) => ({
    id: o.id,
    title: o.id,
    body: null,
    owners: ["nate"],
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
    created_at: "2026-10-10T00:00:00Z",
    ...o,
  });
  const ids = (l) => l.map((x) => x.id);
  const tasks = [
    t({ id: "old-undated", created_at: "2026-09-01T00:00:00Z" }),
    t({ id: "new-undated", created_at: "2026-10-20T00:00:00Z" }),
    t({ id: "due-in-7", due: "2026-11-04" }),
    t({ id: "due-in-8", due: "2026-11-05", created_at: "2026-10-01T00:00:00Z" }),
    t({ id: "overdue", due: "2026-10-20" }),
    t({ id: "due-today", due: "2026-10-28", status: "doing" }),
    t({ id: "waiting-status", status: "waiting", due: "2026-10-29" }),
    t({ id: "waiting-on", waiting_on: "Brandon" }),
    t({ id: "blank-waiting-on", waiting_on: "  ", created_at: "2026-10-25T00:00:00Z" }),
    t({ id: "done-6d", status: "done", done_at: "2026-10-22T14:00:00Z" }),
    t({ id: "done-8d", status: "done", done_at: "2026-10-20T14:00:00Z" }),
    // 11pm New York on Oct 21 is already Oct 22 in UTC: it belongs to the 21st, which is inside the window
    t({ id: "done-edge", status: "done", done_at: "2026-10-22T03:00:00Z" }),
    t({ id: "brandons", owners: ["brandon"], due: "2026-10-28" }),
    t({ id: "unowned", owners: [], due: "2026-10-28" }),
    t({ id: "shared", owners: ["brandon", "nate"], due: "2026-10-28" }),
    t({ id: "shared-done", owners: ["brandon", "nate"], status: "done", done_at: "2026-10-27T14:00:00Z" }),
  ];
  const r = T.todayQueue(tasks, "nate", "2026-10-28");
  assert.deepEqual(ids(r.queue), [
    "due-today", // doing ranks first
    "overdue",
    "shared", // co-owned with brandon: in nate's queue too
    "due-in-7",
    "old-undated",
    "due-in-8",
    "new-undated",
    "blank-waiting-on",
  ]);
  assert.deepEqual(ids(r.waiting), ["waiting-status", "waiting-on"]);
  assert.deepEqual(ids(r.done), ["done-6d", "done-edge", "shared-done"]);
  assert.deepEqual(ids(T.todayQueue(tasks, "brandon", "2026-10-28").queue), ["brandons", "shared"]);
  assert.deepEqual(ids(T.todayQueue(tasks, "brandon", "2026-10-28").done), ["shared-done"]);
  // cap 8: the newest undated fall off, the due-soon ones stay
  const many = Array.from({ length: 12 }, (_, i) =>
    t({ id: `u${i}`, created_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z` })
  );
  const capped = T.todayQueue([...many, t({ id: "soon", due: "2026-10-30" })], "nate", "2026-10-28").queue;
  assert.equal(capped.length, 8);
  assert.deepEqual(ids(capped).slice(0, 3), ["soon", "u0", "u1"]);
  assert.equal(ids(capped).at(-1), "u6");
  // an undated doing task (Now on the board) never falls past the cap
  const withDoing = T.todayQueue([...many, t({ id: "doing-new", status: "doing", created_at: "2026-10-27T00:00:00Z" })], "nate", "2026-10-28").queue;
  assert.equal(ids(withDoing)[0], "doing-new");
  // waiting is uncapped
  const w = Array.from({ length: 12 }, (_, i) => t({ id: `w${i}`, status: "waiting" }));
  assert.equal(T.todayQueue(w, "nate", "2026-10-28").waiting.length, 12);
});

test("updateTask resolution: trimmed, capped at 4000, null or blank clears; an over-cap value writes nothing", async () => {
  assert.equal(T.buildTaskPatch({ resolution: "  fixed it \n" }, NOW).resolution, "fixed it");
  assert.equal(T.buildTaskPatch({ resolution: "x".repeat(4000) }, NOW).resolution.length, 4000);
  assert.throws(() => T.buildTaskPatch({ resolution: "x".repeat(4001) }, NOW), /resolution/);
  assert.equal(T.buildTaskPatch({ resolution: null }, NOW).resolution, null);
  assert.equal(T.buildTaskPatch({ resolution: "   " }, NOW).resolution, null);
  assert.equal("resolution" in T.buildTaskPatch({ owners: ["nate"] }, NOW), false);
  const sb = fakeSb();
  const t = await T.createTask(sb, ACTOR, "ui", { title: "ticket", owners: ["nate"] }, NOW);
  await T.updateTask(sb, ACTOR, "ui", t.id, { status: "done", resolution: " Reset your password. " }, NOW);
  assert.equal(sb.db.tasks[0].resolution, "Reset your password.");
  assert.equal(sb.db.tasks[0].status, "done");
  await assert.rejects(() => T.updateTask(sb, ACTOR, "ui", t.id, { resolution: "x".repeat(4001) }, NOW), /resolution/);
  assert.equal(sb.db.tasks[0].resolution, "Reset your password.");
});

test("a task with a business is source lead; with a business AND a client it is refused", async () => {
  const sb = fakeSb();
  const BIZ = "33333333-3333-4333-8333-333333333333";
  const t = await T.createTask(sb, ACTOR, "ui", { title: "Call John", businessId: BIZ });
  assert.equal(t.source, "lead");
  assert.equal(t.business_id, BIZ);
  await assert.rejects(T.createTask(sb, ACTOR, "ui", { title: "x", businessId: BIZ, clientSlug: "acme" }), /lead or a client/);
});
