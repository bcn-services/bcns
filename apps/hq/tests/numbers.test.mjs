/** numbers.test.mjs — the Numbers page renders (and says "unavailable") when vendors fail; ops task on `c`; freeze. */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSb } from "./_fakesb.mjs";

globalThis.React = React;
const { NumbersView } = await import("../app/(app)/numbers/View.tsx");
const { Fires } = await import("../app/(app)/numbers/Fires.tsx");
const { oncePerKey } = await import("../app/(app)/numbers/task.ts");
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
  calls: [
    { week: "2026-10-05", calls: 50, reached: 10, consults: 2 },
    { week: "2026-09-14", calls: 30, reached: 6, consults: 0 },
  ],
  // The stage-time columns 0030 stamps; the lead's current stage (and any later write) is irrelevant.
  biz: [
    { consult_done_at: "2026-10-06T15:00:00Z", won_at: null }, // pilot this week
    { consult_done_at: "2026-10-06T15:00:00Z", won_at: "2026-10-06T16:00:00Z" }, // pilot + signed this week
    { consult_done_at: "2026-09-01T15:00:00Z", won_at: "2026-10-01T15:00:00Z" }, // signed last week, pilot long ago
    { consult_done_at: "2025-01-01T15:00:00Z", won_at: null }, // before the loaded window: not counted
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

test("loadFinance: pilots by consult_done_at, signed by won_at, each in its New York week", async () => {
  const fin = await loadFinance(loaderSb(fx), new Date("2026-10-07T16:00:00Z"));
  const w = fin.weekly.find((r) => r.channel === "cold" && r.period === "2026-10-05");
  assert.deepEqual([w.calls, w.pilots, w.signed, w.spendCents], [50, 2, 1, 20000]); // the 10-01 signing is last week's
  assert.equal(w.cacCents, 25000);
  const last = fin.weekly.find((r) => r.channel === "cold" && r.period === "2026-09-28");
  assert.equal(last.signed, 1);
  assert.deepEqual(fin.months[0].month, "2026-10-01");
  assert.equal(fin.months[0].frozen, false);
  assert.equal(fin.from, "2026-03-30"); // 27 weeks before the current one
});

test("loadFinance surfaces a query error", async () => {
  const sb = fakeSb({ "call_weeks.select": { data: null, error: { message: "denied" } } });
  await assert.rejects(loadFinance(sb), /denied/);
});

test("the page offers Freeze on a finished unfrozen month only: not the current month, not a frozen one", async () => {
  const now = new Date("2026-10-07T16:00:00Z");
  const fin = await loadFinance(loaderSb(fx), now);
  const frozen = { month: "2026-08-01", data: { rows: [] } };
  const fin2 = { ...fin, months: F.monthlyView(fin.live, [frozen], { from: fin.from, now }) };
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
  assert.match(html, /Freeze 2026-09/);
  assert.match(html, /name="month" value="2026-09-01"/);
  assert.match(html, /live, not frozen/); // October
  assert.doesNotMatch(html, /Freeze 2026-10/); // current month
  assert.doesNotMatch(html, /Freeze 2026-08/); // already frozen
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

test("oncePerKey: a second press while one is in flight does nothing; after it settles, runs again", async () => {
  const busy = {};
  let calls = 0;
  let release;
  const slow = () => (calls++, new Promise((res) => (release = res)));
  const a = oncePerKey(busy, "ops:job:digest", slow);
  await oncePerKey(busy, "ops:job:digest", slow); // held key / double click
  assert.equal(calls, 1);
  const other = oncePerKey(busy, "ops:job:other", async () => calls++); // another fire is independent
  await other;
  assert.equal(calls, 2);
  release();
  await a;
  await oncePerKey(busy, "ops:job:digest", async () => calls++);
  assert.equal(calls, 3);
  await assert.rejects(
    oncePerKey(busy, "k", async () => {
      throw new Error("x");
    })
  );
  assert.equal(busy.k, false, "a failure releases the key");
});
