/** leads.test.mjs — outcome map, canLog, business days, late-stage refusal, research parsing, logCall's writes (fake client), and the Pitch tab: slugs, step state, requestStep's deliverables insert, files, table cells. */

import { test } from "node:test";
import assert from "node:assert/strict";

const L = await import("../lib/leads.ts");
const { OUTCOMES, canLog, nextBusinessDay, weekStartET, etLocalToDate, parseResearch, logCall, updateLead } = L;

const ID = "11111111-1111-4111-8111-111111111111";
const ACTOR = { id: "22222222-2222-4222-8222-222222222222", handle: "brandon" };

// Records every table call; `business` is what the lead read returns; update/insert resolve ok.
function fakeSb({ business, failCall = false, recentCall = false, failEvents = false } = {}) {
  const ops = [];
  const sb = {
    from(table) {
      const op = { table, kind: "select", values: null, filters: [] };
      ops.push(op);
      const b = {
        select: () => b,
        eq: (c, v) => (op.filters.push([c, v]), b),
        gte: (c, v) => (op.filters.push([c, ">=", v]), b),
        limit: () => b,
        update: (v) => ((op.kind = "update"), (op.values = v), b),
        insert: (v) => ((op.kind = "insert"), (op.values = v), b),
        maybeSingle: async () => ({ data: table === "businesses" ? business : null, error: null }),
        single: async () => (failCall ? { data: null, error: { message: "boom" } } : { data: { id: "call-1" }, error: null }),
        then: (res, rej) =>
          Promise.resolve(
            table === "events" && failEvents
              ? { data: null, error: { message: "events down" } }
              : { data: op.kind === "update" ? [{ id: ID }] : table === "calls" && op.kind === "select" && recentCall && op.filters.some(([c, v]) => c === "outcome" && v === recentCall) ? [{ id: "call-0" }] : [], error: null }
          ).then(res, rej),
      };
      return b;
    },
  };
  return { sb, ops };
}

test("outcome keys 1-4 map to stage + outcome", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((k) => [OUTCOMES[k].stage, OUTCOMES[k].outcome]),
    [
      ["reached", "reached"],
      ["attempted", "no_answer"],
      ["consult_scheduled", "consult_booked"],
      ["lost", "not_interested"],
    ]
  );
});

test("canLog only on call_due | attempted | reached", () => {
  for (const s of ["call_due", "attempted", "reached"]) assert.equal(canLog(s), true, s);
  for (const s of ["sourced", "qualified", "consult_scheduled", "consult_done", "quoting", "won", "lost", "dead", "no_email", "", null, undefined])
    assert.equal(canLog(s), false, String(s));
});

test("nextBusinessDay skips weekends on the New York calendar", () => {
  const day = (iso, n) => nextBusinessDay(new Date(iso), n).toISOString().slice(0, 10);
  assert.equal(day("2026-10-23T15:00:00Z", 2), "2026-10-27"); // Fri -> Tue
  assert.equal(day("2026-10-22T15:00:00Z", 2), "2026-10-26"); // Thu -> Mon
  assert.equal(day("2026-10-26T15:00:00Z", 2), "2026-10-28"); // Mon -> Wed
  assert.equal(day("2026-10-24T15:00:00Z", 2), "2026-10-27"); // Sat -> Tue
  assert.equal(day("2026-10-25T15:00:00Z", 2), "2026-10-27"); // Sun -> Tue
  // 01:30 UTC Saturday is still Friday evening in New York: Fri -> Tue, not Sat -> Tue by luck
  assert.equal(day("2026-10-24T01:30:00Z", 2), "2026-10-27");
  // 03:00 UTC Monday is still Sunday night in New York: Sun -> Tue
  assert.equal(day("2026-10-26T03:00:00Z", 2), "2026-10-27");
  assert.equal(nextBusinessDay(new Date("2026-10-23T15:00:00Z")).getUTCDay(), 1); // default n=1: Fri -> Mon
});

