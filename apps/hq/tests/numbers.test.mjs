/** numbers.test.mjs — the Numbers page renders (and says "unavailable") when vendors fail; ops task on `c`; freeze. */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSb } from "./_fakesb.mjs";

globalThis.React = React;
const { NumbersView } = await import("../app/(app)/numbers/View.tsx");
const { Fires } = await import("../app/(app)/numbers/Fires.tsx");
const { createOpsTask } = await import("../app/(app)/numbers/task.ts");
const { loadFinance } = await import("../app/(app)/numbers/data.ts");
const money = await import("../lib/money.ts");
const F = await import("../lib/finance.ts");

const saved = { fetch: globalThis.fetch, env: { ...process.env } };
afterEach(() => {
  globalThis.fetch = saved.fetch;
  process.env = { ...saved.env };
  money.clearMoneyMemo();
});
const render = (props) => renderToStaticMarkup(React.createElement(NumbersView, props));
const emptyOps = { health: [], runs: [], tickets: [], clients: [], failed: [] };

test("every vendor and the platform down: the page still renders, saying unavailable", async () => {
  process.env.STRIPE_KEY = "rk_test_not_real";
  process.env.MERCURY_KEY = "secret-token:test-not-real";
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  money.clearMoneyMemo();
  const html = render({
    finance: null,
    ops: { ...emptyOps, failed: ["config"] },
    runs: [],
    stripe: await money.stripeSummary(),
    mercury: await money.mercurySummary(),
    firesSlot: null,
  });
  assert.match(html, /Stripe <b>unavailable<\/b>/);
  assert.match(html, /Mercury <b>unavailable<\/b>/);
  assert.match(html, /Finance unavailable/);
  assert.match(html, /Ops unavailable/);
  assert.match(html, /id="ops"/);
});

const fx = {
  calls: [{ week: "2026-10-05", calls: 50, reached: 10, consults: 2 }],
  biz: [
    { stage: "consult_done", updated_at: "2026-10-06T15:00:00Z" },
    { stage: "won", updated_at: "2026-10-06T15:00:00Z" },
    { stage: "onboarded", updated_at: "2026-10-01T15:00:00Z" },
  ],
  inputs: [
    {
      week: "2026-10-05",
      channel: "cold",
      spend_cents: 20000,
      hours: 2,
      leads: null,
      pilots: null,
      signed: null,
    },
  ],
  snaps: [],
};
const loaderSb = (f) =>
  fakeSb({
    "call_weeks.select": { data: f.calls, error: null },
    "businesses.select": { data: f.biz, error: null },
    "finance_inputs.select": { data: f.inputs, error: null },
    "finance_snapshots.select": { data: f.snaps, error: null },
  });

test("loadFinance: stage counts bucketed by New York week, live weekly + unfrozen current month", async () => {
  const fin = await loadFinance(loaderSb(fx), new Date("2026-10-07T16:00:00Z"));
  const w = fin.weekly.find((r) => r.channel === "cold" && r.period === "2026-10-05");
  assert.deepEqual([w.calls, w.pilots, w.signed, w.spendCents], [50, 1, 1, 20000]); // the 10-01 onboarded is last week's
  assert.equal(w.cacCents, 25000);
  assert.deepEqual(fin.months[0].month, "2026-10-01");
  assert.equal(fin.months[0].frozen, false);
});

test("loadFinance surfaces a query error", async () => {
  const sb = fakeSb({ "call_weeks.select": { data: null, error: { message: "denied" } } });
  await assert.rejects(loadFinance(sb), /denied/);
});

test("the page shows the weekly numbers, the unfrozen month with a Freeze button, and a frozen month without one", async () => {
  const fin = await loadFinance(loaderSb(fx), new Date("2026-10-07T16:00:00Z"));
  const frozen = { month: "2026-09-01", data: { rows: [] } };
  const fin2 = { ...fin, months: F.monthlyView(fin.live, [frozen]) };
  const html = render({
    finance: fin2,
    ops: emptyOps,
    runs: [],
    stripe: { unavailable: true },
    mercury: { unavailable: true },
    firesSlot: null,
    freeze: async () => {},
  });
  assert.match(html, /\$250/); // CAC
  assert.match(html, /6\.7x/); // LTV:CAC
  assert.match(html, /Freeze 2026-10/);
  assert.match(html, /live, not frozen/);
  assert.match(html, /name="month" value="2026-10-01"/);
  assert.doesNotMatch(html, /Freeze 2026-09/);
});

