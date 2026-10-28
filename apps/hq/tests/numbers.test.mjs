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
const { loadFinance, loadClients, parseTab } = await import("../app/(app)/numbers/data.ts");
const money = await import("../lib/money.ts");

const saved = { fetch: globalThis.fetch, env: { ...process.env } };
afterEach(() => {
  globalThis.fetch = saved.fetch;
  process.env = { ...saved.env };
  money.clearMoneyMemo();
});
const render = (props) => renderToStaticMarkup(React.createElement(NumbersView, props));
const emptyOps = { health: [], runs: [], tickets: [], clients: [], failed: [] };

const NOW = new Date("2026-10-27T12:00:00Z");

test("every vendor and the platform down: every tab still renders, saying unavailable", async () => {
  process.env.STRIPE_KEY = "rk_test_not_real";
  process.env.MERCURY_KEY = "secret-token:test-not-real";
  process.env.MERCURY_INVOICING = "1";
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  money.clearMoneyMemo();
  const moneyProps = {
    stripe: await money.stripeSummary(),
    mercury: await money.mercurySummary(),
    invoices: await money.mercuryInvoices(),
    invoicing: true,
  };
  const m = render({ tab: "money", money: moneyProps, clients: null, now: NOW });
  assert.match(m, /Stripe unavailable/);
  assert.match(m, /Mercury unavailable/);
  assert.match(m, /Clients unavailable/);
  const sales = render({ tab: "sales", finance: null, now: NOW });
  assert.match(sales, /Finance unavailable/);
  assert.match(
    render({ tab: "unit", finance: null, clients: null, now: NOW }),
    /Unit economics unavailable/
  );
  const ops = render({
    tab: "ops",
    ops: { ops: { ...emptyOps, failed: ["config"] }, runs: [], firesSlot: null },
    now: NOW,
  });
  assert.match(ops, /Ops unavailable/);
  assert.match(ops, /id="ops"/);
  // no props at all (env-less): each tab says unavailable instead of crashing
  for (const tab of ["money", "sales", "ops", "unit"])
    assert.match(render({ tab, now: NOW }), /unavailable/i);
});

const clients = [
  {
    slug: "sb",
    display_name: "Sauna Boy",
    billing_note: null,
    monthly_rate_cents: 11000,
    billing_source: "mercury",
    churn_date: null,
    launch_date: "2026-09-01",
    mercury_customer_id: null,
    aliases: ["SAUNA BOY INC"],
  },
  {
    slug: "ta",
    display_name: "Technology Associates",
    billing_note: null,
    monthly_rate_cents: 10000,
    billing_source: "mercury",
    churn_date: null,
    launch_date: "2026-08-01",
    mercury_customer_id: null,
    aliases: [],
  },
  {
    slug: "st",
    display_name: "Stripe Shop",
    billing_note: null,
    monthly_rate_cents: 5000,
    billing_source: "stripe",
    churn_date: null,
    launch_date: null,
    mercury_customer_id: null,
    aliases: [],
  },
];
const stripeOk = {
  mrrCents: 5000,
  activeSubscriptions: 1,
  charges30dCents: 0,
  subs: [],
  excluded: [{ id: "sub_x", cancelAt: "2026-11-15" }],
};
const mercuryOk = {
  balanceCents: 123450,
  in30dCents: 11000,
  out30dCents: 0,
  txns: [
    {
      at: "2026-10-20T10:00:00Z",
      amountCents: 11000,
      counterparty: "SAUNA BOY INC",
      status: "sent",
    },
  ],
};