test("weekStartET is the New York Monday", () => {
  assert.equal(weekStartET(new Date("2026-10-28T12:00:00Z")), "2026-10-26");
  assert.equal(weekStartET(new Date("2026-10-26T03:00:00Z")), "2026-10-19"); // Sunday night in NY
  assert.equal(weekStartET(new Date("2026-11-01T18:00:00Z")), "2026-10-26"); // Sunday
});

test("etLocalToDate reads a datetime-local as New York time (DST aware) and rejects junk", () => {
  assert.equal(etLocalToDate("2026-10-28T10:00").toISOString(), "2026-10-28T14:00:00.000Z"); // EDT
  assert.equal(etLocalToDate("2026-12-01T10:00").toISOString(), "2026-12-01T15:00:00.000Z"); // EST
  assert.equal(etLocalToDate("2026-02-31T10:00"), null);
  assert.equal(etLocalToDate("tomorrow"), null);
});

test("late-stage moves are refused unless HQ_LATE_STAGES=1", async () => {
  for (const stage of ["quoting", "won", "replied"]) {
    const { sb, ops } = fakeSb({ business: { stage: "reached" } });
    await assert.rejects(() => updateLead(sb, ACTOR, "ui", { id: ID, patch: { stage }, env: {} }), /HQ_LATE_STAGES/);
    await assert.rejects(() => updateLead(sb, ACTOR, "ui", { id: ID, patch: { stage }, env: { HQ_LATE_STAGES: "0" } }), /HQ_LATE_STAGES/);
    assert.equal(ops.length, 0, "refused before touching the DB");
    const on = fakeSb({ business: { stage: "reached" } });
    await updateLead(on.sb, ACTOR, "ui", { id: ID, patch: { stage }, env: { HQ_LATE_STAGES: "1" } });
    assert.equal(on.ops.find((o) => o.kind === "update" && o.table === "businesses").values.stage, stage);
    assert.equal(on.ops.find((o) => o.table === "events").values.via, "ui");
  }
  // the default env is process.env
  const prev = process.env.HQ_LATE_STAGES;
  delete process.env.HQ_LATE_STAGES;
  await assert.rejects(() => updateLead(fakeSb().sb, ACTOR, "ui", { id: ID, patch: { stage: "won" } }), /HQ_LATE_STAGES/);
  process.env.HQ_LATE_STAGES = "1";
  await updateLead(fakeSb({ business: { stage: "reached" } }).sb, ACTOR, "ui", { id: ID, patch: { stage: "won" } });
  if (prev === undefined) delete process.env.HQ_LATE_STAGES;
  else process.env.HQ_LATE_STAGES = prev;
});

test("updateLead: ordinary moves pass; bad fields and values are refused", async () => {
  const ok = fakeSb({ business: { stage: "reached" } });
  await updateLead(ok.sb, ACTOR, "ui", { id: ID, patch: { stage: "consult_done", assigned_to: "nate" }, env: {} });
  await assert.rejects(() => updateLead(fakeSb().sb, ACTOR, "ui", { id: ID, patch: { assigned_to: "claude" } }), /nate or brandon/);
  await assert.rejects(() => updateLead(fakeSb().sb, ACTOR, "ui", { id: ID, patch: { suppressed_at: null } }), /cannot update/);
  await assert.rejects(() => updateLead(fakeSb().sb, ACTOR, "ui", { id: ID, patch: { stage: "nonsense" } }), /unknown stage/);
});

test("parseResearch: real object, double-encoded string, junk", () => {
  assert.equal(parseResearch({ research: { fit_score: 70 } }).fit_score, 70);
  assert.equal(parseResearch({ research: JSON.stringify({ fit_score: 55, facts: ["a"] }) }).fit_score, 55);
  assert.equal(parseResearch({ research: JSON.stringify(JSON.stringify({ fit_score: 40 })) }).fit_score, 40);
  for (const bad of ["not json", null, undefined, 5, [], '"x"']) assert.deepEqual(parseResearch({ research: bad }), {});
  assert.deepEqual(parseResearch(null), {});
});

