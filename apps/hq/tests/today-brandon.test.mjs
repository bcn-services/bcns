/** today-brandon.test.mjs — Brandon's Today data: sections, fit sort, LIMIT 5 + show all, week and done-count, row shaping. */

import { test } from "node:test";
import assert from "node:assert/strict";

const { loadBrandonToday, loadExtras, leadRow, CALLS_LIMIT, FOLLOWUPS_LIMIT, startOfTomorrowET } = await import("../lib/leads.ts");

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
        // only the shape loadBrandonToday sends: "col.is.null,col.lt.<iso>"
        or: (expr) => {
          const [, col, iso] = expr.match(/^(\w+)\.is\.null,\1\.lt\.(.+)$/);
          rows = rows.filter((r) => r[col] == null || r[col] < iso);
          return b;
        },
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
    biz("hq3 later", { stage: "attempted", next_contact_at: "2026-10-30T13:00:00Z" }), // not due yet
    biz("hq3 tomorrow", { stage: "reached", next_contact_at: "2026-10-29T13:00:00Z" }), // not due yet
    biz("hq3 overdue", { stage: "attempted", next_contact_at: "2026-10-26T13:00:00Z" }),
    biz("hq3 today", { stage: "reached", next_contact_at: "2026-10-28T13:00:00Z" }),
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

