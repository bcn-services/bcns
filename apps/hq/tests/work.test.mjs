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
