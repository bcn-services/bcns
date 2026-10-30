/**
 * mcp-tools.test.mjs — the HQ MCP tool surface (lib/mcp/tools.ts) against a fake Supabase client.
 * The fake records every table + op, so the safety properties are asserted on what was actually issued:
 * Claude proposes, it never updates businesses.stage or writes finance_inputs (create_lead only inserts a new lead), never decides, never deletes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS, stripContacts } from "../lib/mcp/tools.ts";
import { handleMcp } from "../lib/mcp/server.ts";
import { mcpFake } from "./_mcp-fake.mjs";

delete process.env.HQ_LATE_STAGES;
const ACTOR = { id: "11111111-1111-4111-8111-111111111111", handle: "nate" };
const BIZ = "22222222-2222-4222-8222-222222222222";
const T_NATE = "33333333-3333-4333-8333-333333333331";
const T_CLAUDE = "33333333-3333-4333-8333-333333333332";
const T_BRANDON = "33333333-3333-4333-8333-333333333333";
const TRACK = "44444444-4444-4444-8444-444444444441";
const ADMIN = { id: "55555555-5555-4555-8555-555555555555", handle: "brandon" };
const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
const call = (sb, name, args = {}) => byName[name].run({ sb, actor: ACTOR }, args);

const seed = () =>
  mcpFake({
    tasks: [
      {
        id: T_NATE,
        title: "send quote",
        owners: ["nate"],
        status: "todo",
        area: "ops",
        due: "2026-10-01",
        waiting_on: null,
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: T_CLAUDE,
        title: "draft notes",
        owners: ["claude"],
        status: "todo",
        area: "ops",
        due: "2026-10-02",
        waiting_on: null,
        created_at: "2026-09-02T00:00:00Z",
      },
    ],
    businesses: [
      {
        id: BIZ,
        name: "Hartwell Fixture Works",
        trade: "plumbing",
        town: "Testville",
        state: "CA",
        stage: "qualified",
        fit_score: 7,
        assigned_to: "brandon",
        next_contact_at: "2026-10-05",
        phone: "PHONE-SENTINEL",
        domain: "hartwell.example.test",
        research: JSON.stringify({
          summary: "small shop",
          owner_email: "EMAIL-SENTINEL@example.test",
          contacts: [
            {
              name: "NAME-SENTINEL",
              phone: "PHONE-SENTINEL",
              email: "EMAIL-SENTINEL@example.test",
            },
          ],
          nested: {
            deep: {
              Phone_Number: "PHONE-SENTINEL",
              mobile: "PHONE-SENTINEL",
              note: "reach us at EMAIL-SENTINEL@example.test today",
            },
          },
        }),
      },
    ],
    calls: [
      {
        business_id: BIZ,
        by: "brandon",
        at: "2026-09-20T00:00:00Z",
        outcome: "reached",
        note: "mail EMAIL-SENTINEL@example.test",
      },
    ],
    notes: [{ business_id: BIZ, body: "likes quotes", created_at: "2026-09-21T00:00:00Z" }],
    links: [],
    clients: [
      {
        slug: "acme-demo",
        display_name: "Acme Demo",
        kind: "deluxe",
        stage: "live",
        health: "ok",
        owner: "nate",
        churn_date: null,
        contact_email: "EMAIL-SENTINEL@example.test",
      },
    ],
    proposals: [],
    finance_inputs: [{ week: "2026-10-05", channel: "web", spend_cents: 5000, hours: 2 }],
    events: [],
  });

const writes = (fake) => fake.ops.filter((o) => o.op !== "select");

/** seed() + a brandon task, the profiles the done rule reads (brandon admin, nate staff) and one track. */
const withTeam = () => {
  const fake = seed();
  fake.db.tasks.push({
    id: T_BRANDON,
    title: "call the supplier",
    owners: ["brandon"],
    status: "todo",
    area: "ops",
    due: null,
    waiting_on: null,
    created_at: "2026-09-03T00:00:00Z",
  });
  fake.db.profiles = [
    { id: ACTOR.id, role: "staff", handle: "nate" },
    { id: ADMIN.id, role: "admin", handle: "brandon" },
  ];
  fake.db.tracks = [
    { id: TRACK, name: "Warm contacts", area: "warm", client_slug: null, column: "now", done_at: null, created_at: "2026-09-01T00:00:00Z" },
  ];
  return fake;
};
const as = (actor, sb, name, args = {}) => byName[name].run({ sb, actor }, args);

