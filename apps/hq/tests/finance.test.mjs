/** finance.test.mjs — weekly + monthly math against a hand-computed fixture, and freeze-once. */
import { test } from "node:test";
import assert from "node:assert/strict";

const F = await import("../lib/finance.ts");

// now = Wed 2026-10-07 -> current week Monday 2026-10-05. 4 weeks: 10-05, 09-28, 09-21, 09-14 (+ 09-07 for deltas).
const now = new Date("2026-10-07T16:00:00Z");
const calls = [
  { week: "2026-10-05", calls: 50, reached: 10, consults: 2 },
  { week: "2026-09-28", calls: 40, reached: 8, consults: 1 },
  { week: "2026-09-21", calls: 30, reached: 6, consults: 0 },
  { week: "2026-09-14", calls: 20, reached: 4, consults: 0 },
];
const counts = [
  { week: "2026-10-05", pilots: 2, signed: 1 },
  { week: "2026-09-28", pilots: 1, signed: 0 },
];
const inputs = [
  {
    week: "2026-10-05",
    channel: "cold",
    spend_cents: 20000,
    hours: 2,
    leads: null,
    pilots: null,
    signed: null,
  },
  {
    week: "2026-10-05",
    channel: "meta",
    spend_cents: 30000,
    hours: 0,
    leads: 6,
    pilots: 2,
    signed: 2,
  },
];
const weekly = F.weeklyRows({ calls, counts, inputs, now, weeks: 4 });
const at = (ch, wk) => weekly.find((r) => r.channel === ch && r.period === wk);

test("LTV is ARPU x margin / churn, in one place", () => {
  assert.equal(F.LTV_CENTS, 168000); // 10500 * 0.8 / 0.05
});

test("weekly cold row: counts, $/lead, $/signed, CAC, LTV:CAC", () => {
  const r = at("cold", "2026-10-05");
  assert.deepEqual(
    [r.calls, r.reached, r.consults, r.leads, r.pilots, r.signed, r.spendCents, r.hours],
    [50, 10, 2, 10, 2, 1, 20000, 2] // cold leads default to people reached
  );
  assert.equal(r.costPerLeadCents, 2000);
  assert.equal(r.costPerSignedCents, 20000);
  assert.equal(r.cacCents, 25000); // (20000 + 2h x 2500) / 1
  assert.equal(r.ltvCents, 168000);
  assert.equal(r.ltvCac, 6.72);
});

test("weekly deltas are against the previous week, null when a side has no ratio", () => {
  const d = at("cold", "2026-10-05").deltas;
  assert.equal(d.calls, 10);
  assert.equal(d.reached, 2);
  assert.equal(d.consults, 1);
  assert.equal(d.leads, 2);
  assert.equal(d.pilots, 1);
  assert.equal(d.signed, 1);
  assert.equal(d.spendCents, 20000);
  assert.equal(d.costPerLeadCents, 2000);
  assert.equal(d.costPerSignedCents, null); // nothing signed last week
  assert.equal(d.cacCents, null);
  assert.equal(d.ltvCac, null);
});

test("inputs override: the meta channel uses its own leads/pilots/signed", () => {
  const r = at("meta", "2026-10-05");
  assert.deepEqual([r.calls, r.leads, r.pilots, r.signed], [0, 6, 2, 2]);
  assert.equal(r.costPerLeadCents, 5000);
  assert.equal(r.costPerSignedCents, 15000);
  assert.equal(r.cacCents, 15000);
  assert.equal(r.ltvCac, 11.2);
});

test("weeks are newest first, `weeks` per channel, and ratios are null on a zero denominator", () => {
  const cold = weekly.filter((r) => r.channel === "cold").map((r) => r.period);
  assert.deepEqual(cold, ["2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14"]);
  const quiet = at("cold", "2026-09-21");
  assert.equal(quiet.signed, 0);
  assert.equal(quiet.costPerSignedCents, null);
  assert.equal(quiet.cacCents, null);
  assert.equal(quiet.ltvCac, null);
});

test("nyWeek is the New York Monday", () => {
  assert.equal(F.nyWeek("2026-10-05T03:00:00Z"), "2026-09-28"); // Sunday night in New York
  assert.equal(F.nyWeek("2026-10-05T13:00:00Z"), "2026-10-05");
});

const live = F.monthlyRollup(weekly);
const liveRow = (ch, m) => live.find((r) => r.channel === ch && r.period === m);

test("monthly rollup sums weeks into the month of their Monday and re-derives the ratios", () => {
  const sep = liveRow("cold", "2026-09-01");
  assert.deepEqual(
    [sep.calls, sep.reached, sep.consults, sep.leads, sep.pilots, sep.signed],
    [90, 18, 1, 18, 1, 0]
  );
  const oct = liveRow("cold", "2026-10-01");
  assert.deepEqual([oct.calls, oct.leads, oct.signed, oct.spendCents], [50, 10, 1, 20000]);
  assert.equal(oct.cacCents, 25000);
  assert.equal(oct.ltvCac, 6.72);
});