test("ops section: connector grid, failed HQ runs, tickets, and the Instinct/Sentry links", () => {
  const ops = {
    ...emptyOps,
    health: [
      {
        slug: "acme",
        source: "shopify",
        status: "auth_failed",
        status_since: "2026-10-20T00:00:00Z",
        last_run_at: null,
        last_success_at: null,
        has_error: true,
      },
    ],
    tickets: [
      {
        id: "t1",
        slug: "acme",
        subject: "Orders missing",
        severity: "urgent",
        status: "open",
        created_at: "2026-10-26T00:00:00Z",
      },
    ],
  };
  const runs = [{ job: "digest", ok: false, at: "2026-10-27T10:00:00Z", ms: 4, error: "boom" }];
  const html = render({
    finance: null,
    ops,
    runs,
    stripe: { unavailable: true },
    mercury: { unavailable: true },
    firesSlot: null,
    instinctUrl: "https://instinct.example",
    sentryUrl: "https://sentry.example",
  });
  assert.match(html, /chip bad">auth_failed/);
  assert.match(html, /Orders missing/);
  assert.match(html, /digest/);
  assert.match(html, /href="https:\/\/instinct.example"/);
  assert.match(html, /href="https:\/\/sentry.example"/);
});

test("Fires renders each fire with its key hint", () => {
  const fires = [
    {
      key: "ops:job:digest",
      kind: "job",
      title: "digest failed 2x in 24h",
      detail: "boom",
      severity: "urgent",
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(Fires, { fires, create: async () => ({ ok: true, message: "" }) })
  );
  assert.match(html, /digest failed 2x in 24h/);
  assert.match(html, /<b class="k">c<\/b> task/);
  assert.match(
    renderToStaticMarkup(
      React.createElement(Fires, { fires: [], create: async () => ({ ok: true, message: "" }) })
    ),
    /No fires/
  );
});

// --- key `c`: an ops task --------------------------------------------------------------------

const fire = {
  key: "ops:connector:acme:shopify",
  title: "acme shopify: auth_failed",
  detail: "since 2026-10-20",
};

test("createOpsTask: inserts an ops task for Nate keyed by the fire, plus an events row", async () => {
  const sb = fakeSb({
    "tasks.select": { data: [], error: null },
    "tasks.insert": { data: { id: "task-1" }, error: null },
    "events.insert": { error: null },
  });
  assert.deepEqual(await createOpsTask(sb, "user-1", fire), { ok: true, message: "task created" });
  const ins = sb.log.find((l) => l.table === "tasks" && l.op === "insert").args.insert;
  assert.deepEqual(
    [ins.title, ins.owner, ins.area, ins.source, ins.alert_key, ins.created_by, ins.via],
    [
      "acme shopify: auth_failed",
      "nate",
      "ops",
      "alert",
      "ops:connector:acme:shopify",
      "user-1",
      "ui",
    ]
  );
  const ev = sb.log.find((l) => l.table === "events").args.insert;
  assert.deepEqual(
    [ev.job, ev.kind, ev.actor, ev.via, ev.detail.task_id],
    ["tasks", "task_created", "user-1", "ui", "task-1"]
  );
});

test("createOpsTask: one open task per fire; non-ops keys are refused before any query", async () => {
  const sb = fakeSb({ "tasks.select": { data: [{ id: "task-0" }], error: null } });
  assert.deepEqual(await createOpsTask(sb, "u", fire), { ok: true, message: "task already open" });
  assert.ok(!sb.log.some((l) => l.op === "insert"));
  const sb2 = fakeSb();
  assert.equal((await createOpsTask(sb2, "u", { key: "task:123", title: "x" })).ok, false);
  assert.equal(sb2.log.length, 0);
});

test("createOpsTask: an insert failure writes no events row", async () => {
  const sb = fakeSb({
    "tasks.select": { data: [], error: null },
    "tasks.insert": { data: null, error: { message: "denied" } },
  });
  assert.deepEqual(await createOpsTask(sb, "u", fire), { ok: false, message: "denied" });
  assert.ok(!sb.log.some((l) => l.table === "events"));
});