test("logCall: one calls row, one events row (via ui), the stage moves; attempted gets the next business day", async () => {
  const { sb, ops } = fakeSb({ business: { id: ID, stage: "call_due", next_contact_at: null, consult_at: null } });
  const now = new Date("2026-10-23T15:00:00Z"); // Friday
  const r = await logCall(sb, ACTOR, "ui", { businessId: ID, outcome: 2, note: " voicemail ", now });
  assert.equal(r.stage, "attempted");
  const inserts = ops.filter((o) => o.kind === "insert");
  assert.deepEqual(inserts.map((o) => o.table), ["calls", "events"]);
  assert.equal(inserts[0].values.outcome, "no_answer");
  assert.equal(inserts[0].values.note, "voicemail");
  assert.equal(inserts[0].values.by, "brandon");
  assert.equal(inserts[0].values.via, "ui");
  assert.equal(inserts[1].values.via, "ui");
  assert.equal(inserts[1].values.actor, ACTOR.id);
  assert.equal(inserts[1].values.detail.business_id, ID);
  const upd = ops.find((o) => o.kind === "update");
  assert.equal(upd.values.stage, "attempted");
  assert.equal(upd.values.next_contact_at.slice(0, 10), "2026-10-26"); // Monday
  assert.deepEqual(upd.filters, [["id", ID], ["stage", "call_due"]]); // compare-and-set on the stage read
});

test("logCall: consult needs a time and stores consult_at; not interested clears the follow-up; code strings work", async () => {
  const mk = () => fakeSb({ business: { id: ID, stage: "reached", next_contact_at: "2026-10-27T13:00:00Z", consult_at: null } });
  await assert.rejects(() => logCall(mk().sb, ACTOR, "ui", { businessId: ID, outcome: 3 }), /consult time/);
  const c = mk();
  await logCall(c.sb, ACTOR, "ui", { businessId: ID, outcome: "consult_booked", consultAt: "2026-10-28T14:00:00.000Z" });
  const u = c.ops.find((o) => o.kind === "update").values;
  assert.equal(u.stage, "consult_scheduled");
  assert.equal(u.consult_at, "2026-10-28T14:00:00.000Z");
  assert.equal(u.next_contact_at, null);
  const lost = mk();
  await logCall(lost.sb, ACTOR, "ui", { businessId: ID, outcome: 4 });
  assert.equal(lost.ops.find((o) => o.kind === "update").values.stage, "lost");
  const reached = mk();
  await logCall(reached.sb, ACTOR, "ui", { businessId: ID, outcome: 1 });
  assert.equal(reached.ops.find((o) => o.kind === "update").values.stage, "reached");
});

test("logCall refuses a lead that is not loggable, writes nothing, and undoes the move if the call insert fails", async () => {
  for (const stage of ["lost", "consult_scheduled", "quoting", "sourced"]) {
    const { sb, ops } = fakeSb({ business: { id: ID, stage } });
    await assert.rejects(() => logCall(sb, ACTOR, "ui", { businessId: ID, outcome: 1 }), /cannot log/);
    assert.equal(ops.filter((o) => o.kind !== "select").length, 0, stage);
  }
  const bad = fakeSb({ business: { id: ID, stage: "call_due", next_contact_at: null, consult_at: null }, failCall: true });
  await assert.rejects(() => logCall(bad.sb, ACTOR, "ui", { businessId: ID, outcome: 1 }), /boom/);
  const updates = bad.ops.filter((o) => o.kind === "update");
  assert.equal(updates.length, 2);
  assert.equal(updates[1].values.stage, "call_due");
  assert.equal(bad.ops.filter((o) => o.table === "events").length, 0);
  await assert.rejects(() => logCall(fakeSb().sb, ACTOR, "ui", { businessId: "nope", outcome: 1 }), /bad lead id/);
  await assert.rejects(() => logCall(fakeSb().sb, ACTOR, "ui", { businessId: ID, outcome: 9 }), /unknown outcome/);
});

