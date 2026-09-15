/**
 * qa-briefing.test.mjs — QA pass on lib/briefing.ts (chunk 4 B2), edge cases
 * the existing tests/briefing.test.mjs suite doesn't reach: month-boundary
 * math at extreme UTC offsets (+14 / -12), clock skew on the rate limit,
 * big numbers through token->usd and stored run bodies, and payload row
 * filtering at day boundaries outside the fetch window. Nothing leaves the
 * process — same fake data/AI clients as the main suite.
 * Run with: corepack pnpm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, capReached, isRateLimited, monthSpendUsd, runBriefing, runUsd, tokensToUsd } from "../lib/briefing.ts";
import { computeDailyReport } from "../lib/daily-report.ts";

const NOW = new Date("2026-09-14T15:00:00Z");
const DAY = "2026-09-13";
const CONFIG = { aiEnabled: true, anthropicApiKey: "test-key-not-real", aiMonthlyBudgetUsd: 5, dataSource: "shared" };

const run = (usd, occurred_at) => ({ occurred_at, body: JSON.stringify({ input_tokens: 1, output_tokens: 1, usd }) });

function fakeQuery(resolve, filters) {
  const q = {};
  for (const m of ["eq", "gte", "lt", "lte", "is", "order", "limit"]) q[m] = (...args) => (filters.push([m, ...args]), q);
  q.then = (res, rej) => Promise.resolve().then(() => resolve(filters)).then(res, rej);
  return q;
}

function fakeClient({ runs = [], data = {} } = {}) {
  const calls = {};
  const saved = [];
  const view = (name, rowsFor) => (cols) => {
    const filters = [];
    (calls[name] ??= []).push({ cols, filters });
    return fakeQuery((f) => ({ data: rowsFor(f), error: null }), filters);
  };
  const kindOf = (f) => f.find((x) => x[0] === "eq" && x[1] === "kind")?.[2];
  return {
    calls,
    saved,
    views: {
      records_v1: view("records_v1", (f) => (kindOf(f) === "briefing_run" ? runs : [])),
      daily_summary_v1: view("daily_summary_v1", () => data.summary ?? []),
      campaign_daily_v1: view("campaign_daily_v1", () => data.campaigns ?? []),
      jobs_v1: view("jobs_v1", () => data.jobs ?? []),
      messages_v1: view("messages_v1", () => data.messages ?? []),
      activity_v1: view("activity_v1", () => data.activity ?? []),
    },
    rpc: { save_record: async (args) => (saved.push(args), "rec-id") },
  };
}

function fakeAi({ text = "- Revenue was $300.", usage = { input_tokens: 1000, output_tokens: 200 }, model = "claude-haiku-4-5" } = {}) {
  const calls = [];
  return { calls, ai: { defaultModel: model, messages: { create: async (p) => (calls.push(p), { content: [{ type: "text", text }], usage }) } } };
}

function go(client, fake, { config = {}, onDemand = false, timezone = "UTC", now = NOW } = {}) {
  return runBriefing({ client, config: { ...CONFIG, ...config }, timezone, now, onDemand, createAi: () => fake.ai });
}

/* ------------------------------------------------- month boundary: +14 tz */

test("month boundary at UTC+14 (Kiritimati): a run 1 minute before local midnight is last month", () => {
  const now = new Date("2026-08-31T12:00:00Z"); // local: Sep 1 02:00
  const runs = [run(4, "2026-08-31T09:00:00Z"), run(8, "2026-08-31T10:00:00Z")]; // local Aug 31 23:00 / Sep 1 00:00
  assert.equal(monthSpendUsd(runs, "Pacific/Kiritimati", now), 8);
});

test("month boundary at UTC-12 (Etc/GMT+12): same UTC date, previous local month excluded", () => {
  const now = new Date("2026-09-01T13:00:00Z"); // local: Sep 1 01:00
  const runs = [run(100, "2026-09-01T11:59:00Z"), run(1, "2026-09-01T12:00:00Z")]; // local Aug 31 23:59 / Sep 1 00:00
  assert.equal(monthSpendUsd(runs, "Etc/GMT+12", now), 1);
});

