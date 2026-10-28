/** clients.test.mjs — derived health (red/amber/green + why-line), the one edit whitelist, billing keys, the page, and a fake-Mercury fixture. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSb } from "./_fakesb.mjs";
import { mcpFake } from "./_mcp-fake.mjs";

globalThis.React = React; // tsx compiles JSX classic here
React.cache ??= (f) => f;
const { planUpdate } = await import("../app/(app)/clients/update.ts");
const { applyClientUpdate } = await import("../app/(app)/clients/apply.ts");
const { ClientsView, ClientDetail, EditForm, groupCards, listMrr } =
  await import("../app/(app)/clients/View.tsx");
const { deriveHealth, UPTIME_STALE_MS } = await import("../lib/clients/health.ts");
const { CLIENT_SELECT, buildCards, deriveFor, lifetime, workSummary } =
  await import("../lib/clients/load.ts");
const { CLIENT_FIELDS, checkField } = await import("../lib/clients/fields.ts");
const { clientBilling, mercurySummary, clearMoneyMemo } = await import("../lib/money.ts");
const { createTask } = await import("../lib/tasks.ts");

const NOW = new Date("2026-10-27T12:00:00Z");
const min = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();
const unavailable = { unavailable: true };

// ---- derived health: red / amber / green ---------------------------------------------------------

const upRow = (target, over = {}) => ({
  target,
  ok: true,
  status: 200,
  checked_at: min(2),
  last_ok_at: min(2),
  ...over,
});
const conn = (source, status, over = {}) => ({
  slug: "sb",
  source,
  status,
  last_success_at: min(30),
  status_since: min(30),
  ...over,
});
const paidBilling = clientBilling(
  { display_name: "Sauna Boy", billing_note: null, aliases: ["SAUNA BOY INC"] },
  [
    {
      at: "2026-10-20T10:00:00Z",
      amountCents: 11000,
      counterparty: "SAUNA BOY INC",
      status: "sent",
    },
  ]
);
const input = (over = {}) => ({
  client: {
    slug: "sb",
    billing_source: "mercury",
    monthly_rate_cents: 11000,
    aliases: ["SAUNA BOY INC"],
  },
  uptime: new Map([["sb", upRow("sb")]]),
  ops: { health: [conn("shopify", "ok")], failed: [] },
  billing: paidBilling,
  now: NOW,
  ...over,
});

test("green: app up, connectors ok, paid this month; the why-line says so", () => {
  const d = deriveHealth(input());
  assert.equal(d.health, "green");
  assert.equal(d.payment, "paid");
  assert.equal(d.why, "all sources syncing · paid");
  assert.deepEqual(
    d.sources.map((s) => [s.name, s.dot]),
    [
      ["App", "g"],
      ["shopify", "g"],
    ]
  );
});

test("red: the newest uptime check failed; the why-line names the app and how long", () => {
  const d = deriveHealth(
    input({
      uptime: new Map([["sb", upRow("sb", { ok: false, status: 503, last_ok_at: min(125) })]]),
    })
  );
  assert.equal(d.health, "red");
  assert.match(d.why, /^App: down 2h · \/api\/health 503/);
});

test("red: a connector auth_failed or error; amber text follows the red text", () => {
  const d = deriveHealth(
    input({
      ops: {
        health: [conn("shopify", "auth_failed", { status_since: min(300) }), conn("meta", "stale")],
        failed: [],
      },
    })
  );
  assert.equal(d.health, "red");
  assert.equal(d.why, "shopify: auth failed 5h ago · meta: stale · last sync 30m ago");
  assert.equal(
    deriveHealth(input({ ops: { health: [conn("meta", "error")], failed: [] } })).health,
    "red"
  );
});

test("amber: stale or never-ran connector, quiet uptime job, missing or unreadable checks", () => {
  const amber = (over, re) => {
    const d = deriveHealth(input(over));
    assert.equal(d.health, "amber");
    assert.match(d.why, re);
  };
  amber({ ops: { health: [conn("meta", "stale")], failed: [] } }, /meta: stale/);
  amber({ ops: { health: [conn("meta", "never_ran")], failed: [] } }, /meta: not synced yet/);
  amber(
    {
      uptime: new Map([
        [
          "sb",
          upRow("sb", {
            checked_at: new Date(NOW.getTime() - UPTIME_STALE_MS - 60_000).toISOString(),
          }),
        ],
      ]),
    },
    /uptime check is 21m old/
  );
  amber({ uptime: new Map() }, /no uptime check yet/);
  amber({ uptime: null }, /uptime unreadable/);
  amber({ ops: { health: [], failed: ["ops_health"] } }, /Connectors: health unreadable/);
});

test("amber: no payment this month, Mercury unreachable, overdue invoice", () => {
  const unpaid = clientBilling(
    { display_name: "Sauna Boy", billing_note: null, aliases: ["SAUNA BOY INC"] },
    []
  );
  let d = deriveHealth(input({ billing: unpaid }));
  assert.deepEqual([d.health, d.payment, d.why], ["amber", "unpaid", "no payment this month"]);
  d = deriveHealth(
    input({ billing: clientBilling({ display_name: "x", billing_note: null }, unavailable) })
  );
  assert.deepEqual([d.health, d.payment], ["amber", "unknown"]);
  assert.match(d.why, /Mercury unreachable/);
  d = deriveHealth(input({ billing: { ...paidBilling, invoice: { nextDue: null, overdue: 2 } } }));
  assert.deepEqual([d.health, d.why], ["amber", "2 invoices overdue"]);
  // no match key at all: the line blames the missing key, not the payment; a key restores "no payment"
  const keyless = { slug: "sb", billing_source: "mercury", monthly_rate_cents: 11000 };
  d = deriveHealth(input({ client: keyless, billing: unpaid }));
  assert.deepEqual([d.health, d.payment, d.why], ["amber", "unpaid", "no Mercury match key set"]);
  d = deriveHealth(
    input({ client: { ...keyless, mercury_customer_id: "cus_1" }, billing: unpaid })
  );
  assert.equal(d.why, "no payment this month");
  // a payment last month does not count this month
  const old = clientBilling({ display_name: "x", billing_note: null, aliases: ["P"] }, [
    { at: "2026-09-28T00:00:00Z", amountCents: 1, counterparty: "P", status: "sent" },
  ]);
  assert.equal(deriveHealth(input({ billing: old })).payment, "unpaid");
});

test("a client with nothing to check (no app, no connectors, not billed here) is green and says so", () => {
  const d = deriveHealth({
    client: { slug: "wwc", billing_source: "none", monthly_rate_cents: null },
    uptime: new Map(),
    ops: { health: [], failed: ["ops_health"] }, // an ops outage is not wwc's problem
    billing: clientBilling({ display_name: "WWC", billing_note: null }, []),
    now: NOW,
  });
  assert.deepEqual([d.health, d.payment, d.why], ["green", "n/a", "nothing to check yet"]);
});

test("the why-line and the sources are built from the same pass as the dot", () => {
  for (const over of [
    {},
    { uptime: new Map([["sb", upRow("sb", { ok: false, status: null })]]) },
    { ops: { health: [conn("meta", "stale")], failed: [] } },
  ]) {
    const d = deriveHealth(input(over));
    const worst = d.sources.some((s) => s.dot === "r")
      ? "red"
      : d.sources.some((s) => s.dot === "a")
        ? "amber"
        : "green";
    assert.equal(d.health, worst);
    for (const s of d.sources.filter((x) => x.dot !== "g"))
      assert.ok(d.why.includes(`${s.name}: ${s.note}`));
  }
});

// ---- hand-set health is gone ----------------------------------------------------------------------

test("health cannot be set by hand: not in the whitelist, the planner, the action, or the select", () => {
  assert.ok(!CLIENT_FIELDS.includes("health"));
  assert.equal(checkField("health", "green").ok, false);
  const r = planUpdate({}, { health: "red", stage: "dead", owner: "x", billing_note: "y" });
  assert.deepEqual(r, { ok: true, patch: {}, changes: [] }); // silently ignored: only whitelisted keys are read
  for (const f of ["update.ts", "apply.ts", "actions.ts"]) {
    const src = readFileSync(new URL(`../app/(app)/clients/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      src,
      /\bhealth\b.*(select|patch|insert)|["']health["']/,
      `${f} must not write health`
    );
  }
  assert.ok(!CLIENT_SELECT.split(/,\s*/).includes("health"));
});