test("exactly the 17 tools, and none is named like an approve / decide / delete", () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
    "add_link",
    "add_task_note",
    "create_lead",
    "create_task",
    "get_client",
    "get_lead",
    "get_task",
    "list_board",
    "list_tasks",
    "log_lead_note",
    "propose_client",
    "propose_finance",
    "propose_lead_stage",
    "search_leads",
    "today",
    "update_task",
    "update_track",
  ]);
  assert.equal(TOOLS.length, 17);
  assert.equal(TOOLS.filter((t) => /approve|decide|delete/i.test(t.name)).length, 0);
});

test("update_task -> done: a staff caller closing another human's task is refused naming the owner, with no write", async () => {
  const fake = withTeam();
  await assert.rejects(
    call(fake, "update_task", { id: T_BRANDON, status: "done" }),
    /refused: this task is owned by brandon/
  );
  assert.equal(writes(fake).length, 0);
  assert.equal(fake.db.tasks.find((t) => t.id === T_BRANDON).status, "todo");
});

test("update_task: staff reassigning another human's task is refused (so a refused close cannot be dodged by taking the task); admin and the owner may", async () => {
  const fake = withTeam();
  await assert.rejects(
    call(fake, "update_task", { id: T_BRANDON, owner: "nate" }), // nate (staff) takes brandon's task
    /refused: this task is owned by brandon; only brandon or an admin can reassign it/
  );
  assert.deepEqual(fake.db.tasks.find((t) => t.id === T_BRANDON).owners, ["brandon"]);
  assert.equal(writes(fake).length, 0);
  const other = withTeam(); // brandon (admin) may reassign nate's task; staff may hand off their own
  assert.deepEqual((await as(ADMIN, other, "update_task", { id: T_NATE, owner: "brandon" })).task.owners, ["brandon"]);
  assert.deepEqual((await call(withTeam(), "update_task", { id: T_NATE, owner: "claude" })).task.owners, ["claude"]);
});

test("update_task -> done: an admin closes brandon's task; staff close their own; a role-less caller is staff", async () => {
  const fake = withTeam();
  const closed = await as(ADMIN, fake, "update_task", { id: T_NATE, status: "done" }); // admin closes nate's
  assert.equal(closed.task.status, "done");
  const mine = await as(ADMIN, fake, "update_task", { id: T_BRANDON, status: "done" }); // brandon closes his own
  assert.equal(mine.task.status, "done");
  assert.ok(mine.task.done_at);
  const own = withTeam(); // nate (staff) closes his own
  assert.equal((await call(own, "update_task", { id: T_NATE, status: "done" })).task.status, "done");
  const noProfile = seed(); // no profiles row at all: staff, so another human's task is refused
  noProfile.db.tasks.find((t) => t.id === T_CLAUDE).owners = ["brandon"];
  await assert.rejects(call(noProfile, "update_task", { id: T_CLAUDE, status: "done" }), /owned by brandon/);
});

test("update_task -> done is allowed for a task owned by claude, as via=mcp", async () => {
  const fake = seed();
  const { task } = await call(fake, "update_task", { id: T_CLAUDE, status: "done" });
  assert.equal(task.status, "done");
  const upd = writes(fake).find((o) => o.table === "tasks" && o.op === "update");
  assert.equal(upd.payload.status, "done");
  const ev = writes(fake).find((o) => o.table === "events");
  assert.equal(ev.payload.via, "mcp");
  assert.equal(ev.payload.actor, ACTOR.id);
});

test("update_task reads the CURRENT owner: a task reassigned to brandon is refused, an unknown id is not found", async () => {
  const fake = seed();
  fake.db.tasks.find((t) => t.id === T_CLAUDE).owners = ["brandon"];
  await assert.rejects(
    call(fake, "update_task", { id: T_CLAUDE, status: "done" }),
    /owned by brandon/
  );
  await assert.rejects(
    call(fake, "update_task", { id: "33333333-3333-4333-8333-333333333399", status: "done" }),
    /task not found/
  );
});

test("update_task: non-done changes on anyone's task are allowed; invalid input is rejected before any query", async () => {
  const fake = seed();
  const { task } = await call(fake, "update_task", {
    id: T_NATE,
    status: "doing",
    waiting_on: "brandon",
  });
  assert.equal(task.status, "doing");
  assert.equal(task.waiting_on, "brandon");
  const before = fake.ops.length;
  await assert.rejects(call(fake, "update_task", { id: "not-a-uuid", status: "done" }));
  await assert.rejects(call(fake, "update_task", { id: T_NATE, status: "archived" }));
  assert.equal(fake.ops.length, before, "nothing was queried");
  const strict = await call(fake, "update_task", { id: T_NATE, assigned_to: "claude", status: "todo" }); // unknown keys are dropped, not applied
  assert.deepEqual(strict.task.owners, ["nate"]);
  await assert.rejects(call(fake, "update_task", { id: T_NATE, owner: "mallory" })); // owner is nate|brandon|claude
});

