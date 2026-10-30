import { test } from "node:test";
import assert from "node:assert/strict";
import { run, ticketsDeps, verifyFullUrl } from "../tickets.mjs";
import { main, JOBS } from "../run.mjs";

// An in-memory `tasks` table behind a sql tag. It answers only the four statements the job issues;
// the open-alert unique index is modelled, so a double insert raises 23505 like the real one.
function fakeSql(seed = []) {
  const tasks = seed.map((t, i) => ({ synced_at: null, resolution: null, reply: null, ...t, n: i }));
  const calls = [];
  const sql = async (strings, ...v) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, v });
    if (text.startsWith("select id, status, alert_key")) {
      // copies, like a real result set: later writes must not show through the job's row
      return tasks.filter((t) => v[0].includes(t.alert_key)).sort((a, b) => b.n - a.n).map((t) => ({ ...t }));
    }
    if (text.startsWith("insert into tasks")) {
      const [title, body, slug, alert_key] = v;
      if (tasks.some((t) => t.alert_key === alert_key && t.status !== "done"))
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      tasks.push({
        id: `t${tasks.length + 1}`,
        n: tasks.length + 100,
        status: "todo",
        synced_at: null,
        resolution: null,
        title,
        body,
        client_slug: slug,
        alert_key,
        text,
      });
      return [];
    }
    const t = tasks.find((x) => x.id === v[0]);
    if (text.startsWith("update tasks set status = 'done'"))
      Object.assign(t, { status: "done", synced_at: new Date() });
    else if (text.startsWith("update tasks set synced_at")) t.synced_at = new Date();
    else if (text.startsWith("update tasks set reply = null")) {
      if (!text.includes("and reply =") || t.reply === v[1]) t.reply = null;
    }
    else throw new Error(`unexpected sql: ${text}`);
    return [];
  };
  return { sql, tasks, calls };
}

const ticket = (id, o = {}) => ({
  id,
  slug: "acme",
  subject: `s${id}`,
  body: `b${id}`,
  severity: "normal",
  status: "open",
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T10:00:00Z",
  ...o,
});
function fakeSource(name, rows, { failPull = false, failResolve = null, failReply = false } = {}) {
  const resolved = [];
  const replied = [];
  const src = {
    name,
    resolved,
    replied,
    closed: 0,
    pull: async () => {
      if (failPull) throw new Error(`${name} down`);
      return rows;
    },
    resolve: async (id, text) => {
      if (failResolve === id) throw new Error("resolve boom");
      resolved.push([id, text]);
    },
    reply: async (id, text) => {
      if (failReply) throw new Error("function public.hq_ticket_reply does not exist");
      replied.push([id, text]);
    },
    close: async () => {
      src.closed++;
    },
  };
  return src;
}

test("pulls both sources, one task per open ticket; second run inserts nothing", async () => {
  const { sql, tasks } = fakeSql();
  const mk = () => [
    fakeSource("platform", [
      ticket("u1", { severity: "urgent" }),
      ticket("u2", { status: "closed" }),
    ]),
    fakeSource("ta", [ticket(7, { slug: "technology-associates", status: "answered" })]),
  ];
  const first = await run({ sql, sources: mk() });
  assert.deepEqual(first, { pulled: 3, created: 2, closed: 0, pushed: 0, replied: 0, failed: [] });
  assert.deepEqual(
    tasks.map((t) => t.alert_key),
    ["ticket:platform:u1", "ticket:ta:7"]
  ); // closed u2 never made one
  assert.equal(tasks[0].title, "Ticket: su1");
  assert.equal(tasks[0].body, "platform · urgent\n\nbu1");
  assert.equal(tasks[1].client_slug, "technology-associates");
  assert.match(tasks[0].text, /'{nate}', 'ops', 'todo', 'alert'.*'job'/);
  const second = await run({ sql, sources: mk() });
  assert.deepEqual(second, { pulled: 3, created: 0, closed: 0, pushed: 0, replied: 0, failed: [] });
  assert.equal(tasks.length, 2);
});