test("Follow-ups: attempted + reached that are undated or due by end of today ET, oldest first; Consults by date; lost excluded", async () => {
  const t = await loadBrandonToday(memSb(tables()), "brandon", { now: NOW });
  assert.deepEqual(t.followups.map((l) => l.name), ["hq3 nodate", "hq3 overdue", "hq3 today"]);
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

test("startOfTomorrowET: midnight New York, DST aware", () => {
  assert.equal(startOfTomorrowET(new Date("2026-10-28T15:00:00Z")).toISOString(), "2026-10-29T04:00:00.000Z"); // EDT
  assert.equal(startOfTomorrowET(new Date("2026-10-29T03:30:00Z")).toISOString(), "2026-10-29T04:00:00.000Z"); // still the 28th in NY
  assert.equal(startOfTomorrowET(new Date("2026-11-02T15:00:00Z")).toISOString(), "2026-11-03T05:00:00.000Z"); // EST
});

test("Follow-ups are capped", async () => {
  const many = [...Array(FOLLOWUPS_LIMIT + 20)].map((_, i) => biz(`hq3 f${String(i).padStart(3, "0")}`, { stage: "attempted" }));
  const t = await loadBrandonToday(memSb({ businesses: many, tasks: [], call_weeks: [], calls: [] }), "brandon", { now: NOW });
  assert.equal(FOLLOWUPS_LIMIT, 50);
  assert.equal(t.followups.length, FOLLOWUPS_LIMIT);
  assert.equal(t.followupsTotal, FOLLOWUPS_LIMIT + 20); // the head count is not limited
});

test("loadExtras never sends more than 100 ids in one request, and still groups every lead", async () => {
  const seen = [];
  const sb = {
    from: (table) => {
      const b = {
        select: () => b,
        order: () => b,
        in: (_c, ids) => (seen.push([table, ids.length]), (b.ids = ids), b),
        then: (res) => res({ data: table === "calls" ? b.ids.map((id) => ({ business_id: id, by: "brandon", at: "2026-10-27T00:00:00Z", outcome: "reached", note: null })) : [], error: null }),
      };
      return b;
    },
  };
  const ids = [...Array(250)].map((_, i) => `id${i}`);
  const m = await loadExtras(sb, ids);
  assert.ok(seen.length >= 9 && seen.every(([, n]) => n <= 100), JSON.stringify(seen));
  assert.equal(m.size, 250);
  assert.ok(ids.every((id) => m.get(id).calls.length === 1));
});

// ---- the progress rail's numbers (components/TodayBrandonStats.ts) ----
const { railStats, GOAL } = await import("../components/TodayBrandonStats.ts");

// Wed Oct 28 2026, 14:00 ET. n calls on an ET day, at 10:00 ET + i minutes (EDT = UTC-4).
const NOW_R = new Date("2026-10-28T18:00:00Z");
const day = (d, n, outcome = "no_answer") =>
  Array.from({ length: n }, (_, i) => ({ at: `${d}T${String(14 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`, outcome, name: `${d}#${i}` }));

test("rail goals are the pinned daily targets", () => {
  assert.deepEqual(GOAL, { calls: 20, reached: 5, consults: 1 });
});

test("rail: today's counts use ET days, reached includes consult_booked, imported rows are ignored", () => {
  const calls = [
    ...day("2026-10-28", 3),
    { at: "2026-10-28T15:00:00Z", outcome: "reached", name: "A" },
    { at: "2026-10-28T16:00:00Z", outcome: "consult_booked", name: "B" },
    { at: "2026-10-28T13:00:00Z", outcome: "imported", name: "X" },
    { at: "2026-10-29T02:00:00Z", outcome: "reached", name: "late last night ET is still the 28th" },
    { at: "2026-10-28T03:00:00Z", outcome: "reached", name: "before midnight ET: the 27th" },
  ];
  const s = railStats(calls, NOW_R);
  assert.deepEqual(s.today, { calls: 6, reached: 3, consults: 1 });
});

test("rail: best day is the best EARLIER day; beaten flips only when today passes it", () => {
  const calls = [...day("2026-10-26", 18), ...day("2026-10-27", 9), ...day("2026-10-28", 18)];
  let s = railStats(calls, NOW_R);
  assert.equal(s.best, 18);
  assert.equal(s.beaten, false);
  assert.equal(s.toBeat, 1);
  s = railStats([...calls, ...day("2026-10-28", 1).map((c) => ({ ...c, at: "2026-10-28T17:30:00Z" }))], NOW_R);
  assert.equal(s.beaten, true);
  assert.equal(railStats([], NOW_R).best, 0);
});

test("rail: streak counts consecutive business days at the goal, skips weekends, an unfinished today does not break it", () => {
  // Fri 23, Mon 26, Tue 27 hit; Wed 28 (today) at 3 so far; the weekend 24-25 in between has calls too
  const calls = [...day("2026-10-23", 20), ...day("2026-10-24", 30), ...day("2026-10-26", 25), ...day("2026-10-27", 20), ...day("2026-10-28", 3)];
  let s = railStats(calls, NOW_R);
  assert.equal(s.streak, 3);
  // today hitting the goal adds it
  assert.equal(railStats([...calls, ...day("2026-10-28", 17).map((c, i) => ({ ...c, at: `2026-10-28T20:${String(i).padStart(2, "0")}:00Z` }))], NOW_R).streak, 4);
  // a missed business day (Mon 26 at 19) ends the run at Tue
  s = railStats([...day("2026-10-23", 20), ...day("2026-10-26", 19), ...day("2026-10-27", 20)], NOW_R);
  assert.equal(s.streak, 1);
  assert.equal(railStats([], NOW_R).streak, 0);
});

test("rail: streak boxes are the last 7 business days oldest first with today marked; weekend now reads from Friday", () => {
  const s = railStats(day("2026-10-27", 20), NOW_R);
  assert.equal(s.days.map((d) => d.label).join(""), "TWTFMTW"); // Tue20 Wed21 Thu22 Fri23 Mon26 Tue27 Wed28
  assert.equal(s.days.length, 7);
  assert.equal(s.days[6].today, true);
  assert.deepEqual(s.days.map((d) => d.hit), [false, false, false, false, false, true, false]);
  const sat = railStats(day("2026-10-30", 20), new Date("2026-10-31T16:00:00Z")); // Sat Oct 31
  assert.equal(sat.days[6].today, false, "Saturday is not a business day");
  assert.equal(sat.days[6].hit, true, "Friday's goal still shows");
  assert.equal(sat.week.hi, -1);
});

test("rail: week chart is Mon-Fri of this ET week with today highlighted; wins are the newest 5 reached/consult rows", () => {
  const calls = [
    ...day("2026-10-26", 4),
    ...day("2026-10-28", 2),
    ...day("2026-10-19", 9), // last week: not in the chart
    { at: "2026-10-28T15:40:00Z", outcome: "consult_booked", name: "Tidewater HVAC" },
    { at: "2026-10-27T15:12:00Z", outcome: "reached", name: "Pelican Point Dental" },
    ...["a", "b", "c", "d", "e"].map((n, i) => ({ at: `2026-10-2${i}T12:00:00Z`, outcome: "reached", name: n })),
  ];
  const s = railStats(calls, NOW_R);
  assert.deepEqual(s.week.labels, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.equal(s.week.hi, 2);
  assert.deepEqual(s.week.vals, [4, 1, 3, 0, 0]);
  assert.equal(s.wins.length, 5);
  assert.deepEqual(s.wins[0], { kind: "consult", name: "Tidewater HVAC", time: "11:40" });
  assert.deepEqual(s.wins[1], { kind: "reached", name: "Pelican Point Dental", time: "Tue 11:12" });
});

test("Brandon's Today mounts the rail beside the board with his calendar, and never re-adds a sub-12px size", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../components/TodayBrandon.tsx", import.meta.url), "utf8");
  assert.match(page, /<TodayBrandonRail s=\{rail\} calendar=\{<TodayCalendar cal=\{cal\} now=\{now\} \/>\} \/>/);
  assert.match(page, /\.eq\("by", "brandon"\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /font-size:\s*(1[01](\.\d+)?|\d(\.\d+)?)px/);
});

test("MCP today derives client health instead of reading clients.health", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/mcp/tools.ts", import.meta.url), "utf8");
  const region = src.slice(src.indexOf('name: "today"'), src.indexOf('name: "propose_lead_stage"'));
  assert.doesNotMatch(region, /display_name, kind, stage, health, owner/);
  assert.match(region, /deriveFor\(c, sources, now\)\.derived\.health/);
});