test("full flow at UTC+14: a run local-dated last month doesn't count against the cap", async () => {
  const now = new Date("2026-08-31T20:00:00Z"); // local: Sep 1 10:00
  const client = fakeClient({ runs: [run(100, "2026-08-31T09:00:00Z")] }); // local Aug 31 23:00
  const out = await go(client, fakeAi(), { timezone: "Pacific/Kiritimati", now });
  assert.equal(out.status, "saved");
});

/* --------------------------------------------------------- clock skew */

test("a future occurred_at (clock skew) still reads as within the rate-limit window", () => {
  const future = new Date(NOW.getTime() + 3_600_000).toISOString(); // 1 hour ahead of "now"
  assert.equal(isRateLimited(future, NOW), true);
});

test("a future occurred_at in the current local month still counts toward spend", () => {
  const runs = [run(2, "2026-09-14T20:00:00Z")]; // later "today" than NOW, same month
  assert.equal(monthSpendUsd(runs, "UTC", NOW), 2);
});

/* ------------------------------------------------------------ big numbers */

test("runUsd holds a large recorded cost without precision loss", () => {
  assert.equal(runUsd(JSON.stringify({ usd: 999999.99 })), 999999.99);
});

test("tokensToUsd doesn't overflow or go non-finite on very large token counts", () => {
  const usd = tokensToUsd("claude-haiku-4-5", 1_000_000_000, 1_000_000_000);
  assert.equal(usd, 1000 + 5000);
  assert.equal(Number.isFinite(usd), true);
});

test("capReached with a spend total built from float-drift-prone runs still compares correctly", () => {
  // 0.1 + 0.2 !== 0.3 in floating point; capReached must still see it as under $5.
  const drifted = 4.7 + 0.1 + 0.1 + 0.1; // 4.999999999999999 in IEEE754
  assert.ok(drifted < 5);
  assert.equal(capReached(drifted, 5), false);
});

/* ------------------------------------------------------ payload boundaries */

test("buildPayload at UTC+14: a job updated 1 minute before local midnight is excluded, at local midnight is included", () => {
  const report = computeDailyReport(DAY, [], [], []);
  const rows = {
    campaigns: [],
    jobs: [
      { title: "too early", updated_at: "2026-09-12T09:59:00Z" }, // local Sep 12 23:59 (previous local day)
      { title: "on time", updated_at: "2026-09-12T10:00:00Z" }, // local Sep 13 00:00
    ],
    messages: [],
    activity: [],
  };
  const payload = buildPayload(DAY, report, rows, "Pacific/Kiritimati");
  assert.deepEqual(payload.tasks_updated.map((t) => t.title), ["on time"]);
});

test("buildPayload drops campaign rows for a neighboring day even if present in the fetched rows", () => {
  const report = computeDailyReport(DAY, [], [], []);
  const rows = {
    campaigns: [
      { day: "2026-09-12", campaign_name: "yesterday-of-yesterday" },
      { day: DAY, campaign_name: "the day" },
      { day: "2026-09-14", campaign_name: "tomorrow" },
    ],
    jobs: [],
    messages: [],
    activity: [],
  };
  const payload = buildPayload(DAY, report, rows, "UTC");
  assert.deepEqual(payload.campaigns.map((c) => c.campaign), ["the day"]);
});

/* --------------------------------------------------------------- mutation-adjacent regression */

test("capReached and isRateLimited use strict boundary semantics (>= and <, not > and <=)", () => {
  // Pins the exact operators so a future refactor can't silently flip them.
  assert.equal(capReached(5, 5), true); // >= , not >
  assert.equal(isRateLimited(new Date(NOW.getTime() - 15 * 60_000).toISOString(), NOW), false); // < , not <=
});
