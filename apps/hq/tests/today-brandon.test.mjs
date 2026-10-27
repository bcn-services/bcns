/** today-brandon.test.mjs — Brandon's Today data: sections, fit sort, LIMIT 5 + show all, week and done-count, row shaping. */

import { test } from "node:test";
import assert from "node:assert/strict";

const { loadBrandonToday, leadRow, CALLS_LIMIT } = await import("../lib/leads.ts");

// Tiny in-memory PostgREST: just the filters loadBrandonToday uses.
function memSb(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])];
      let head = false;
      let one = false;
      let lim = Infinity;
      const keys = []; // composite ORDER BY, applied at await time like PostgREST
      const b = {
        select: (_c, o) => ((head = !!o?.head), b),
        eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), b),
        neq: (c, v) => ((rows = rows.filter((r) => r[c] !== v)), b),
        is: (c, v) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), b),
        in: (c, vs) => ((rows = rows.filter((r) => vs.includes(r[c]))), b),
        order: (c, { ascending = true, nullsFirst = false } = {}) => (keys.push([c, ascending, nullsFirst]), b),
        limit: (n) => ((lim = n), b),
        maybeSingle: () => ((one = true), b),
        then: (res, rej) => {
          for (const [c, asc, nf] of [...keys].reverse())
            rows.sort((x, y) => {
              const a = x[c] ?? null, z = y[c] ?? null;
              if (a === z) return 0;
              if (a === null) return nf ? -1 : 1;
              if (z === null) return nf ? 1 : -1;
              return (a < z ? -1 : 1) * (asc ? 1 : -1);
            });
          const n = rows.length;
          rows = rows.slice(0, lim);
          return Promise.resolve({ data: head ? null : one ? (rows[0] ?? null) : rows, count: n, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

const biz = (name, over = {}) => ({ id: name, name, stage: "call_due", assigned_to: "brandon", suppressed_at: null, fit_score: null, trade: "Plumbing", town: "Salem", ...over });
const NOW = new Date("2026-10-28T15:00:00Z"); // Wednesday; ET week starts 2026-10-26

const tables = () => ({
  businesses: [
    ...[10, 90, 55, 70, 30, 80, 20].map((f) => biz(`hq3 due ${f}`, { fit_score: f })),
    biz("hq3 due unscored"),
    biz("hq3 due nates", { fit_score: 99, assigned_to: "nate" }),
    biz("hq3 due hidden", { fit_score: 98, suppressed_at: "2026-10-01T00:00:00Z" }),
    biz("hq3 late", { stage: "attempted", next_contact_at: "2026-10-30T13:00:00Z" }),
    biz("hq3 early", { stage: "reached", next_contact_at: "2026-10-29T13:00:00Z" }),
    biz("hq3 nodate", { stage: "attempted" }),
    biz("hq3 consult b", { stage: "consult_scheduled", consult_at: "2026-11-02T15:00:00Z" }),
    biz("hq3 consult a", { stage: "consult_scheduled", consult_at: "2026-10-30T15:00:00Z" }),
    biz("hq3 lost one", { stage: "lost" }),
  ],
  tasks: [
    { id: "t1", title: "mine open", owner: "brandon", status: "open", due: "2026-10-30" },
    { id: "t2", title: "mine done", owner: "brandon", status: "done", due: null },
    { id: "t3", title: "nates", owner: "nate", status: "open", due: null },
  ],
  call_weeks: [
    { by: "brandon", week: "2026-10-26", calls: 12, reached: 5, consults: 2 },
    { by: "brandon", week: "2026-10-19", calls: 99, reached: 9, consults: 9 },
    { by: "nate", week: "2026-10-26", calls: 1, reached: 1, consults: 1 },
  ],
  calls: [...Array(14)].map((_, i) => ({ id: `c${i}`, by: "brandon" })).concat([{ id: "n1", by: "nate" }]),
});

test("Calls: only Brandon's unsuppressed call_due, best fit first, LIMIT 5, total counted", async () => {
  const t = await loadBrandonToday(memSb(tables()), "brandon", { now: NOW });
  assert.equal(CALLS_LIMIT, 5);
  assert.deepEqual(t.calls.map((l) => l.fit_score), [90, 80, 70, 55, 30]);
  assert.equal(t.callsTotal, 8); // 7 scored + 1 unscored; not Nate's, not suppressed
});

test("show all lifts the limit; unscored sorts last", async () => {
  const t = await loadBrandonToday(memSb(tables()), "brandon", { all: true, now: NOW });
  assert.equal(t.calls.length, 8);
  assert.equal(t.calls.at(-1).name, "hq3 due unscored");
});

test("Follow-ups: attempted + reached, undated first then soonest; Consults by date; lost and others excluded", async () => {
  const t = await loadBrandonToday(memSb(tables()), "brandon", { now: NOW });
  assert.deepEqual(t.followups.map((l) => l.name), ["hq3 nodate", "hq3 early", "hq3 late"]);
  assert.deepEqual(t.consults.map((l) => l.name), ["hq3 consult a", "hq3 consult b"]);
});

test("Your tasks: own, not done. Your week: this ET week's row and the all-time done count", async () => {
  const t = await loadBrandonToday(memSb(tables()), "brandon", { now: NOW });
  assert.deepEqual(t.tasks.map((x) => x.id), ["t1"]);
  assert.deepEqual(t.week, { calls: 12, reached: 5, consults: 2 });
  assert.equal(t.allTime, 14);
  const empty = await loadBrandonToday(memSb({ businesses: [], tasks: [], call_weeks: [], calls: [] }), "brandon", { now: NOW });
  assert.deepEqual(empty.week, { calls: 0, reached: 0, consults: 0 });
  assert.equal(empty.allTime, 0);
});

test("leadRow: call/follow/consult/grid shape, canLog by stage, fit rounded", () => {
  const l = biz("hq3 row", { fit_score: "72.6", stage: "attempted", next_contact_at: "2026-10-30T13:00:00Z", consult_at: "2026-11-02T15:00:00Z" });
  const x = { calls: [{ id: "c", outcome: "no_answer", at: "2026-10-27T15:00:00Z" }], notes: [], links: [] };
  const call = leadRow(l, x, "call");
  assert.equal(call.key, "hq3 row");
  assert.equal(call.right, "Fit 73");
  assert.equal(call.canLog, true);
  assert.equal(call.meta, "Plumbing · Salem");
  assert.match(leadRow(l, x, "follow").meta, /No answer .* · next /);
  assert.match(leadRow(l, undefined, "follow").meta, /no calls yet/);
  assert.ok(leadRow(l, x, "consult").meta.includes("Plumbing"));
  const grid = leadRow(biz("hq3 g", { stage: "lost" }), undefined, "grid");
  assert.equal(grid.canLog, false);
  assert.equal(grid.right, undefined);
  assert.ok(Array.isArray(grid.cells) && grid.cells.every((c) => typeof c === "string"));
});