test("logCall dedupe: a retry within a minute for the same actor and lead writes nothing", async () => {
  const { sb, ops } = fakeSb({ business: { id: ID, stage: "reached", next_contact_at: null, consult_at: null }, recentCall: "reached" });
  const now = new Date("2026-10-23T15:00:00Z");
  await assert.rejects(() => logCall(sb, ACTOR, "ui", { businessId: ID, outcome: 1, now }), /already logged/);
  assert.equal(ops.filter((o) => o.kind !== "select").length, 0, "no move, no call, no event");
  const q = ops.find((o) => o.table === "calls");
  assert.deepEqual(q.filters, [["business_id", ID], ["actor", ACTOR.id], ["outcome", "reached"], ["at", ">=", "2026-10-23T14:59:00.000Z"]]);
  // a correction or redial (different outcome) within the minute goes through
  const other = fakeSb({ business: { id: ID, stage: "reached", next_contact_at: null, consult_at: null }, recentCall: "reached" });
  const r = await logCall(other.sb, ACTOR, "ui", { businessId: ID, outcome: 2, now });
  assert.equal(r.stage, "attempted");
  assert.equal(other.ops.filter((o) => o.table === "calls" && o.kind === "insert").length, 1);
});

test("logCall: a failed events insert after the call is written does not fail the call", async () => {
  const { sb, ops } = fakeSb({ business: { id: ID, stage: "call_due", next_contact_at: null, consult_at: null }, failEvents: true });
  const real = console.error;
  const seen = [];
  console.error = (...a) => seen.push(a.join(" "));
  try {
    const r = await logCall(sb, ACTOR, "ui", { businessId: ID, outcome: 1 });
    assert.equal(r.stage, "reached");
  } finally {
    console.error = real;
  }
  assert.equal(ops.filter((o) => o.table === "calls" && o.kind === "insert").length, 1);
  assert.ok(seen.some((m) => m.includes("events insert failed")));
});

// ---- Leads table cells ----------------------------------------------------------------------------
const { fmtShort, fmtConsult, nextCell, leadItem } = L;

test("fmtShort / fmtConsult print New York dates", () => {
  assert.equal(fmtShort("2026-10-23T15:00:00Z"), "Oct 23");
  assert.equal(fmtShort("2026-10-24T01:30:00Z"), "Oct 23"); // still Friday evening in New York
  assert.equal(fmtShort(null), "");
  assert.equal(fmtConsult("2026-10-29T18:00:00Z"), "Oct 29 2pm");
  assert.equal(fmtConsult("2026-10-29T18:30:00Z"), "Oct 29 2:30pm");
  assert.equal(fmtConsult(null), "");
});

test("nextCell: today chip when due today or overdue, a date when later, call_due with no date is today", () => {
  const now = new Date("2026-10-28T15:00:00Z");
  assert.deepEqual(nextCell({ stage: "reached", next_contact_at: "2026-10-28T20:00:00Z" }, now), { text: "today", today: true });
  assert.deepEqual(nextCell({ stage: "attempted", next_contact_at: "2026-10-27T15:00:00Z" }, now), { text: "today", today: true });
  assert.deepEqual(nextCell({ stage: "reached", next_contact_at: "2026-10-30T15:00:00Z" }, now), { text: "Oct 30", today: false });
  assert.deepEqual(nextCell({ stage: "call_due", next_contact_at: null }, now), { text: "today", today: true });
  assert.deepEqual(nextCell({ stage: "consult_scheduled", next_contact_at: null }, now), { text: "", today: false });
});

test("leadItem carries the nine table cells and the slug", () => {
  const lead = {
    id: ID, name: "Harbor Light Plumbing", trade: "plumber", town: "Morro Bay", state: "CA", stage: "call_due", fit_score: 95,
    assigned_to: "brandon", phone: "(805) 555-0100", next_contact_at: null, consult_at: null, os_slug: "harbor-light-plumbing", updated_at: "2026-10-20T00:00:00Z",
  };
  const it = leadItem(lead, { calls: [{ at: "2026-10-23T15:00:00Z" }], notes: [], links: [] }, new Date("2026-10-28T15:00:00Z"));
  assert.equal(it.name, "Harbor Light Plumbing");
  assert.equal(it.stageLabel, "Call due");
  assert.equal(it.canLog, true);
  assert.equal(it.last, "Oct 23");
  assert.deepEqual(it.next, { text: "today", today: true });
  assert.equal(it.consult, "");
  assert.equal(it.slug, "harbor-light-plumbing");
  assert.equal(leadItem({ ...lead, os_slug: undefined }, undefined).slug, null);
});