test("update_task reassigns nate -> brandon and sets client_slug / track_id, via=mcp", async () => {
  const fake = withTeam();
  const { task } = await call(fake, "update_task", {
    id: T_NATE,
    owner: "brandon",
    client_slug: "acme-demo",
    track_id: TRACK,
  });
  assert.deepEqual(task.owners, ["brandon"]);
  assert.equal(task.client_slug, "acme-demo");
  assert.equal(task.track_id, TRACK);
  const ev = fake.db.events.find((e) => e.kind === "task.updated");
  assert.deepEqual([ev.via, ev.actor], ["mcp", ACTOR.id]);
  const cleared = await call(fake, "update_task", { id: T_NATE, client_slug: null, track_id: null });
  assert.deepEqual([cleared.task.client_slug, cleared.task.track_id], [null, null]);
  await assert.rejects(call(fake, "update_task", { id: T_NATE, client_slug: "Not A Slug" }));
});

test("create_task takes client_slug and track_id; add_task_note writes notes(task_id, body, actor, via=mcp) and get_task shows it", async () => {
  const fake = withTeam();
  const { task } = await call(fake, "create_task", {
    title: "send invoice",
    owner: "brandon",
    due: "2026-10-30",
    client_slug: "acme-demo",
    track_id: TRACK,
  });
  assert.deepEqual([task.owners, task.client_slug, task.track_id, task.due, task.via], [["brandon"], "acme-demo", TRACK, "2026-10-30", "mcp"]);
  await call(fake, "add_task_note", { id: task.id, body: "waiting on PO number" });
  const row = fake.db.notes.find((n) => n.body === "waiting on PO number");
  assert.deepEqual([row.task_id, row.actor, row.via], [task.id, ACTOR.id, "mcp"]);
  assert.equal(row.business_id ?? null, null);
  const got = await call(fake, "get_task", { id: task.id });
  assert.deepEqual(got.notes.map((n) => [n.body, n.via]), [["waiting on PO number", "mcp"]]);
  await assert.rejects(call(fake, "add_task_note", { id: task.id, body: "" }));
  await assert.rejects(call(fake, "create_task", { title: "x", track_id: "nope" }));
});

test("board tools: no create_track or move_track, update_track, list_board by task phase; none deletes", async () => {
  const fake = withTeam();
  assert.equal(byName.create_track, undefined);
  assert.equal(byName.move_track, undefined);
  const track = { id: TRACK }; // seeded "Warm contacts": not a fixed name, so off the board until renamed
  assert.ok(!(await call(fake, "list_board")).board.now.some((c) => c.id === TRACK));
  const renamed = await call(fake, "update_track", { id: track.id, name: "Marketing", client_slug: null });
  assert.equal(renamed.track.name, "Marketing");
  await assert.rejects(call(fake, "update_track", { id: track.id, name: "Q4 pilot" }), /tracks are fixed/);
  await assert.rejects(call(fake, "update_track", { id: track.id }), /nothing to update/);
  await call(fake, "update_task", { id: T_NATE, track_id: TRACK, client_slug: "acme-demo" });
  const { board } = await call(fake, "list_board");
  assert.deepEqual(Object.keys(board), ["now", "next", "wait", "done"]);
  const warm = board.now.find((c) => c.id === TRACK); // T_NATE is overdue -> Now
  assert.equal(warm.column, "now");
  assert.deepEqual(warm.steps.map((x) => [x.id, x.client_slug]), [[T_NATE, "acme-demo"]]);
  const last = board.now.at(-1);
  assert.deepEqual([last.id, last.name], ["unassigned", "Miscellaneous"]); // tasks with no track
  assert.deepEqual(last.steps.map((x) => x.id), [T_CLAUDE]); // due 2026-10-02: overdue -> Now
  assert.deepEqual(board.next.map((c) => [c.id, c.column, c.steps.map((x) => x.id)]), [["unassigned", "next", [T_BRANDON]]]); // no due
  assert.ok(writes(fake).every((o) => o.op !== "delete"));
  for (const e of fake.db.events) assert.equal(e.via, "mcp");
});