test("subject is cut to 80 and the body to 4000", async () => {
  const { sql, tasks } = fakeSql();
  await run({
    sql,
    sources: [
      fakeSource("platform", [ticket("u1", { subject: "x".repeat(200), body: "y".repeat(9000) })]),
    ],
  });
  assert.equal(tasks[0].title, `Ticket: ${"x".repeat(80)}`);
  assert.equal(tasks[0].body.length, 4000);
});

test("a ticket closed at the source dones its task without a push", async () => {
  const { sql, tasks } = fakeSql([{ id: "a", status: "doing", alert_key: "ticket:ta:7" }]);
  const ta = fakeSource("ta", [ticket(7, { status: "closed" })]);
  const out = await run({ sql, sources: [ta] });
  assert.equal(out.closed, 1);
  assert.equal(tasks[0].status, "done");
  assert.ok(tasks[0].synced_at);
  assert.deepEqual(ta.resolved, []);
  assert.equal(
    (await run({ sql, sources: [fakeSource("ta", [ticket(7, { status: "closed" })])] })).closed,
    0
  );
});

test("done and unsynced pushes once with the resolution, then never again", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "done", alert_key: "ticket:platform:u1", resolution: "Fixed it." },
  ]);
  const p = fakeSource("platform", [ticket("u1", { status: "answered" })]);
  const out = await run({ sql, sources: [p] });
  assert.equal(out.pushed, 1);
  assert.deepEqual(p.resolved, [["u1", "Fixed it."]]);
  assert.ok(tasks[0].synced_at);
  const again = fakeSource("platform", [
    ticket("u1", { status: "closed", updated_at: "2020-01-01T00:00:00Z" }),
  ]);
  assert.deepEqual(await run({ sql, sources: [again] }), {
    pulled: 1,
    created: 0,
    closed: 0,
    pushed: 0,
    replied: 0,
    failed: [],
  });
  assert.deepEqual(again.resolved, []);
});

test("an empty resolution is a status-only close (empty string, never null)", async () => {
  const { sql } = fakeSql([
    { id: "a", status: "done", alert_key: "ticket:ta:3", resolution: null },
  ]);
  const ta = fakeSource("ta", [ticket(3)]);
  await run({ sql, sources: [ta] });
  assert.deepEqual(ta.resolved, [[3, ""]]);
});

test("done in HQ while the ticket was already closed: no call, marked synced", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "done", alert_key: "ticket:ta:3", resolution: "x" },
  ]);
  const ta = fakeSource("ta", [ticket(3, { status: "closed" })]);
  assert.equal((await run({ sql, sources: [ta] })).pushed, 0);
  assert.deepEqual(ta.resolved, []);
  assert.ok(tasks[0].synced_at);
});

test("reopened at the source after sync: a new task once; an unchanged closed one stays quiet", async () => {
  const synced = new Date("2026-10-28T12:00:00Z");
  const { sql, tasks } = fakeSql([
    { id: "a", status: "done", alert_key: "ticket:platform:u1", synced_at: synced },
  ]);
  const stale = fakeSource("platform", [
    ticket("u1", { status: "open", updated_at: "2026-10-28T11:00:00Z" }),
  ]);
  assert.equal((await run({ sql, sources: [stale] })).created, 0);
  const reopened = () =>
    fakeSource("platform", [
      ticket("u1", { status: "open", updated_at: new Date("2026-10-28T13:00:00Z") }),
    ]);
  assert.equal((await run({ sql, sources: [reopened()] })).created, 1);
  assert.equal(tasks.length, 2);
  assert.equal((await run({ sql, sources: [reopened()] })).created, 0); // the new open task is the latest now
  assert.equal(tasks.length, 2);
});

