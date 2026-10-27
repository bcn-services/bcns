/** clients.test.mjs — edit validation, one events row per changed field, and the page rendering without Mercury. */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSb } from "./_fakesb.mjs";

globalThis.React = React; // tsx compiles JSX classic here
const { planUpdate } = await import("../app/(app)/clients/update.ts");
const { applyClientUpdate } = await import("../app/(app)/clients/apply.ts");
const { ClientsView, ClientDetail, billingLabel } = await import("../app/(app)/clients/View.tsx");
const { clientBilling } = await import("../lib/money.ts");

const cur = { health: "green", stage: "live", owner: "nate", billing_note: null };

test("planUpdate: only changed fields, blank clears, untouched fields stay out", () => {
  const r = planUpdate(cur, {
    health: "amber",
    stage: "live",
    owner: " brandon ",
    billing_note: "",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, { health: "amber", owner: "brandon" });
  assert.deepEqual(
    r.changes.map((c) => [c.field, c.old, c.new]),
    [
      ["health", "green", "amber"],
      ["owner", "nate", "brandon"],
    ]
  );
  assert.deepEqual(planUpdate(cur, { owner: "" }).patch, { owner: null });
  assert.deepEqual(planUpdate(cur, { slug: "x" }).changes, []);
});

test("planUpdate refuses a bad health and over-long text", () => {
  assert.deepEqual(planUpdate(cur, { health: "purple" }), { ok: false, reason: "bad health" });
  assert.equal(planUpdate(cur, { billing_note: "x".repeat(501) }).ok, false);
  assert.equal(planUpdate(cur, { stage: "x".repeat(61) }).ok, false);
  assert.equal(planUpdate(cur, { health: "" }).ok, true); // not set is allowed
});

test("applyClientUpdate writes the changed fields and one events row per change", async () => {
  const sb = fakeSb({
    "clients.select": { data: cur, error: null },
    "clients.update": { error: null },
    "events.insert": { error: null },
  });
  const r = await applyClientUpdate(sb, "user-1", {
    slug: "sauna-boy",
    health: "red",
    owner: "brandon",
    stage: "live",
    billing_note: "late",
  });
  assert.deepEqual(r, { ok: true, changed: 3 });
  const upd = sb.log.find((l) => l.table === "clients" && l.op === "update");
  assert.deepEqual(Object.keys(upd.args.update).sort(), [
    "billing_note",
    "health",
    "owner",
    "updated_at",
  ]);
  assert.deepEqual(upd.args.eq, [["slug", "sauna-boy"]]);
  const ev = sb.log.find((l) => l.table === "events");
  assert.equal(ev.args.insert.length, 3);
  for (const e of ev.args.insert) {
    assert.deepEqual([e.job, e.kind, e.actor, e.via], ["clients", "client_update", "user-1", "ui"]);
    assert.equal(e.detail.slug, "sauna-boy");
  }
  assert.deepEqual(ev.args.insert.find((e) => e.detail.field === "health").detail, {
    slug: "sauna-boy",
    field: "health",
    old: "green",
    new: "red",
  });
});

test("applyClientUpdate: no change writes nothing; a bad slug or refused edit never touches the database", async () => {
  const sb = fakeSb({ "clients.select": { data: cur, error: null } });
  assert.deepEqual(await applyClientUpdate(sb, "u", { slug: "x-1", health: "green" }), {
    ok: true,
    changed: 0,
  });
  assert.deepEqual(
    sb.log.map((l) => l.op),
    ["select"]
  );
  const sb2 = fakeSb();
  assert.equal((await applyClientUpdate(sb2, "u", { slug: "Bad Slug!" })).ok, false);
  assert.equal(sb2.log.length, 0);
  const sb3 = fakeSb({ "clients.select": { data: cur, error: null } });
  assert.equal((await applyClientUpdate(sb3, "u", { slug: "ok", health: "nope" })).ok, false);
  assert.ok(!sb3.log.some((l) => l.op === "update"));
});

test("applyClientUpdate: a failed update writes no events row", async () => {
  const sb = fakeSb({
    "clients.select": { data: cur, error: null },
    "clients.update": { error: { message: "denied" } },
  });
  const r = await applyClientUpdate(sb, "u", { slug: "ok", health: "red" });
  assert.deepEqual(r, { ok: false, changed: 0, reason: "denied" });
  assert.ok(!sb.log.some((l) => l.table === "events"));
});

const client = (over = {}) => ({
  slug: "sauna-boy",
  display_name: "Sauna Boy",
  kind: "deluxe",
  stage: "live",
  health: "red",
  owner: "nate",
  channel: "cold",
  billing_note: "net 15",
  repo_url: "https://github.com/x/y",
  monthly_rate_cents: 11000,
  links: [{ label: "Site", url: "https://example.com" }],
  ...over,
});

test("ClientsView: one row per client under its health, with kind/stage/owner/channel and links", () => {
  const unavailable = { unavailable: true };
  const clients = [
    { ...client(), billing: clientBilling(client(), unavailable) },
    {
      ...client({
        slug: "ta",
        display_name: "Technology Associates",
        health: null,
        billing_note: null,
        links: [],
      }),
      billing: clientBilling(
        { display_name: "Technology Associates", billing_note: null },
        unavailable
      ),
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(ClientsView, { clients, mercuryUnavailable: true, invoicing: false })
  );
  assert.match(html, /Sauna Boy/);
  assert.match(html, /Technology Associates/);
  assert.match(html, /deluxe · live · nate · cold/);
  assert.match(html, /Mercury unavailable/); // fail-soft: page still renders
  assert.match(html, /note: net 15/);
  assert.match(html, /No health set/);
});

test("ClientDetail: billing, links and the edit form", () => {
  const c = { ...client(), billing: clientBilling(client(), { unavailable: true }) };
  const html = renderToStaticMarkup(React.createElement(ClientDetail, { c, invoicing: true }));
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /href="https:\/\/github.com\/x\/y"/);
  assert.match(html, /name="billing_note"/);
  assert.match(html, /name="slug" value="sauna-boy"/);
  assert.match(html, /Invoices<\/dt><dd>unavailable/); // MERCURY_INVOICING=1 but no invoice data
});

test("billingLabel: paid, none found, overdue, unavailable", () => {
  const base = { mercury: true, lastPaid: null, invoice: null, note: null };
  assert.equal(
    billingLabel({ ...base, lastPaid: { at: "2026-10-03T10:00:00Z", amountCents: 10000 } }),
    "paid 2026-10-03 $100"
  );
  assert.equal(billingLabel(base), "no payment found");
  assert.equal(billingLabel({ ...base, invoice: { nextDue: null, overdue: 2 } }), "2 overdue");
  assert.equal(billingLabel({ ...base, mercury: false }), "billing unavailable");
});