// ---- Pitch: slugs, step state, files --------------------------------------------------------------
const D = await import("../lib/deliverables.ts");

test("slugify yields a SLUG_RE slug; leadSlug only trusts a stored os_slug", () => {
  assert.equal(D.slugify("Bayside Tax & Bookkeeping"), "bayside-tax-bookkeeping");
  assert.equal(D.slugify("Café Déjà Vu!"), "cafe-deja-vu");
  assert.equal(D.slugify("!!!"), "lead");
  const long = D.slugify("x".repeat(100) + " y");
  assert.ok(long.length <= 63 && D.SLUG_RE.test(long));
  assert.equal(D.leadSlug({ os_slug: "pelican-point-dental" }), "pelican-point-dental");
  for (const bad of [null, undefined, "", "Has Caps", "../etc", "-lead"]) assert.equal(D.leadSlug({ os_slug: bad }), null, String(bad));
});

test("feedbackFor tags each step (the job and pitchState read these literals)", () => {
  assert.equal(D.feedbackFor("prototypes"), "Step: pitch prototypes (3 variants).");
  assert.equal(D.feedbackFor("redo", { feedback: " warmer " }), "Step: redo the 3 pitch prototypes with the feedback below.\nFeedback: warmer");
  assert.equal(
    D.feedbackFor("deck", { pick: "b", feedback: "cut pricing" }),
    "Step: final pitch deck (demo.html + video-guide.md).\nChosen prototype: demo-b.html.\nFeedback: cut pricing"
  );
  assert.equal(D.feedbackFor("quote"), "Step: draft the quote after a good consult.");
});

const row = (over) => ({ id: "r" + Math.random(), slug: "acme", kind: "pitch", status: "done", feedback: "Step: pitch prototypes (3 variants).", paths: [], error: null, created_at: "2026-10-27T15:00:00Z", finished_at: null, ...over });
const DECK_FB = "Step: final pitch deck (demo.html + video-guide.md).\nChosen prototype: demo-c.html.";
const REACHED = { stage: "reached", consult_at: null };

test("pitchState: each step opens only when the one before it is done, and never while a row is running", () => {
  const can = (rows, lead = REACHED) => D.pitchState(rows, lead).can;
  assert.deepEqual(can([]), { prototypes: true, redo: false, deck: false, quote: false });
  assert.equal(can([row({ status: "queued" })]).prototypes, false);
  assert.equal(D.pitchState([row({ status: "running" })], REACHED).busy, true);
  assert.deepEqual(can([row({ status: "failed" })]), { prototypes: true, redo: false, deck: false, quote: false });
  assert.deepEqual(can([row()]), { prototypes: false, redo: true, deck: true, quote: false });
  const decked = [row({ kind: "pitch", feedback: DECK_FB, status: "queued" }), row()];
  assert.deepEqual(can(decked), { prototypes: false, redo: false, deck: false, quote: false });
  const deckDone = [row({ feedback: DECK_FB }), row()];
  assert.deepEqual(can(deckDone), { prototypes: false, redo: false, deck: false, quote: false }, "no consult yet");
  assert.equal(can(deckDone, { stage: "consult_scheduled", consult_at: null }).quote, true);
  assert.equal(can(deckDone, { stage: "reached", consult_at: "2026-10-29T18:00:00Z" }).quote, true);
  assert.equal(D.pitchState(deckDone, REACHED).picked, "c");
  const quoted = [row({ kind: "quote", feedback: "Step: draft the quote after a good consult.", status: "done" }), ...deckDone];
  assert.equal(can(quoted, { stage: "quoting", consult_at: null }).quote, false);
  assert.equal(can([row({ kind: "quote", status: "failed" }), ...deckDone], { stage: "quoting", consult_at: null }).quote, true);
  // a failed deck can be asked for again
  assert.equal(can([row({ feedback: DECK_FB, status: "failed" }), row()]).deck, true);
});