test("a unique violation on insert means the task is already there", async () => {
  const { sql, tasks } = fakeSql([{ id: "a", status: "todo", alert_key: "ticket:ta:1" }]);
  // the job's lookup is stale: pretend it saw no task, then the index refuses the insert
  const racy = async (s, ...v) => (s.join("?").includes("select id, status") ? [] : sql(s, ...v));
  const out = await run({ sql: racy, sources: [fakeSource("ta", [ticket(1)])] });
  assert.deepEqual(out, { pulled: 1, created: 0, closed: 0, pushed: 0, replied: 0, failed: [] });
  assert.equal(tasks.length, 1);
});

test("one source failing leaves the other synced and the job throws after both ran", async () => {
  const { sql, tasks } = fakeSql();
  const bad = fakeSource("platform", [], { failPull: true });
  const good = fakeSource("ta", [ticket(5)]);
  await assert.rejects(run({ sql, sources: [bad, good] }), (e) => {
    assert.match(e.message, /platform: platform down/);
    assert.match(e.message, /"failed":\["platform"\]/);
    assert.match(e.message, /"created":1/);
    return true;
  });
  assert.equal(tasks.length, 1); // ta still synced
  assert.deepEqual([bad.closed, good.closed], [1, 1]); // both connections closed
});

test("a failing resolve fails the source but not the other tickets, and stays unsynced for retry", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "done", alert_key: "ticket:platform:u1", resolution: "r1" },
    { id: "b", status: "done", alert_key: "ticket:platform:u2", resolution: "r2" },
  ]);
  const p = fakeSource("platform", [ticket("u1"), ticket("u2")], { failResolve: "u1" });
  await assert.rejects(run({ sql, sources: [p] }), /resolve boom/);
  assert.deepEqual(p.resolved, [["u2", "r2"]]);
  assert.equal(tasks[0].synced_at, null);
  assert.ok(tasks[1].synced_at);
});

test("ticketsDeps: verify-full forced, max 1, 5s connect; a missing URL skips with one log line", async () => {
  const made = [];
  const connect = (url, opts) => {
    const pg = {
      unsafe: async (q, args) => {
        pg.q = [q, args];
        return [{ id: 7, slug: null }];
      },
      end: async () => {},
    };
    made.push({ url, opts, pg });
    return pg;
  };
  const logs = [];
  const { sources } = await ticketsDeps(
    { TA_TICKETS_URL: "postgresql://u:p@h:5432/postgres?sslmode=disable" },
    { connect, log: (m) => logs.push(m) }
  );
  assert.deepEqual(logs, ["tickets: PLATFORM_TICKETS_URL is not set, skipping platform"]);
  assert.equal(sources.length, 1);
  assert.equal(made[0].url, "postgresql://u:p@h:5432/postgres?sslmode=verify-full");
  assert.equal(made[0].opts.max, 1);
  assert.equal(made[0].opts.connect_timeout, 5);
  assert.deepEqual(await sources[0].pull(), [{ id: 7, slug: "technology-associates" }]);
  assert.equal(made[0].pg.q[0], "select * from public.hq_tickets_pull()");
  await sources[0].resolve(7, "done");
  assert.deepEqual(made[0].pg.q, ["select public.hq_ticket_resolve($1::int, $2)", [7, "done"]]);
  await sources[0].reply(7, "hi");
  assert.deepEqual(made[0].pg.q, ["select public.hq_ticket_reply($1::int, $2)", [7, "hi"]]);

  const both = await ticketsDeps(
    { PLATFORM_TICKETS_URL: "postgresql://u:p@h/db", TA_TICKETS_URL: "x" },
    { connect, log: () => {} }
  );
  assert.deepEqual(
    both.sources.map((s) => s.name),
    ["platform", "ta"]
  );
  await both.sources[0].pull();
  assert.equal(made.at(-2).pg.q[0], "select * from ops.hq_tickets_pull()");
  assert.equal(
    verifyFullUrl("postgresql://u:p%40@h/db?a=1&sslmode=require"),
    "postgresql://u:p%40@h/db?a=1&sslmode=verify-full"
  );
});