test("tools/list: create_task, update_task, add_task_note open with an imperative and name nate|brandon|claude and YYYY-MM-DD", async () => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const req = new Request("http://hq.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  const res = await handleMcp(req, { sb: seed(), actor: ACTOR }, body);
  const rows = (await res.json()).result.tools.map((t) => [t.name, t.description]);
  for (const name of ["create_task", "update_task", "add_task_note"]) {
    const d = rows.find(([n]) => n === name)[1];
    assert.match(d, /^(Create|Reassign|Add|Update|Close)\b/, name);
    assert.ok(d.includes("nate|brandon|claude"), `${name}: owners`);
    assert.ok(d.includes("YYYY-MM-DD"), `${name}: date format`);
  }
  for (const name of ["create_task", "update_task", "list_board"])
    assert.match(rows.find(([n]) => n === name)[1], /Tracks are fixed: Software, Outreach, Marketing, Clients, Ops/, name);
  for (const name of ["list_board", "update_track"])
    assert.ok(rows.some(([n]) => n === name), name);
});

test("propose_lead_stage inserts a pending proposal with old = the current stage, via mcp, and writes nothing else", async () => {
  const fake = seed();
  const out = await call(fake, "propose_lead_stage", {
    business_id: BIZ,
    stage: "attempted",
    reason: "tried twice",
  });
  assert.equal(out.status, "pending");
  assert.equal(out.from, "qualified");
  const w = writes(fake);
  const ins = w.find((o) => o.table === "proposals");
  assert.deepEqual(ins.payload, {
    kind: "lead_stage",
    target_id: BIZ,
    field: "stage",
    old: "qualified",
    new: "attempted",
    reason: "tried twice",
    status: "pending",
    created_by: ACTOR.id,
    via: "mcp",
  });
  assert.deepEqual(
    w.map((o) => `${o.table}:${o.op}`),
    ["proposals:insert", "events:insert"]
  );
  assert.equal(fake.db.businesses[0].stage, "qualified", "the stage itself did not move");
});

test("update_task: waiting_on alone moves the task to waiting, clearing it returns it to todo, done is left alone", async () => {
  const fake = seed();
  const set = await call(fake, "update_task", { id: T_NATE, waiting_on: "brandon" });
  assert.equal(set.task.status, "waiting");
  const cleared = await call(fake, "update_task", { id: T_NATE, waiting_on: null });
  assert.equal(cleared.task.status, "todo");
  const doing = await call(fake, "update_task", { id: T_NATE, status: "doing" });
  const keep = await call(fake, "update_task", { id: T_NATE, waiting_on: "" });
  assert.equal(
    keep.task.status,
    doing.task.status,
    "clearing on a task that is not waiting changes no status"
  );
  const explicit = await call(fake, "update_task", {
    id: T_NATE,
    status: "doing",
    waiting_on: "x",
  });
  assert.equal(explicit.task.status, "doing", "an explicit status wins");
  fake.db.tasks.find((t) => t.id === T_CLAUDE).status = "done";
  const done = await call(fake, "update_task", { id: T_CLAUDE, waiting_on: "x" });
  assert.equal(done.task.status, "done", "a done task is not reopened");
  await assert.rejects(
    call(fake, "update_task", { id: "33333333-3333-4333-8333-333333333399", waiting_on: "x" }),
    /task not found/
  );
});

test("propose_lead_stage refuses the same stage, an unknown stage, a missing lead and (flag off) late stages", async () => {
  const fake = seed();
  await assert.rejects(
    call(fake, "propose_lead_stage", { business_id: BIZ, stage: "qualified" }),
    /already in stage/
  );
  await assert.rejects(call(fake, "propose_lead_stage", { business_id: BIZ, stage: "teleported" }));
  await assert.rejects(
    call(fake, "propose_lead_stage", {
      business_id: "22222222-2222-4222-8222-222222222299",
      stage: "lost",
    }),
    /lead not found/
  );
  await assert.rejects(
    call(fake, "propose_lead_stage", { business_id: BIZ, stage: "won" }),
    /HQ_LATE_STAGES/
  );
  assert.equal(writes(fake).length, 0);
});

test("propose_finance files a pending finance proposal (old = the current value) and never touches finance_inputs", async () => {
  const fake = seed();
  const out = await call(fake, "propose_finance", {
    week: "2026-10-05",
    channel: "web",
    column: "spend_cents",
    value: 7500,
    reason: "invoice",
  });
  assert.equal(out.old, 5000);
  const ins = writes(fake).find((o) => o.table === "proposals");
  assert.deepEqual(ins.payload, {
    kind: "finance",
    target_id: "2026-10-05",
    field: "web/spend_cents",
    old: 5000,
    new: 7500,
    reason: "invoice",
    status: "pending",
    created_by: ACTOR.id,
    via: "mcp",
  });
  assert.equal(fake.db.finance_inputs[0].spend_cents, 5000);
  // a value with no row yet: old is null
  const fresh = await call(fake, "propose_finance", {
    week: "2026-10-12",
    channel: "ads",
    column: "leads",
    value: 3,
  });
  assert.equal(fresh.old, null);
  assert.equal(writes(fake).filter((o) => o.table === "finance_inputs").length, 0);
});

