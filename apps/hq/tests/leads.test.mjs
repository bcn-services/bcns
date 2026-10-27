/** leads.test.mjs — outcome map, canLog, business days, late-stage refusal, research parsing, logCall's writes (fake client). */

import { test } from "node:test";
import assert from "node:assert/strict";

const L = await import("../lib/leads.ts");
const { OUTCOMES, canLog, nextBusinessDay, weekStartET, etLocalToDate, parseResearch, logCall, updateLead } = L;

const ID = "11111111-1111-4111-8111-111111111111";
const ACTOR = { id: "22222222-2222-4222-8222-222222222222", handle: "brandon" };

// Records every table call; `business` is what the lead read returns; update/insert resolve ok.
function fakeSb({ business, failCall = false } = {}) {
  const ops = [];
  const sb = {
    from(table) {
      const op = { table, kind: "select", values: null, filters: [] };
      ops.push(op);
      const b = {
        select: () => b,
        eq: (c, v) => (op.filters.push([c, v]), b),
        update: (v) => ((op.kind = "update"), (op.values = v), b),
        insert: (v) => ((op.kind = "insert"), (op.values = v), b),
        maybeSingle: async () => ({ data: table === "businesses" ? business : null, error: null }),
        single: async () => (failCall ? { data: null, error: { message: "boom" } } : { data: { id: "call-1" }, error: null }),
        then: (res, rej) => Promise.resolve({ data: op.kind === "update" ? [{ id: ID }] : [], error: null }).then(res, rej),
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
  const t = nextBusinessDay(new Date("2026-10-23T15:00:00Z"));
  assert.ok([0, 1].includes(0) && t.getUTCDay() === 2);
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

test("logCall: one calls row, one events row (via ui), the stage moves; attempted gets +2 business days", async () => {
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
  assert.equal(upd.values.next_contact_at.slice(0, 10), "2026-10-27"); // Tuesday
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