test("fileHref / pathFor: only paths under the lead's own folder, defaults only for the demo files", () => {
  assert.equal(D.fileHref("clients/acme/demo/demo-a.html"), "/files/clients/acme/demo/demo-a.html");
  assert.equal(D.fileHref("clients/a b/x#y.html"), "/files/clients/a%20b/x%23y.html");
  assert.equal(D.pathFor("acme", undefined, "demo-a.html", "demo"), "clients/acme/demo/demo-a.html");
  assert.equal(D.pathFor("acme", undefined, "x.html", "quote"), null);
  const done = row({ paths: ["clients/acme/demo/demo.html", "clients/other/demo/demo-a.html", "clients/acme/../x/demo-b.html"] });
  assert.equal(D.pathFor("acme", done, "demo.html", "demo"), "clients/acme/demo/demo.html");
  assert.equal(D.pathFor("acme", done, "demo-a.html", "demo"), "clients/acme/demo/demo-a.html", "another lead's path is ignored");
  assert.equal(D.pathFor("acme", done, "demo-b.html", "demo"), "clients/acme/demo/demo-b.html", "a .. path is ignored");
  assert.equal(D.pathExt("acme", row({ paths: ["clients/acme/quote/2026-10-28-acme.html"] }), ".html"), "clients/acme/quote/2026-10-28-acme.html");
  assert.equal(D.pathExt("acme", row({ status: "running", paths: ["clients/acme/quote/q.html"] }), ".html"), null);
});

test("withPrint adds the print stylesheet and print() before </body>, or at the end", () => {
  const a = D.withPrint("<html><body><h1>Deck</h1></body></html>");
  assert.ok(a.indexOf("window.print()") > a.indexOf("<h1>Deck</h1>") && a.indexOf("window.print()") < a.indexOf("</body>"));
  assert.ok(a.includes("@media print"));
  assert.ok(D.withPrint("<h1>bare</h1>").endsWith("</script>"));
});

// A fake for requestStep: businesses read, deliverables rows, os_slug claim (unique), deliverables insert.
function fakePitchSb({ lead, rows = [], taken = [], insertError = null }) {
  const ops = [];
  const sb = {
    from(table) {
      const op = { table, kind: "select", values: null, filters: [] };
      ops.push(op);
      const b = {
        select: () => b,
        eq: (c, v) => (op.filters.push([c, v]), b),
        is: (c, v) => (op.filters.push([c, "is", v]), b),
        in: (c, v) => (op.filters.push([c, "in", v]), b),
        order: () => b,
        update: (v) => ((op.kind = "update"), (op.values = v), b),
        insert: (v) => ((op.kind = "insert"), (op.values = v), b),
        maybeSingle: async () => ({ data: table === "businesses" ? lead : null, error: null }),
        single: async () => (insertError ? { data: null, error: { message: insertError } } : { data: { id: "d-1" }, error: null }),
        then: (res, rej) =>
          Promise.resolve(
            table === "deliverables" ? { data: rows, error: null } : op.kind === "update" ? { data: taken.includes(op.values.os_slug) ? [] : [{ id: lead.id }], error: null } : { data: [], error: null }
          ).then(res, rej),
      };
      return b;
    },
  };
  return { sb, ops };
}
const LEAD = { id: ID, name: "Pelican Point Dental", town: "Cayucos", os_slug: null, stage: "reached", consult_at: null };
const inserts = (ops) => ops.filter((o) => o.table === "deliverables" && o.kind === "insert");

test("requestStep: the first prototypes request names the folder and inserts one pitch row as the user", async () => {
  const { sb, ops } = fakePitchSb({ lead: LEAD });
  const r = await D.requestStep(sb, ACTOR, { businessId: ID, step: "prototypes" });
  assert.deepEqual(r, { id: "d-1", slug: "pelican-point-dental", kind: "pitch" });
  assert.deepEqual(ops.find((o) => o.kind === "update").values, { os_slug: "pelican-point-dental" });
  assert.deepEqual(inserts(ops)[0].values, {
    slug: "pelican-point-dental",
    kind: "pitch",
    requested_by: ACTOR.id,
    feedback: "Step: pitch prototypes (3 variants).",
  });
});