test("monthly view: frozen snapshot wins, the current month stays live and unfrozen, deltas vs the month before", () => {
  const frozenSep = { ...liveRow("cold", "2026-09-01"), calls: 999 };
  const months = F.monthlyView(live, [{ month: "2026-09-01", data: { rows: [frozenSep] } }]);
  assert.deepEqual(
    months.map((m) => [m.month, m.frozen]),
    [
      ["2026-10-01", false],
      ["2026-09-01", true],
    ]
  );
  assert.equal(months[1].rows[0].calls, 999); // the stored row, not today's recompute
  const octCold = months[0].rows.find((r) => r.channel === "cold");
  assert.equal(octCold.deltas.calls, 50 - 999);
  assert.equal(octCold.deltas.spendCents, 20000);
});

test("monthly view without snapshots: every month is live", () => {
  const months = F.monthlyView(live, []);
  assert.ok(months.every((m) => !m.frozen));
  const octCold = months[0].rows.find((r) => r.channel === "cold");
  assert.equal(octCold.deltas.calls, -40); // 50 - 90
  assert.equal(octCold.deltas.signed, 1);
});

const win = { from: "2026-08-31", now }; // window starts before September; "now" is Wed 2026-10-07

test("freezeMonth inserts once, refuses a month already frozen (23505), and validates input", async () => {
  const seen = [];
  const ok = await F.freezeMonth(async (row) => (seen.push(row), null), "2026-09-01", live, win);
  assert.deepEqual(ok, { ok: true });
  assert.equal(seen[0].month, "2026-09-01");
  assert.ok(seen[0].data.rows.every((r) => r.period === "2026-09-01"));
  assert.equal(seen[0].data.assumptions.arpuCents, 10500);

  const dup = await F.freezeMonth(
    async () => ({ code: "23505", message: "duplicate key" }),
    "2026-09-01",
    live,
    win
  );
  assert.deepEqual(dup, { ok: false, reason: "already frozen" });

  assert.deepEqual(await F.freezeMonth(async () => null, "2026-09-15", live, win), {
    ok: false,
    reason: "bad month",
  });
  assert.deepEqual(
    await F.freezeMonth(async () => null, "2025-01-01", live, { ...win, from: "2024-01-01" }),
    {
      ok: false,
      reason: "no data for that month",
    }
  );
  const other = await F.freezeMonth(
    async () => ({ code: "42501", message: "denied" }),
    "2026-09-01",
    live,
    win
  );
  assert.deepEqual(other, { ok: false, reason: "denied" });
});

test("freezeMonth refuses the current month, a future month, and a month the window only partly loaded", async () => {
  const never = async () => assert.fail("must not insert");
  const refused = { ok: false, reason: "month not finished or only partly loaded" };
  // October is the current month (live has October rows): its weeks are still arriving
  assert.deepEqual(await F.freezeMonth(never, "2026-10-01", live, win), refused);
  assert.deepEqual(await F.freezeMonth(never, "2026-11-01", live, win), refused);
  // window starts 2026-09-07, so September (the 1st) is partly there
  assert.deepEqual(
    await F.freezeMonth(never, "2026-09-01", live, { from: "2026-09-07", now }),
    refused
  );
  // the 1st can fall inside a week that is not over: Sun 2026-11-01 New York is still the week of Oct 26
  const sunday = new Date("2026-11-01T17:00:00Z");
  assert.deepEqual(
    await F.freezeMonth(never, "2026-10-01", live, { from: win.from, now: sunday }),
    refused
  );
  assert.deepEqual(
    await F.freezeMonth(async () => null, "2026-10-01", live, {
      from: win.from,
      now: new Date("2026-11-02T17:00:00Z"), // Monday: October's last week is over
    }),
    { ok: true }
  );
});

test("freezable: complete past months inside the window only", () => {
  assert.equal(F.freezable("2026-09-01", "2026-08-31", now), true);
  assert.equal(F.freezable("2026-10-01", "2026-08-31", now), false); // current
  assert.equal(F.freezable("2026-09-01", "2026-09-07", now), false); // partly loaded
  assert.equal(F.freezable("2026-09-01", "2026-09-01", now), true); // window starts on the 1st
  const v = F.monthlyView(live, [], win);
  assert.deepEqual(
    v.map((m) => [m.month, m.freezable]),
    [
      ["2026-10-01", false],
      ["2026-09-01", true],
    ]
  );
  const frozenSep = F.monthlyView(live, [{ month: "2026-09-01", data: { rows: [] } }], win);
  assert.equal(frozenSep[1].freezable, false); // already frozen
  assert.ok(F.monthlyView(live, []).every((m) => !m.freezable)); // no window, no Freeze
});