test("propose_finance refuses a non-Monday, a fractional count and a bad column", async () => {
  const fake = seed();
  await assert.rejects(
    call(fake, "propose_finance", {
      week: "2026-10-06",
      channel: "web",
      column: "leads",
      value: 1,
    }),
    /Monday/
  );
  await assert.rejects(
    call(fake, "propose_finance", {
      week: "2026-02-30",
      channel: "web",
      column: "leads",
      value: 1,
    }),
    /Monday/
  );
  await assert.rejects(
    call(fake, "propose_finance", {
      week: "2026-10-05",
      channel: "web",
      column: "leads",
      value: 1.5,
    }),
    /whole number/
  );
  await assert.rejects(
    call(fake, "propose_finance", {
      week: "2026-10-05",
      channel: "web",
      column: "revenue",
      value: 1,
    })
  );
  await assert.rejects(
    call(fake, "propose_finance", {
      week: "2026-10-05",
      channel: "web",
      column: "hours",
      value: -1,
    })
  );
  assert.equal(writes(fake).length, 0);
  await call(fake, "propose_finance", {
    week: "2026-10-05",
    channel: "web",
    column: "hours",
    value: 1.5,
  });
});

test("get_lead returns no phone/email-ish key or value anywhere, research included", async () => {
  const fake = seed();
  const out = await call(fake, "get_lead", { id: BIZ });
  const text = JSON.stringify(out);
  assert.ok(!/SENTINEL/.test(text), "no sentinel contact value survives");
  const keys = [];
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        keys.push(k);
        walk(x);
      }
  })(out);
  assert.deepEqual(
    keys.filter((k) => /phone|email|mobile|^contacts?$/i.test(k)),
    []
  );
  assert.equal(out.lead.name, "Hartwell Fixture Works");
  assert.equal(out.lead.research.summary, "small shop", "the rest of research is kept");
  assert.equal(out.lead.next_contact_at, "2026-10-05", "a contact DATE is not a contact detail");
  assert.equal(out.calls.length, 1);
  const sel = fake.ops.find((o) => o.table === "businesses");
  assert.ok(!/phone/.test(sel.cols), "the phone column is not even selected");
});

test("search_leads strips contacts, filters by name/stage and escapes wildcard input", async () => {
  const fake = seed();
  const hit = await call(fake, "search_leads", { name: "hartwell", stage: "qualified" });
  assert.equal(hit.count, 1);
  assert.ok(!/SENTINEL/.test(JSON.stringify(hit)));
  assert.equal((await call(fake, "search_leads", { name: "nomatch" })).count, 0);
  const ilike = fake.ops.filter((o) => o.table === "businesses");
  assert.ok(ilike.length >= 2);
  await call(fake, "search_leads", { name: "100%_(x),y" }); // must not throw or inject filter syntax
  await assert.rejects(call(fake, "search_leads", { limit: 51 }));
});

test("stripContacts: person-name keys (owner_name, decision_maker) are dropped too", () => {
  const out = stripContacts({ name: "Acme Plumbing", research: { owner_name: "X", decision_maker: "Y", fit_score: 7 } });
  assert.deepEqual(out, { name: "Acme Plumbing", research: { fit_score: 7 } });
});

test("stripContacts: phone-number-looking text is blanked, dates / timestamps / ids / scores are not", () => {
  const out = stripContacts({
    a: "call (555) 010-0199 or 555.010.0198 or 555-010-0197 or +1 555 010 0196 or 5550100195 today",
    b: "intl +44 20 7946 0958 ok",
    keep: [
      "2026-10-05",
      "2026-10-05 14:30:00",
      "2026-10-05T14:30:00+00:00",
      "7 of 10",
      "$1,234,567",
    ],
    id: "22222222-2222-4222-8222-222222222222",
    next_contact_at: "2026-10-05",
  });
  assert.equal(out.a, "call [removed] or [removed] or [removed] or [removed] or [removed] today");
  assert.equal(out.b, "intl [removed] ok");
  assert.deepEqual(out.keep, [
    "2026-10-05",
    "2026-10-05 14:30:00",
    "2026-10-05T14:30:00+00:00",
    "7 of 10",
    "$1,234,567",
  ]);
  assert.equal(out.id, "22222222-2222-4222-8222-222222222222");
  assert.equal(out.next_contact_at, "2026-10-05");
});