test("tickets is on the run.mjs allow-list and a failed run is logged ok:false", async () => {
  assert.deepEqual(JOBS, ["source", "qualify", "deliverable", "uptime", "tickets"]);
  const events = [];
  const db = { logEvent: async (_s, job, kind, detail) => events.push({ job, kind, detail }) };
  const load = async () => ({
    run: async () => {
      throw new Error("tickets failed (platform: x)");
    },
  });
  const code = await main({
    argv: ["tickets"],
    env: {},
    deps: { sql: { end: async () => {} }, db, load, job: { sources: [] } },
  });
  assert.equal(code, 1);
  assert.equal(events[0].job, "tickets");
  assert.equal(events[0].detail.ok, false);
});

test("a queued reply on an open task is pushed once and cleared; task and ticket stay open", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "todo", alert_key: "ticket:platform:u1", reply: "Looking into it." },
  ]);
  const p = fakeSource("platform", [ticket("u1")]);
  const out = await run({ sql, sources: [p] });
  assert.equal(out.replied, 1);
  assert.deepEqual(p.replied, [["u1", "Looking into it."]]);
  assert.deepEqual(p.resolved, []);
  assert.equal(tasks[0].reply, null);
  assert.equal(tasks[0].status, "todo");
  assert.equal(tasks[0].synced_at, null);
  const again = fakeSource("platform", [ticket("u1", { status: "answered" })]);
  assert.equal((await run({ sql, sources: [again] })).replied, 0);
  assert.deepEqual(again.replied, []);
});

test("a failed reply is logged, stays queued, and does not fail the run", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "doing", alert_key: "ticket:ta:3", reply: "On it." },
  ]);
  const logs = [];
  const ta = fakeSource("ta", [ticket(3)], { failReply: true });
  const out = await run({ sql, sources: [ta], log: (m) => logs.push(m) });
  assert.equal(out.replied, 0);
  assert.deepEqual(out.failed, []);
  assert.equal(tasks[0].reply, "On it.");
  assert.deepEqual(logs, ["tickets: reply failed a function public.hq_ticket_reply does not exist"]);
});

test("a closed ticket gets no reply (its task closes instead); a done task's reply is never sent", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "todo", alert_key: "ticket:ta:3", reply: "late" },
    { id: "b", status: "done", alert_key: "ticket:ta:4", reply: "too late", synced_at: new Date() },
  ]);
  const ta = fakeSource("ta", [
    ticket(3, { status: "closed" }),
    ticket(4, { updated_at: "2020-01-01T00:00:00Z" }),
  ]);
  const out = await run({ sql, sources: [ta] });
  assert.equal(out.replied, 0);
  assert.deepEqual(ta.replied, []);
  assert.equal(tasks[0].status, "done");
});

test("a reply queued while the last one was being pushed stays queued and goes out next run", async () => {
  const { sql, tasks } = fakeSql([
    { id: "a", status: "todo", alert_key: "ticket:ta:3", reply: "first" },
  ]);
  const ta = fakeSource("ta", [ticket(3)]);
  const send = ta.reply;
  ta.reply = async (id, text) => {
    await send(id, text);
    tasks[0].reply = "second"; // Nate queues another before the clear runs
  };
  await run({ sql, sources: [ta] });
  assert.equal(tasks[0].reply, "second");
  const next = fakeSource("ta", [ticket(3, { status: "answered" })]);
  await run({ sql, sources: [next] });
  assert.deepEqual(next.replied, [[3, "second"]]);
  assert.equal(tasks[0].reply, null);
});

test("a reply still queued when the task is marked done closes the ticket with it", async () => {
  const { sql } = fakeSql([
    { id: "a", status: "done", alert_key: "ticket:ta:3", resolution: null, reply: "Fixed, try now." },
  ]);
  const ta = fakeSource("ta", [ticket(3)]);
  await run({ sql, sources: [ta] });
  assert.deepEqual(ta.resolved, [[3, "Fixed, try now."]]);
  assert.deepEqual(ta.replied, []);
});