test("Money tab: MRR tile, the Mercury/Stripe split, 'cancels <date>', and a paid chip per client", () => {
  const html = render({
    tab: "money",
    clients,
    money: { stripe: stripeOk, mercury: mercuryOk, invoices: [], invoicing: false },
    now: NOW,
  });
  assert.match(html, /MRR/);
  assert.match(html, /\$260/); // 110 + 100 Mercury rates + 50 Stripe
  assert.match(html, /Mercury recurring \$210/);
  assert.match(html, /Stripe \$50/);
  assert.match(html, /sub_x cancels 2026-11-15/);
  assert.match(html, /Sauna Boy[\s\S]*?chip ok">paid/);
  assert.match(html, /Technology Associates[\s\S]*?chip warn">no payment found/);
  assert.match(html, /billed via Stripe/);
  assert.match(html, /\$1,235/); // Mercury cash
});

test("Money tab: Mercury invoicing 403 (or a failed /ar/customers) shows an error chip with the message, never empty", async () => {
  process.env.MERCURY_KEY = "secret-token:test-not-real";
  process.env.MERCURY_INVOICING = "1";
  globalThis.fetch = async (url) =>
    String(url).includes("/ar/customers")
      ? new Response("{}", { status: 403 })
      : new Response(JSON.stringify({ invoices: [] }), { status: 200 });
  money.clearMoneyMemo();
  const invoices = await money.mercuryInvoices();
  assert.equal(money.isUnavailable(invoices), true);
  const html = render({
    tab: "money",
    clients,
    money: { stripe: stripeOk, mercury: mercuryOk, invoices, invoicing: true },
    now: NOW,
  });
  assert.match(html, /chip bad">Mercury invoicing: [^<]*\/ar\/customers 403[^<]*Invoicing scope/);
  assert.doesNotMatch(html, /secret-token/);
  // and with a bare Unavailable (no message) it still says so
  const bare = render({
    tab: "money",
    clients,
    money: {
      stripe: stripeOk,
      mercury: mercuryOk,
      invoices: { unavailable: true },
      invoicing: true,
    },
    now: NOW,
  });
  assert.match(bare, /chip bad">Mercury invoicing unavailable/);
});

test("Tabs: the nav links all four sections and marks the current one; parseTab falls back to money", () => {
  const html = render({ tab: "sales", finance: null, now: NOW });
  for (const t of ["money", "sales", "ops", "unit"])
    assert.match(html, new RegExp(`href="/numbers\\?tab=${t}"`));
  assert.match(html, /class="on" aria-current="page">Sales funnel/);
  assert.equal(parseTab("unit"), "unit");
  assert.equal(parseTab("nope"), "money");
  assert.equal(parseTab(["ops"]), "money");
  assert.equal(parseTab(undefined), "money");
});

test("loadClients selects the billing keys and surfaces an error", async () => {
  const sb = fakeSb({ "clients.select": { data: clients, error: null } });
  assert.equal((await loadClients(sb)).length, 3);
  assert.match(sb.log[0].args.select, /mercury_customer_id, aliases/);
  await assert.rejects(
    loadClients(fakeSb({ "clients.select": { data: null, error: { message: "denied" } } })),
    /denied/
  );
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

test("Sales and Unit tabs render the loaded numbers: funnel steps, CAC, LTV:CAC, avg rate input", async () => {
  const now = new Date("2026-10-07T16:00:00Z");
  const fin = await loadFinance(loaderSb(fx), now);
  const sales = render({ tab: "sales", finance: fin, now });
  assert.match(sales, /Calls per week/);
  assert.match(sales, /This week&#x27;s funnel/);
  assert.match(sales, /Consults booked/);
  assert.match(sales, /goal 60/);
  const unit = render({ tab: "unit", finance: fin, clients, now });
  assert.match(unit, /CAC/);
  assert.match(unit, /LTV : CAC/);
  assert.match(unit, /Average rate<\/span><b>\$87\/mo/); // (110 + 100 + 50) / 3 live clients
  assert.doesNotMatch(unit, /Freeze/);
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
    tab: "ops",
    ops: {
      ops,
      runs,
      firesSlot: null,
      instinctUrl: "https://instinct.example",
      sentryUrl: "https://sentry.example",
    },
    now: NOW,
  });
  assert.match(html, /<span class="dot bad"><\/span>shopify auth failed/);
  assert.match(html, /<b>1<\/b>/); // open tickets
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