test("requestStep: a taken slug falls back to name + town, then name + id prefix", async () => {
  const a = fakePitchSb({ lead: LEAD, taken: ["pelican-point-dental"] });
  assert.equal((await D.requestStep(a.sb, ACTOR, { businessId: ID, step: "prototypes" })).slug, "pelican-point-dental-cayucos");
  const b = fakePitchSb({ lead: LEAD, taken: ["pelican-point-dental", "pelican-point-dental-cayucos"] });
  assert.equal((await D.requestStep(b.sb, ACTOR, { businessId: ID, step: "prototypes" })).slug, "pelican-point-dental-111111");
  const c = fakePitchSb({ lead: LEAD, taken: ["pelican-point-dental", "pelican-point-dental-cayucos", "pelican-point-dental-111111"] });
  await assert.rejects(() => D.requestStep(c.sb, ACTOR, { businessId: ID, step: "prototypes" }), /folder/);
  assert.equal(inserts(c.ops).length, 0);
});

test("requestStep: a lead that already has a folder keeps it and the rows decide what is allowed", async () => {
  const lead = { ...LEAD, os_slug: "acme" };
  const ok = fakePitchSb({ lead, rows: [row()] });
  const r = await D.requestStep(ok.sb, ACTOR, { businessId: ID, step: "deck", pick: "c", feedback: "  shorter " });
  assert.equal(r.slug, "acme");
  assert.equal(ok.ops.filter((o) => o.kind === "update").length, 0, "no rename");
  assert.equal(inserts(ok.ops)[0].values.feedback, "Step: final pitch deck (demo.html + video-guide.md).\nChosen prototype: demo-c.html.\nFeedback: shorter");
  assert.equal(inserts(ok.ops)[0].values.kind, "pitch");
  // still running -> refused
  const busy = fakePitchSb({ lead, rows: [row({ status: "running" })] });
  await assert.rejects(() => D.requestStep(busy.sb, ACTOR, { businessId: ID, step: "redo" }), /not available|running/);
  // prototypes again after they are done -> refused
  await assert.rejects(() => D.requestStep(ok.sb, ACTOR, { businessId: ID, step: "prototypes" }), /not available/);
  // quote before a consult -> refused; after one (and a done deck) -> a quote row
  const deckDone = [row({ feedback: DECK_FB }), row()];
  await assert.rejects(() => D.requestStep(fakePitchSb({ lead, rows: deckDone }).sb, ACTOR, { businessId: ID, step: "quote" }), /not available/);
  const q = fakePitchSb({ lead: { ...lead, stage: "consult_scheduled" }, rows: deckDone });
  assert.equal((await D.requestStep(q.sb, ACTOR, { businessId: ID, step: "quote" })).kind, "quote");
  assert.equal(inserts(q.ops)[0].values.kind, "quote");
  assert.equal(inserts(q.ops)[0].values.slug, "acme");
});

test("requestStep validates before touching the DB", async () => {
  const bad = async (input, re) => {
    const { sb, ops } = fakePitchSb({ lead: LEAD });
    await assert.rejects(() => D.requestStep(sb, ACTOR, input), re);
    assert.equal(ops.length, 0, JSON.stringify(input).slice(0, 60));
  };
  await bad({ businessId: ID, step: "ship-it" }, /unknown step/);
  await bad({ businessId: ID, step: "prototypes; drop" }, /unknown step/);
  await bad({ businessId: "not-a-uuid", step: "prototypes" }, /bad lead id/);
  await bad({ businessId: ID, step: "redo", feedback: "x".repeat(2001) }, /2000/);
  await bad({ businessId: ID, step: "deck" }, /pick/);
  await bad({ businessId: ID, step: "deck", pick: "z" }, /pick/);
  const missing = fakePitchSb({ lead: null });
  await assert.rejects(() => D.requestStep(missing.sb, ACTOR, { businessId: ID, step: "prototypes" }), /not found/);
  const boom = fakePitchSb({ lead: LEAD, insertError: "rls says no" });
  await assert.rejects(() => D.requestStep(boom.sb, ACTOR, { businessId: ID, step: "prototypes" }), /rls says no/);
  // exactly 2000 characters is fine
  const ok = fakePitchSb({ lead: { ...LEAD, os_slug: "acme" }, rows: [row()] });
  await D.requestStep(ok.sb, ACTOR, { businessId: ID, step: "redo", feedback: "x".repeat(2000) });
});