test("stripContacts: any depth, arrays, email addresses inside text", () => {
  const out = stripContacts({
    a: [{ Phone: "x", ok: 1, tel: "y" }],
    b: { c: { EMAIL_ADDRESS: "z", note: "write sentinel@example.test now" } },
    next_contact_at: "d",
  });
  assert.deepEqual(out, {
    a: [{ ok: 1 }],
    b: { c: { note: "write [removed] now" } },
    next_contact_at: "d",
  });
});

test("get_task / get_client / list_tasks / today read; list_tasks defaults to claude's open tasks", async () => {
  const fake = seed();
  assert.deepEqual(
    (await call(fake, "list_tasks")).tasks.map((t) => t.id),
    [T_CLAUDE]
  );
  assert.equal((await call(fake, "list_tasks", { owner: "all" })).tasks.length, 2);
  assert.equal((await call(fake, "get_task", { id: T_NATE })).task.title, "send quote");
  await assert.rejects(
    call(fake, "get_task", { id: "33333333-3333-4333-8333-333333333399" }),
    /not found/
  );
  const client = await call(fake, "get_client", { slug: "acme-demo" });
  assert.equal(client.client.display_name, "Acme Demo");
  assert.ok(!/SENTINEL/.test(JSON.stringify(client)));
  await assert.rejects(call(fake, "get_client", { slug: "nope" }), /not found/);
  const t = await call(fake, "today");
  assert.deepEqual(
    t.nate_tasks.map((x) => x.id),
    [T_NATE]
  );
  assert.equal(t.clients.length, 1);
  assert.deepEqual(t.approvals, []);
  assert.ok(
    t.fires.some((f) => f.task_id === T_NATE && f.urgent),
    "overdue ops task is an urgent fire"
  );
  assert.equal(writes(fake).length, 0, "reads only");
});

test("writes: create_task, log_lead_note, add_link all carry via=mcp and the connecting user as actor", async () => {
  const fake = seed();
  const { task } = await call(fake, "create_task", { title: "follow up", due: "2026-10-09" });
  assert.deepEqual(task.owners, ["claude"]);
  assert.equal(task.via, "mcp");
  await call(fake, "log_lead_note", { business_id: BIZ, body: "left a voicemail" });
  const note = fake.db.notes.find((n) => n.body === "left a voicemail");
  assert.equal(note.via, "mcp");
  assert.equal(note.actor, ACTOR.id);
  await call(fake, "add_link", { url: "https://example.test/doc", task_id: T_NATE });
  await assert.rejects(
    call(fake, "add_link", { url: "http://example.test/doc", task_id: T_NATE }),
    /https/
  );
  await assert.rejects(call(fake, "add_link", { url: "https://example.test/doc" }), /exactly one/);
  for (const e of fake.db.events) assert.equal(e.via, "mcp");
});

test("create_lead: inserts a manual lead (via=mcp), returns only id+name, refuses a twin and a late stage", async () => {
  const fake = seed();
  const out = await call(fake, "create_lead", { name: "JamSpot", town: "Pomona", phone: "909 555 0100", domain: "https://www.JamSpot.com/x", note: "met at the venue" });
  assert.deepEqual(Object.keys(out).sort(), ["id", "name"]);
  const row = fake.db.businesses.find((b) => b.id === out.id);
  assert.equal(row.source_query, "manual");
  assert.equal(row.stage, "reached");
  assert.equal(row.assigned_to, "nate");
  assert.equal(row.domain, "jamspot.com");
  assert.equal(fake.db.notes.find((n) => n.business_id === out.id).via, "mcp");
  assert.ok(fake.db.events.some((e) => e.kind === "lead_created" && e.via === "mcp"));
  await assert.rejects(call(fake, "create_lead", { name: "jamspot", town: "pomona" }), /looks like JamSpot \(Pomona\) already exists/);
  await assert.rejects(call(fake, "create_lead", { name: "Other", stage: "won" }), /HQ_LATE_STAGES/);
  await assert.rejects(call(fake, "create_lead", { name: "Other", stage: "nope" }), /unknown stage/);
  assert.equal(fake.db.businesses.filter((b) => b.name === "JamSpot").length, 1);
});