// ---- the clients select feeds clientBilling (item C hand-off) -------------------------------------

test("CLIENT_SELECT includes every key clientBilling reads, and the page uses it", () => {
  const keys = new Set(CLIENT_SELECT.split(/,\s*/));
  const src = readFileSync(new URL("../lib/money.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function clientBilling"), src.indexOf("// --- MRR"));
  const read = new Set([...fn.matchAll(/client\.(\w+)/g)].map((m) => m[1]));
  const iface = src.slice(
    src.indexOf("interface BillingKeys"),
    src.indexOf("}", src.indexOf("interface BillingKeys"))
  );
  const billingKeys = [...iface.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(billingKeys, ["mercury_customer_id", "aliases"]);
  for (const k of [...read, ...billingKeys])
    assert.ok(keys.has(k), `CLIENT_SELECT is missing ${k}`);
  for (const k of ["display_name", "billing_note", "mercury_customer_id", "aliases"])
    assert.ok(keys.has(k), k);
  const page = readFileSync(new URL("../app/(app)/clients/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.select\(CLIENT_SELECT\)/);
});

// ---- the one whitelist behind the Edit form ---------------------------------------------------------

const cur = {
  monthly_rate_cents: 11000,
  billing_source: "mercury",
  mercury_customer_id: null,
  aliases: ["SAUNA BOY INC"],
  repo_url: null,
  launch_date: null,
  notes: null,
};

test("planUpdate: dollars become cents, only changed fields, blank clears, aliases split", () => {
  const r = planUpdate(cur, {
    monthly_rate: "125.50",
    billing_source: "mercury",
    aliases: "SAUNA BOY INC\r\nSauna Boy LLC\n\nSB",
    notes: " renewed ",
    repo_url: "",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, {
    monthly_rate_cents: 12550,
    aliases: ["SAUNA BOY INC", "Sauna Boy LLC", "SB"],
    notes: "renewed",
  });
  assert.deepEqual(planUpdate(cur, { monthly_rate: "" }).patch, { monthly_rate_cents: null });
  assert.deepEqual(planUpdate(cur, { aliases: "" }).patch, { aliases: [] });
  assert.deepEqual(planUpdate(cur, { slug: "x" }).changes, []);
});

test("planUpdate refuses what propose_client refuses (same checkField)", () => {
  for (const form of [
    { monthly_rate: "12.345" },
    { monthly_rate: "-5" },
    { billing_source: "cash" },
    { repo_url: "http://x.test" },
    { launch_date: "2026-02-30" },
    { mercury_customer_id: "bad id!" },
    { notes: "x".repeat(2001) },
  ])
    assert.equal(planUpdate(cur, form).ok, false, JSON.stringify(form));
});

test("applyClientUpdate writes the changed fields and one events row per change", async () => {
  const sb = fakeSb({
    "clients.select": { data: cur, error: null },
    "clients.update": { error: null },
    "events.insert": { error: null },
  });
  const r = await applyClientUpdate(
    sb,
    "user-1",
    { slug: "sb", monthly_rate: "120", notes: "hi" },
    { admin: true }
  );
  assert.deepEqual(r, { ok: true, changed: 2 });
  const upd = sb.log.find((l) => l.table === "clients" && l.op === "update");
  assert.deepEqual(Object.keys(upd.args.update).sort(), [
    "monthly_rate_cents",
    "notes",
    "updated_at",
  ]);
  assert.deepEqual(upd.args.eq, [["slug", "sb"]]);
  const ev = sb.log.find((l) => l.table === "events");
  assert.equal(ev.args.insert.length, 2);
  for (const e of ev.args.insert)
    assert.deepEqual([e.job, e.kind, e.actor, e.via], ["clients", "client_update", "user-1", "ui"]);
  assert.deepEqual(ev.args.insert.find((e) => e.detail.field === "monthly_rate_cents").detail, {
    slug: "sb",
    field: "monthly_rate_cents",
    old: 11000,
    new: 12000,
  });
});

test("applyClientUpdate is admin-only and never reaches the database for a non-admin or a bad slug", async () => {
  const sb = fakeSb({ "clients.select": { data: cur, error: null } });
  const r = await applyClientUpdate(sb, "u", { slug: "sb", notes: "x" }, { admin: false });
  assert.equal(r.ok, false);
  assert.equal(sb.log.length, 0);
  assert.equal(
    (await applyClientUpdate(sb, "u", { slug: "Bad Slug!" }, { admin: true })).ok,
    false
  );
  assert.equal(sb.log.length, 0);
  const sb2 = fakeSb({ "clients.select": { data: cur, error: null } });
  assert.deepEqual(
    await applyClientUpdate(sb2, "u", { slug: "sb", monthly_rate: "110" }, { admin: true }),
    { ok: true, changed: 0 }
  );
  assert.deepEqual(
    sb2.log.map((l) => l.op),
    ["select"]
  );
  const sb3 = fakeSb({ "clients.select": { data: cur, error: null } });
  assert.equal(
    (await applyClientUpdate(sb3, "u", { slug: "sb", repo_url: "javascript:1" }, { admin: true }))
      .ok,
    false
  );
  assert.ok(!sb3.log.some((l) => l.op === "update"));
});

test("applyClientUpdate: a failed update writes no events row", async () => {
  const sb = fakeSb({
    "clients.select": { data: cur, error: null },
    "clients.update": { error: { message: "denied" } },
  });
  const r = await applyClientUpdate(sb, "u", { slug: "sb", notes: "x" }, { admin: true });
  assert.deepEqual(r, { ok: false, changed: 0, reason: "denied" });
  assert.ok(!sb.log.some((l) => l.table === "events"));
});

// ---- "+ Task for this client" ---------------------------------------------------------------------

test("+ Task for this client: createTask with clientSlug writes client_slug, via ui", async () => {
  const fake = mcpFake({ tasks: [], events: [] });
  const t = await createTask(fake, "u1", "ui", {
    title: " Call about renewal ",
    owner: "nate",
    area: "client",
    clientSlug: "sb",
  });
  assert.deepEqual(
    [t.client_slug, t.title, t.area, t.via],
    ["sb", "Call about renewal", "client", "ui"]
  );
  const src = readFileSync(new URL("../app/(app)/clients/actions.ts", import.meta.url), "utf8");
  assert.match(src, /createTask\(sb, user\.id, "ui", \{[^}]*clientSlug: slug/s);
});

// ---- the page --------------------------------------------------------------------------------------

const base = (over = {}) => ({
  slug: "sb",
  display_name: "Sauna Boy",
  kind: "deluxe",
  stage: "Live",
  owner: "nate",
  channel: "cold",
  billing_note: "net 15",
  repo_url: "https://github.com/x/y",
  monthly_rate_cents: 11000,
  churn_date: null,
  launch_date: null,
  notes: null,
  mercury_customer_id: null,
  aliases: ["SAUNA BOY INC"],
  billing_source: "mercury",
  ...over,
});
const sources = (over = {}) => ({
  uptime: new Map([
    ["sb", upRow("sb")],
    ["ta", upRow("ta", { ok: false, status: 502, last_ok_at: min(90) })],
  ]),
  ops: { health: [conn("shopify", "ok")], failed: [] },
  txns: [
    {
      at: "2026-10-20T10:00:00Z",
      amountCents: 11000,
      counterparty: "SAUNA BOY INC",
      status: "sent",
    },
  ],
  invoices: unavailable,
  ...over,
});
const clients = [
  base(),
  base({
    slug: "technology-associates",
    display_name: "Technology Associates",
    monthly_rate_cents: 20000,
    aliases: ["Technology Associates LLC"],
    billing_note: null,
    repo_url: null,
  }),
  base({
    slug: "wwc",
    display_name: "WWC",
    billing_source: "none",
    monthly_rate_cents: null,
    aliases: [],
    billing_note: null,
    repo_url: null,
  }),
];
const links = [
  { client_slug: "sb", label: "Site", url: "https://example.com" },
  { client_slug: "sb", label: "Bad", url: "javascript:alert(1)" },
];
const tasks = [
  { client_slug: "sb", title: "Renew", status: "todo", due: "2026-11-01" },
  { client_slug: "sb", title: "Invoice", status: "done", due: null },
];
const cards = buildCards(clients, sources(), links, tasks, NOW);
const noop = async () => ({ ok: true });
const view = (over = {}) =>
  renderToStaticMarkup(
    React.createElement(ClientsView, {
      cards,
      admin: true,
      month: "Oct",
      editAction: noop,
      taskAction: noop,
      ...over,
    })
  );

test("ClientsView: grouped Down / Watch / Healthy with why-line and rate, filters, search, MRR", () => {
  const html = view();
  assert.match(html, /Clients/);
  for (const n of ["All", "Down", "Watch", "Healthy"]) assert.match(html, new RegExp(`>${n}<`));
  const g = groupCards(cards, "all", "");
  assert.deepEqual(
    g.map((x) => [x.dot, x.cards.map((c) => c.slug)]),
    [
      ["r", ["technology-associates"]],
      ["g", ["sb", "wwc"]],
    ]
  );
  assert.match(html, /Down \/ needs attention/);
  assert.match(html, /App: down 2h · \/api\/health 502/); // the why-line in the list row
  assert.deepEqual(
    groupCards(cards, "g", "").map((x) => x.dot),
    ["g"]
  );
  assert.deepEqual(
    groupCards(cards, "all", "sauna").flatMap((x) => x.cards.map((c) => c.slug)),
    ["sb"]
  );
  assert.equal(listMrr(cards), 31000); // billing_source none is 0 anyway (no rate)
  assert.match(html, /MRR \$310/);
  assert.doesNotMatch(html, /<kbd|shortcut/i); // the prototype has no key hints
});

test("ClientDetail: dot + h1 + Edit, Health why-line, App / Money / Work / Files tiles, https-only links", () => {
  const sb = cards.find((c) => c.slug === "sb");
  const html = renderToStaticMarkup(
    React.createElement(ClientDetail, {
      c: sb,
      admin: true,
      month: "Oct",
      editAction: noop,
      taskAction: noop,
    })
  );
  assert.match(html, /<h1>Sauna Boy<\/h1>/);
  assert.match(html, />Edit</);
  assert.match(html, /Health: all sources syncing · paid/);
  for (const h of ["App + connectors", "Money", "Work", "Files + links"])
    assert.ok(html.includes(`<h2>${h}</h2>`), h);
  assert.match(html, /Paid/);
  assert.match(html, /Oct payment received/);
  assert.match(html, /1 of 2/);
  assert.match(html, /\+ Task for this client/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /href="https:\/\/github.com\/x\/y"/);
  assert.match(html, /href="https:\/\/sb.bcn-services.com"/);
  assert.doesNotMatch(html, /javascript:/);
  const member = renderToStaticMarkup(
    React.createElement(ClientDetail, {
      c: sb,
      admin: false,
      month: "Oct",
      editAction: noop,
      taskAction: noop,
    })
  );
  assert.doesNotMatch(member, />Edit</); // Edit is admin-only
});

test("aliases round-trip: the Edit form shows one alias per line and a comma name saves back unchanged", () => {
  const aliases = ["SUPPLY BROTHERS, LLC", "SB"];
  const c = buildCards([base({ aliases })], sources(), [], [], NOW)[0];
  const html = renderToStaticMarkup(
    React.createElement(EditForm, { c, action: noop, onDone() {} })
  );
  assert.match(html, /Aliases \(payer names, one per line\)/);
  const shown = /<textarea name="aliases"[^>]*>([^<]*)<\/textarea>/.exec(html)[1];
  assert.equal(shown.replace(/^\n/, ""), "SUPPLY BROTHERS, LLC\nSB"); // React adds a leading newline to a textarea
  const form = { aliases: shown.replace(/^\n/, "").replaceAll("\n", "\r\n") }; // browsers post CRLF
  assert.deepEqual(planUpdate({ aliases }, form).changes, []); // not split at the comma, no rewrite
  assert.deepEqual(planUpdate({ aliases: [] }, form).patch, { aliases });
});

test("Money tile third stat is '$N lifetime' (proto), not 'last payment'", () => {
  const sb = cards.find((c) => c.slug === "sb");
  const html = renderToStaticMarkup(
    React.createElement(ClientDetail, {
      c: { ...sb, lifetime: { cents: 330000, est: false } },
      admin: true,
      month: "Oct",
      editAction: noop,
      taskAction: noop,
    })
  );
  assert.match(html, /\$3,300<\/div><div class="muted">lifetime<\/div>/);
  assert.doesNotMatch(html, /last paid|no payment found/);
  assert.match(html, /matched by alias/);
  assert.doesNotMatch(html, /matched by matched|matched by no match/);
  const est = renderToStaticMarkup(
    React.createElement(ClientDetail, {
      c: { ...sb, lifetime: { cents: 330000, est: true }, aliases: [], mercury_customer_id: null },
      admin: true,
      month: "Oct",
      editAction: noop,
      taskAction: noop,
    })
  );
  assert.match(est, /lifetime \(est\.\)/);
  assert.match(est, /· no match key set/);
});

test("lifetime: paid Mercury invoices when readable, else rate x billing periods started since launch (est.)", () => {
  const inv = (customer, customerId, status, amountCents) => ({
    number: "1",
    status,
    amountCents,
    dueDate: "2026-09-01",
    customer,
    customerId,
  });
  const c = base({ launch_date: "2026-01-15", aliases: ["SAUNA BOY INC"] });
  const exact = { ...c, launch_date: "2026-08-20" }; // oldest invoice within a month of launch: complete
  // alias match, Paid only, other customers ignored
  const invoices = [
    inv("SAUNA BOY INC", "c1", "Paid", 11000),
    inv("sauna boy inc", "c1", "Paid", 11000),
    inv("SAUNA BOY INC", "c1", "Unpaid", 11000),
    inv("OTHER LLC", "c2", "Paid", 99999),
  ];
  assert.deepEqual(lifetime(exact, invoices, NOW), { cents: 22000, est: false });
  // a customer id, when set, is the key (alias matches stop counting)
  assert.deepEqual(lifetime({ ...exact, mercury_customer_id: "c2" }, invoices, NOW), {
    cents: 99999,
    est: false,
  });
  // invoicing off or no paid match: billing is in advance, so Jan 15 -> Oct 27 has started 10 periods
  assert.deepEqual(lifetime(c, unavailable, NOW), { cents: 110000, est: true });
  assert.deepEqual(lifetime(c, [], NOW), { cents: 110000, est: true });
  // the invoice list starts Sep 1, 7 months after launch: it is missing history, so max(sum, estimate), est
  assert.deepEqual(lifetime(c, invoices, NOW), { cents: 110000, est: true });
  // ...but a sum above the estimate stays the sum (still flagged est)
  assert.deepEqual(lifetime({ ...c, mercury_customer_id: "c2" }, invoices, NOW), {
    cents: 110000,
    est: true,
  });
  assert.deepEqual(
    lifetime({ ...c, mercury_customer_id: "c2" }, [inv("X", "c2", "Paid", 500000)], NOW),
    { cents: 500000, est: true }
  );
  // exactly one month after launch is still within the window
  assert.deepEqual(
    lifetime({ ...c, launch_date: "2026-08-01" }, [inv("SAUNA BOY INC", "c1", "Paid", 11000)], NOW),
    { cents: 11000, est: false }
  );
  // churned clients stop accruing; day-of-month counts (Jan 15 -> Feb 14 is still period 1)
  assert.deepEqual(lifetime({ ...c, churn_date: "2026-04-20" }, unavailable, NOW), {
    cents: 44000,
    est: true,
  });
  assert.deepEqual(lifetime({ ...c, launch_date: "2026-10-01" }, unavailable, NOW), {
    cents: 11000,
    est: true,
  });
  assert.equal(lifetime({ ...c, launch_date: "2026-11-01" }, unavailable, NOW), null);
  // nothing to estimate from
  for (const over of [
    { launch_date: null },
    { monthly_rate_cents: null },
    { billing_source: "none" },
  ])
    assert.equal(lifetime({ ...c, ...over }, unavailable, NOW), null, JSON.stringify(over));
  assert.equal(cards.find((x) => x.slug === "wwc").lifetime, null);
});

test("workSummary: done/open counts and the soonest open task", () => {
  assert.deepEqual(workSummary(tasks), { total: 2, done: 1, open: 1, next: "Renew" });
  assert.deepEqual(workSummary([]), { total: 0, done: 0, open: 0, next: null });
});

// ---- fixture: a fake Mercury shows TA and SB their real payment state ------------------------------

const saved = { fetch: globalThis.fetch, env: { ...process.env } };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  clearMoneyMemo();
  process.env.MERCURY_KEY = "secret-token:test-not-real";
});
afterEach(() => {
  globalThis.fetch = saved.fetch;
  process.env = { ...saved.env };
});
const fakeMercury = (transactions) => async (url) =>
  String(url).endsWith("/accounts")
    ? json({ accounts: [{ id: "a1", currentBalance: 1000 }] })
    : json({ transactions });

test("fake Mercury: SB paid this month, TA not (its only payment failed) -> SB green, TA amber 'no payment this month'", async () => {
  globalThis.fetch = fakeMercury([
    {
      amount: 110,
      counterpartyName: "SAUNA BOY INC",
      status: "sent",
      postedAt: "2026-10-20T10:00:00Z",
    },
    {
      amount: 200,
      counterpartyName: "Technology Associates LLC",
      status: "failed",
      postedAt: "2026-10-25T10:00:00Z",
    },
    {
      amount: 200,
      counterpartyName: "Technology Associates LLC",
      status: "sent",
      postedAt: "2026-09-25T10:00:00Z",
    },
  ]);
  const m = await mercurySummary(NOW);
  const s = sources({
    txns: m.txns,
    uptime: new Map([
      ["sb", upRow("sb")],
      ["ta", upRow("ta")],
    ]),
  });
  const [sb, ta] = [clients[0], clients[1]].map((c) => deriveFor(c, s, NOW));
  assert.deepEqual(
    [sb.derived.health, sb.derived.payment, sb.billing.lastPaid.amountCents],
    ["green", "paid", 11000]
  );
  assert.deepEqual(
    [ta.derived.health, ta.derived.payment, ta.billing.lastPaid.at.slice(0, 10)],
    ["amber", "unpaid", "2026-09-25"]
  );
  assert.match(ta.derived.why, /no payment this month/);
});

test("fake Mercury: TA paid in October -> green; Mercury down -> amber 'unverifiable', never a false green or a crash", async () => {
  globalThis.fetch = fakeMercury([
    {
      amount: 200,
      counterpartyName: "Technology Associates LLC",
      status: "sent",
      postedAt: "2026-10-03T10:00:00Z",
    },
  ]);
  const ok = await mercurySummary(NOW);
  const up = new Map([
    ["sb", upRow("sb")],
    ["ta", upRow("ta")],
  ]);
  const ta = deriveFor(clients[1], sources({ txns: ok.txns, uptime: up }), NOW);
  assert.deepEqual(
    [ta.derived.health, ta.derived.payment, ta.derived.why],
    ["green", "paid", "all sources syncing · paid"]
  );

  clearMoneyMemo();
  globalThis.fetch = async () => json({}, 500);
  const down = await mercurySummary(NOW);
  assert.equal(down.unavailable, true);
  const sb = deriveFor(clients[0], sources({ txns: down, uptime: up }), NOW);
  assert.deepEqual([sb.derived.health, sb.derived.payment], ["amber", "unknown"]);
  const html = view({
    cards: buildCards(clients, sources({ txns: down, uptime: up }), [], [], NOW),
  });
  assert.match(html, /Sauna Boy/); // the page still renders
});