test("loadDeliverables groups rows by slug and asks for newest first in chunks of 100", async () => {
  const rows = [row({ slug: "a" }), row({ slug: "b" }), row({ slug: "a" })];
  const { sb, ops } = fakePitchSb({ lead: LEAD, rows });
  const m = await D.loadDeliverables(sb, ["a", "b", "a"]);
  assert.equal(m.get("a").length, 2);
  assert.equal(m.get("b").length, 1);
  assert.deepEqual(ops[0].filters[0], ["slug", "in", ["a", "b"]]);
  const many = fakePitchSb({ lead: LEAD, rows: [] });
  await D.loadDeliverables(many.sb, Array.from({ length: 250 }, (_, i) => "s" + i));
  assert.equal(many.ops.length, 3);
});

// ---- wiring (source-level: the components need a browser to render) ---------------------------------
import { readFileSync } from "node:fs";
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("PitchTab: prototype links open a new tab safely, step buttons call the one action, PDF prints", () => {
  const t = src("../components/PitchTab.tsx");
  assert.match(t, /requestPitchStep\(lead\.id, step, extra\)/);
  assert.ok((t.match(/target="_blank"/g) ?? []).length >= 3);
  assert.equal((t.match(/target="_blank"/g) ?? []).length, (t.match(/rel="noopener noreferrer"/g) ?? []).length);
  assert.match(t, /demo-\$\{p\}\.html/);
  assert.match(t, /"demo\.html"/);
  assert.match(t, /withPrint\(/);
  for (const label of ["Call went well", "Pitch prototypes", "Final pitch deck", "Quote", "Consult booked", "PDF ↓", "View ↗"]) assert.ok(t.includes(label), label);
  assert.match(t, /sandbox", "allow-scripts allow-modals"/, "the printed deck never gets allow-same-origin");
});

test("requestPitchStep is a server action that goes through requestStep as the session user", () => {
  const a = src("../app/(app)/leads/actions.ts");
  assert.match(a, /export async function requestPitchStep\(/);
  assert.match(a, /requestStep\(sb, actor,/);
  assert.doesNotMatch(a, /service_role|SERVICE_ROLE/);
});

test("Leads page: the nine columns, the drawer tabs, the filters and the subtitle", () => {
  const p = src("../app/(app)/leads/page.tsx");
  for (const h of ["Business", "Trade", "Town", "Stage", "Fit", "Owner", "Last call", "Next", "Consult"]) assert.ok(p.includes(`"${h}"`), h);
  assert.match(p, /sorted by \$\{sortKey\[1\]\.toLowerCase\(\)\}/);
  assert.match(p, /import "\.\.\/\.\.\/leads\.css"/);
  const v = src("../app/(app)/leads/View.tsx");
  assert.match(v, /Search business or town/);
  assert.match(v, /Any trade/);
  assert.match(v, /Anyone/);
  const d = src("../components/LeadDrawer.tsx");
  for (const t of ['"Details"', '"Calls"', '"Pitch"', "Log a call", "Copy", "Next contact"]) assert.ok(d.includes(t), t);
  const css = src("../app/leads.css");
  assert.match(css, /width: 540px/);
  assert.match(css, /padding-right: 564px/);
  assert.match(css, /\.c-trade,[\s\S]*\.c-consult/);
  assert.doesNotMatch(css, /font(-size)?:[^;]*\b(1[01]|[0-9])px/, "nothing under 12px");
});