test("no tool, with plausible args, ever writes businesses, finance_inputs, profiles or decides a proposal", async () => {
  const fake = withTeam();
  const args = {
    list_tasks: {},
    get_task: { id: T_NATE },
    create_task: { title: "x" },
    update_task: { id: T_CLAUDE, status: "done" },
    add_task_note: { id: T_NATE, body: "n" },
    list_board: {},
    update_track: { id: TRACK, name: "Ops" },
    search_leads: { name: "h" },
    get_lead: { id: BIZ },
    log_lead_note: { business_id: BIZ, body: "n" },
    create_lead: { name: "JamSpot" },
    add_link: { url: "https://example.test/a", business_id: BIZ },
    get_client: { slug: "acme-demo" },
    today: {},
    propose_lead_stage: { business_id: BIZ, stage: "lost" },
    propose_client: { slug: "acme-demo", field: "monthly_rate_cents", value: 12000 },
    propose_finance: { week: "2026-10-05", channel: "web", column: "leads", value: 4 },
  };
  assert.deepEqual(
    Object.keys(args).sort(),
    TOOLS.map((t) => t.name).sort(),
    "every tool is exercised"
  );
  for (const [name, a] of Object.entries(args)) await call(fake, name, a);
  for (const o of writes(fake)) {
    assert.ok(
      // create_lead INSERTS a new business; nothing may update one
      !["businesses", "finance_inputs", "profiles", "clients"].includes(o.table) ||
        (o.table === "businesses" && o.op === "insert"),
      `${o.op} on ${o.table}`
    );
    if (o.table === "proposals") {
      assert.equal(o.op, "insert");
      assert.equal(o.payload.status, "pending");
      assert.equal(o.payload.via, "mcp");
    }
  }
  assert.equal(
    writes(fake)
      .filter((o) => o.op === "update")
      .every((o) => o.table === "tasks" || o.table === "tracks"),
    true
  );
  assert.equal(fake.db.businesses[0].stage, "qualified");
  assert.equal(fake.db.proposals.length, 3);
});

// ---- propose_client (item D): one whitelist shared with the admin Edit form --------------------------

test("propose_client files a pending kind=client proposal with via=mcp and the live value as old", async () => {
  const fake = seed();
  fake.db.clients[0].monthly_rate_cents = 10000;
  const r = await call(fake, "propose_client", {
    slug: "acme-demo",
    field: "monthly_rate_cents",
    value: 12000,
    reason: " raised at renewal ",
  });
  assert.equal(r.status, "pending");
  assert.equal(r.old, 10000);
  assert.equal(r.new, 12000);
  const p = fake.db.proposals.find((x) => x.id === r.proposal_id);
  assert.deepEqual(
    [p.kind, p.target_id, p.field, p.status, p.via, p.created_by, p.reason],
    ["client", "acme-demo", "monthly_rate_cents", "pending", "mcp", ACTOR.id, "raised at renewal"]
  );
  assert.equal("old" in p, false, "the insert sends no old: proposals_server_fields sets it");
  assert.equal(fake.db.clients[0].monthly_rate_cents, 10000, "nothing was applied");
  assert.equal(
    writes(fake).filter((o) => o.table === "clients").length,
    0,
    "the tool never writes clients"
  );
  assert.ok(fake.db.events.some((e) => e.kind === "proposal.created" && e.via === "mcp"));
});

test("propose_client takes exactly the Edit whitelist: other fields, bad values and no-ops are refused", async () => {
  const { CLIENT_FIELDS } = await import("../lib/clients/fields.ts");
  assert.deepEqual(byName.propose_client.shape.field.options, [...CLIENT_FIELDS]);
  const fake = seed();
  fake.db.clients[0].monthly_rate_cents = 10000;
  const bad = (a, re) => assert.rejects(call(fake, "propose_client", { slug: "acme-demo", ...a }), re);
  await bad({ field: "health", value: "green" }, /health|field|Invalid/i); // derived, not proposable
  await bad({ field: "stage", value: "live" }, /field|Invalid/i);
  await bad({ field: "monthly_rate_cents", value: 12.5 }, /whole cents/);
  await bad({ field: "monthly_rate_cents", value: -1 }, /whole cents/);
  await bad({ field: "billing_source", value: "cash" }, /billing_source/);
  await bad({ field: "repo_url", value: "http://x.test/r" }, /https/);
  await bad({ field: "launch_date", value: "2026-02-30" }, /launch_date/);
  await bad({ field: "aliases", value: "Acme" }, /aliases/);
  await bad({ field: "monthly_rate_cents", value: 10000 }, /already/);
  await assert.rejects(
    call(fake, "propose_client", { slug: "nope", field: "notes", value: "x" }),
    /no client/
  );
  assert.equal(fake.db.proposals.length, 0, "a refused proposal files nothing");
});

test("update_task takes a resolution (trimmed, clearable, max 4000) and its description tells Claude how to close a ticket", async () => {
  const fake = seed();
  const { task } = await call(fake, "update_task", { id: T_NATE, resolution: "  Done: reset.  ", status: "done" });
  assert.equal(task.resolution, "Done: reset.");
  assert.equal(task.status, "done");
  assert.equal((await call(fake, "update_task", { id: T_NATE, resolution: null })).task.resolution, null);
  const shape = byName.update_task.shape;
  assert.ok(shape.resolution.safeParse("x".repeat(4000)).success);
  assert.equal(shape.resolution.safeParse("x".repeat(4001)).success, false);
  assert.ok(
    byName.update_task.description.includes(
      "Ticket tasks (alert_key `ticket:…`): set `resolution` and `status: done` to close the client's ticket with that text on the next sync."
    )
  );
});

test("update_task resolution is owner-gated like a close: staff are refused on another human's task with no write; the owner and an admin may", async () => {
  const fake = withTeam();
  await assert.rejects(
    call(fake, "update_task", { id: T_BRANDON, resolution: "changed" }),
    /refused: this task is owned by brandon; only brandon or an admin can edit its resolution/
  );
  assert.equal(writes(fake).length, 0);
  assert.equal((await as(ADMIN, fake, "update_task", { id: T_BRANDON, resolution: "mine" })).task.resolution, "mine");
  assert.equal((await call(withTeam(), "update_task", { id: T_NATE, resolution: "ok" })).task.resolution, "ok");
});

test("owner takes a string or an array: both land as owners[]; [] unassigns; list_tasks and today match any co-owner", async () => {
  const fake = withTeam();
  const one = (await call(fake, "create_task", { title: "old shape", owner: "brandon" })).task;
  assert.deepEqual(one.owners, ["brandon"]);
  const two = (await call(fake, "create_task", { title: "both", owner: ["nate", "brandon"] })).task;
  assert.deepEqual(two.owners, ["nate", "brandon"]);
  assert.deepEqual((await call(fake, "create_task", { title: "default" })).task.owners, ["claude"]);
  await assert.rejects(call(fake, "create_task", { title: "x", owner: ["nate", "mallory"] }));
  const ids = async (owner) => (await call(fake, "list_tasks", { owner })).tasks.map((t) => t.id);
  assert.ok((await ids("brandon")).includes(two.id), "co-owned task is brandon's");
  assert.ok((await ids("nate")).includes(two.id), "and nate's");
  assert.ok(!(await ids("claude")).includes(two.id));
  assert.ok((await call(fake, "today")).nate_tasks.some((t) => t.id === two.id));
  // update_task: a string, an array, and [] to unassign
  assert.deepEqual((await call(fake, "update_task", { id: two.id, owner: "claude" })).task.owners, ["claude"]);
  assert.deepEqual((await call(fake, "update_task", { id: two.id, owner: ["brandon", "claude"] })).task.owners, ["brandon", "claude"]);
  assert.deepEqual((await as(ADMIN, fake, "update_task", { id: two.id, owner: [] })).task.owners, []); // brandon is an admin
  await assert.rejects(call(fake, "update_task", { id: two.id, owner: ["mallory"] }));
});

test("update_task owner rule with several owners: staff may act when they co-own it or only claude / nobody does; a task with another human on it is refused", async () => {
  const fake = withTeam();
  const mk = (owners) => fake.db.tasks.push({ id: `66666666-6666-4666-8666-66666666666${fake.db.tasks.length}`, title: "t", owners, status: "todo", area: "ops", due: null, waiting_on: null, created_at: "2026-09-01T00:00:00Z" }) && fake.db.tasks.at(-1);
  const coOwned = mk(["brandon", "nate"]); // nate (staff) is on it
  assert.equal((await call(fake, "update_task", { id: coOwned.id, status: "done" })).task.status, "done");
  const withClaude = mk(["claude"]);
  assert.equal((await call(fake, "update_task", { id: withClaude.id, status: "done" })).task.status, "done");
  const theirs = mk(["brandon", "claude"]); // brandon + claude, not nate: another human is on it
  await assert.rejects(call(fake, "update_task", { id: theirs.id, status: "done" }), /refused: this task is owned by brandon and claude; only brandon or an admin/);
  const none = mk([]);
  assert.equal((await call(fake, "update_task", { id: none.id, status: "done" })).task.status, "done");
});
