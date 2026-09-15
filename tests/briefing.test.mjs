/**
 * briefing.test.mjs — lib/briefing.ts: the AI gates (off, key missing, cap
 * unset, cap reached), the on-demand rate limit, token→USD, this month's
 * spend, the payload the model sees (no ids or PII), and what gets saved.
 * Uses a fake data client and a fake Anthropic client; nothing leaves the process.
 * Run with: corepack pnpm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEFING_KIND,
  BRIEFING_RUN_KIND,
  aiGate,
  briefingFlash,
  capReached,
  isRateLimited,
  loadStoredBriefing,
  monthSpendUsd,
  runBriefing,
  runUsd,
  tokensToUsd,
} from "../lib/briefing.ts";
import { getConfig } from "../lib/env.ts";

const TZ = "UTC";
const NOW = new Date("2026-09-14T15:00:00Z");
const DAY = "2026-09-13";
const CONFIG = { aiEnabled: true, anthropicApiKey: "test-key-not-real", aiMonthlyBudgetUsd: 5, dataSource: "shared" };

const run = (usd, occurred_at = "2026-09-02T10:00:00Z") => ({ occurred_at, body: JSON.stringify({ input_tokens: 1, output_tokens: 1, usd }) });
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

/* ------------------------------------------------------------------ fakes */

function fakeQuery(resolve, filters) {
  const q = {};
  for (const m of ["eq", "gte", "lt", "lte", "is", "order", "limit"]) q[m] = (...args) => (filters.push([m, ...args]), q);
  q.then = (res, rej) => Promise.resolve().then(() => resolve(filters)).then(res, rej);
  return q;
}

/** save_record upserts briefing_run rows into `runs` (newest first), like the
 *  real RPC, so the re-read after a reservation sees it. `concurrent` rows
 *  appear with the first reservation, as another request's would. */
function fakeClient({ runs = [], stored = [], data = {}, fail = [], saveFailKinds = [], hideSaves = false, concurrent = [] } = {}) {
  const calls = {};
  const saved = [];
  const view = (name, rowsFor) => (cols) => {
    const filters = [];
    (calls[name] ??= []).push({ cols, filters });
    return fakeQuery((f) => (fail.includes(name) ? { data: null, error: { message: "boom" } } : { data: rowsFor(f), error: null }), filters);
  };
  const kindOf = (f) => f.find((x) => x[0] === "eq" && x[1] === "kind")?.[2];
  return {
    calls,
    saved,
    views: {
      records_v1: view("records_v1", (f) => (kindOf(f) === BRIEFING_RUN_KIND ? runs : kindOf(f) === BRIEFING_KIND ? stored : (data.records ?? []))),
      daily_summary_v1: view("daily_summary_v1", () => data.summary ?? []),
      campaign_daily_v1: view("campaign_daily_v1", () => data.campaigns ?? []),
      jobs_v1: view("jobs_v1", () => data.jobs ?? []),
      messages_v1: view("messages_v1", () => data.messages ?? []),
      activity_v1: view("activity_v1", () => data.activity ?? []),
    },
    rpc: {
      save_record: async (args) => {
        if (saveFailKinds.includes(args.kind)) throw new Error("save failed");
        saved.push(args);
        if (args.kind === BRIEFING_RUN_KIND && !hideSaves) {
          runs.push(...concurrent.splice(0));
          const row = { external_id: args.external_id, occurred_at: args.occurred_at, body: args.body };
          const i = runs.findIndex((r) => r.external_id === args.external_id);
          if (i >= 0) runs[i] = row;
          else runs.unshift(row);
        }
        return "rec-id";
      },
    },
  };
}

function fakeAi({ text = "- Revenue was $300.", usage = { input_tokens: 1000, output_tokens: 200 }, model = "claude-haiku-4-5", throws = false } = {}) {
  const calls = [];
  const options = [];
  return {
    calls,
    options,
    ai: {
      defaultModel: model,
      messages: {
        create: async (params, opts) => {
          calls.push(params);
          options.push(opts);
          if (throws) throw new Error("api down");
          return { content: [{ type: "text", text }], usage };
        },
      },
    },
  };
}

function go(client, fake, { config = {}, onDemand = false, timezone = TZ, now = NOW } = {}) {
  return runBriefing({ client, config: { ...CONFIG, ...config }, timezone, now, onDemand, createAi: () => fake.ai });
}

/* ------------------------------------------------------------------ gates */

test("AI off: no model call, nothing saved", async () => {
  const client = fakeClient();
  const fake = fakeAi();
  const out = await go(client, fake, { config: { aiEnabled: false } });
  assert.deepEqual(out, { status: "skipped", day: DAY, reason: "ai_off" });
  assert.equal(fake.calls.length, 0);
  assert.equal(client.saved.length, 0);
});

test("key missing: no model call, nothing saved", async () => {
  const client = fakeClient();
  const fake = fakeAi();
  const out = await go(client, fake, { config: { anthropicApiKey: undefined } });
  assert.equal(out.reason, "key_missing");
  assert.equal(fake.calls.length, 0);
  assert.equal(client.saved.length, 0);
});

test("cap unset: no model call even with AI on and a key", async () => {
  const client = fakeClient();
  const fake = fakeAi();
  const out = await go(client, fake, { config: { aiMonthlyBudgetUsd: undefined } });
  assert.equal(out.reason, "cap_unset");
  assert.equal(fake.calls.length, 0);
  assert.equal(client.saved.length, 0);
});

test("the gates are checked in order: off, then key, then cap", () => {
  assert.equal(aiGate({ aiEnabled: false, anthropicApiKey: undefined, aiMonthlyBudgetUsd: undefined }), "ai_off");
  assert.equal(aiGate({ aiEnabled: true, anthropicApiKey: undefined, aiMonthlyBudgetUsd: undefined }), "key_missing");
  assert.equal(aiGate({ aiEnabled: true, anthropicApiKey: "k", aiMonthlyBudgetUsd: undefined }), "cap_unset");
  assert.equal(aiGate({ aiEnabled: true, anthropicApiKey: "k", aiMonthlyBudgetUsd: 1 }), null);
});

test("cap reached: spend exactly at the cap stops the call", async () => {
  const client = fakeClient({ runs: [run(3), run(2)] });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.reason, "cap_reached");
  assert.equal(fake.calls.length, 0);
  assert.equal(client.saved.length, 0);
});

test("cap not reached: spend just under the cap still calls", async () => {
  const client = fakeClient({ runs: [run(3), run(1.99)] });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.status, "saved");
  assert.equal(fake.calls.length, 1);
});

test("capReached is spent >= cap", () => {
  assert.equal(capReached(5, 5), true);
  assert.equal(capReached(5.01, 5), true);
  assert.equal(capReached(4.999, 5), false);
  assert.equal(capReached(0, 5), false);
});

test("last month's runs don't count toward this month's cap", async () => {
  const client = fakeClient({ runs: [run(100, "2026-08-31T12:00:00Z")] });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.status, "saved");
});

test("the month is the client's local month", () => {
  // 03:00Z Sep 1 is still Aug 31 in Los Angeles.
  const now = new Date("2026-09-01T03:00:00Z");
  const runs = [run(1, "2026-08-15T12:00:00Z"), run(2, "2026-09-01T02:00:00Z"), run(4, "2026-07-31T12:00:00Z"), run(8, "not a date"), run(16, null)];
  assert.equal(monthSpendUsd(runs, "America/Los_Angeles", now), 3);
  assert.equal(monthSpendUsd(runs, "UTC", now), 2);
});

test("a malformed run body counts as $0, not NaN", () => {
  assert.equal(runUsd(null), 0);
  assert.equal(runUsd("not json"), 0);
  assert.equal(runUsd(JSON.stringify({ usd: "abc" })), 0);
  assert.equal(runUsd(JSON.stringify({ usd: -3 })), 0);
  assert.equal(runUsd(JSON.stringify({ usd: 0.25 })), 0.25);
});

test("spend unknown (run read fails): no model call", async () => {
  const client = fakeClient({ fail: ["records_v1"] });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.reason, "spend_unknown");
  assert.equal(fake.calls.length, 0);
});

test("a full page of runs reads as spend unknown rather than an undercount", async () => {
  const client = fakeClient({ runs: Array.from({ length: 1000 }, () => run(0)) });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.reason, "spend_unknown");
  assert.equal(fake.calls.length, 0);
});

test("a model without a known price is refused", async () => {
  const client = fakeClient();
  const fake = fakeAi({ model: "claude-sonnet-5" });
  const out = await go(client, fake);
  assert.equal(out.reason, "unpriced");
  assert.equal(fake.calls.length, 0);
});

/* ------------------------------------------------------------- rate limit */

test("on demand: a run 10 minutes ago is rate limited", async () => {
  const client = fakeClient({ runs: [run(0.01, minutesAgo(10))] });
  const fake = fakeAi();
  const out = await go(client, fake, { onDemand: true });
  assert.equal(out.reason, "rate_limited");
  assert.equal(fake.calls.length, 0);
});

test("on demand: exactly 15 minutes later is allowed", async () => {
  const client = fakeClient({ runs: [run(0.01, minutesAgo(15))] });
  const fake = fakeAi();
  const out = await go(client, fake, { onDemand: true });
  assert.equal(out.status, "saved");
});

test("the cron run is not rate limited", async () => {
  const client = fakeClient({ runs: [run(0.01, minutesAgo(1))] });
  const fake = fakeAi();
  const out = await go(client, fake, { onDemand: false });
  assert.equal(out.status, "saved");
});

test("the rate limit reads the latest run, which the query orders first", async () => {
  const client = fakeClient();
  await go(client, fakeAi());
  const runQuery = client.calls.records_v1.find((c) => c.filters.some((f) => f[2] === BRIEFING_RUN_KIND));
  assert.ok(runQuery.filters.some((f) => f[0] === "order" && f[1] === "occurred_at" && f[2].ascending === false));
  assert.equal(isRateLimited(null, NOW), false);
  assert.equal(isRateLimited("garbage", NOW), false);
  assert.equal(isRateLimited(minutesAgo(14.9), NOW), true);
});

/* ------------------------------------------------------------ token → usd */

test("token → usd at Haiku 4.5 prices ($1 in / $5 out per MTok)", () => {
  assert.equal(tokensToUsd("claude-haiku-4-5", 1_000_000, 0), 1);
  assert.equal(tokensToUsd("claude-haiku-4-5", 0, 1_000_000), 5);
  assert.equal(tokensToUsd("claude-haiku-4-5", 1000, 200), 0.002);
  assert.equal(tokensToUsd("claude-unknown", 1, 1), null);
});

/* ------------------------------------------------------------ persistence */

test("a call reserves the worst case, overwrites it with tokens + usd, then saves the briefing", async () => {
  const client = fakeClient();
  const out = await go(client, fakeAi());
  assert.equal(out.status, "saved");
  assert.equal(out.usd, 0.002);
  const [reserve, cost, summary] = client.saved;
  assert.equal(reserve.kind, "briefing_run");
  assert.match(reserve.external_id, /^briefing_run:[0-9a-f-]{36}$/);
  assert.equal(reserve.occurred_at, NOW.toISOString());
  const reserved = JSON.parse(reserve.body);
  assert.equal(reserved.reserved, true);
  assert.ok(reserved.usd > 0.005, `reservation ${reserved.usd} covers max_tokens output`);
  assert.equal(cost.external_id, reserve.external_id);
  assert.deepEqual(JSON.parse(cost.body), { input_tokens: 1000, output_tokens: 200, usd: 0.002 });
  assert.equal(summary.kind, "briefing");
  assert.equal(summary.external_id, `briefing:${DAY}`);
  assert.equal(summary.body, "- Revenue was $300.");
});

test("each call gets its own briefing_run id", async () => {
  const client = fakeClient();
  await go(client, fakeAi());
  await go(client, fakeAi());
  const ids = new Set(client.saved.filter((s) => s.kind === "briefing_run").map((s) => s.external_id));
  assert.equal(ids.size, 2);
});

test("the cost is recorded even when the summary save fails", async () => {
  const client = fakeClient({ saveFailKinds: ["briefing"] });
  const out = await go(client, fakeAi());
  assert.equal(out.status, "failed");
  assert.deepEqual(client.saved.map((s) => s.kind), ["briefing_run", "briefing_run"]);
});

test("a failed model call keeps the worst-case reservation and saves no briefing", async () => {
  const client = fakeClient();
  const out = await go(client, fakeAi({ throws: true }));
  assert.equal(out.status, "failed");
  assert.equal(client.saved.length, 1);
  assert.equal(JSON.parse(client.saved[0].body).reserved, true);
});

test("an empty reply records the cost but saves no briefing", async () => {
  const client = fakeClient();
  const out = await go(client, fakeAi({ text: "  " }));
  assert.equal(out.status, "failed");
  assert.deepEqual(client.saved.map((s) => s.kind), ["briefing_run", "briefing_run"]);
});

test("missing usage keeps the worst case as the recorded cost", async () => {
  const client = fakeClient();
  const out = await go(client, fakeAi({ usage: {} }));
  assert.equal(out.status, "saved");
  assert.equal(out.usd, JSON.parse(client.saved[0].body).usd);
});

test("the call runs with no SDK retries and a timeout", async () => {
  const fake = fakeAi();
  await go(fakeClient(), fake);
  assert.equal(fake.options[0].maxRetries, 0);
  assert.ok(fake.options[0].timeout > 0);
});

/* ------------------------------------------------------------ reservation */

test("no tenant (reservation save fails): the model is never called", async () => {
  const client = fakeClient({ saveFailKinds: ["briefing_run"] });
  const fake = fakeAi();
  const out = await go(client, fake, { onDemand: true });
  assert.equal(out.status, "failed");
  assert.match(out.message, /reservation failed/);
  assert.equal(fake.calls.length, 0);
});

test("a reservation the re-read can't see: no model call, released", async () => {
  const client = fakeClient({ hideSaves: true });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.status, "failed");
  assert.equal(fake.calls.length, 0);
  assert.equal(JSON.parse(client.saved.at(-1).body).released, "invisible");
});

test("the worst case must fit: $4.999 spent of $5 is cap reached, nothing saved", async () => {
  const client = fakeClient({ runs: [run(4.999)] });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.reason, "cap_reached");
  assert.equal(fake.calls.length, 0);
  assert.equal(client.saved.length, 0);
});

test("concurrent on-demand: an earlier reservation in the window wins, this one is released", async () => {
  const other = { external_id: "briefing_run:other", occurred_at: new Date(NOW.getTime() - 1000).toISOString(), body: JSON.stringify({ reserved: true, usd: 0.01 }) };
  const client = fakeClient({ concurrent: [other] });
  const fake = fakeAi();
  const out = await go(client, fake, { onDemand: true });
  assert.equal(out.reason, "rate_limited");
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(JSON.parse(client.saved.at(-1).body), { released: "rate_limited", usd: 0 });
});

test("concurrent on-demand: a later reservation doesn't block the earlier one", async () => {
  const other = { external_id: "briefing_run:other", occurred_at: new Date(NOW.getTime() + 1000).toISOString(), body: JSON.stringify({ reserved: true, usd: 0.01 }) };
  const out = await go(fakeClient({ concurrent: [other] }), fakeAi(), { onDemand: true });
  assert.equal(out.status, "saved");
});

test("concurrent reservations that together pass the cap: released, no call", async () => {
  const other = { external_id: "briefing_run:other", occurred_at: NOW.toISOString(), body: JSON.stringify({ reserved: true, usd: 0.5 }) };
  const client = fakeClient({ runs: [run(4.499)], concurrent: [other] });
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.reason, "cap_reached");
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(JSON.parse(client.saved.at(-1).body), { released: "cap_reached", usd: 0 });
});

test("released and far-future runs don't trip the rate limit", async () => {
  const released = { external_id: "briefing_run:r", occurred_at: minutesAgo(1), body: JSON.stringify({ released: "rate_limited", usd: 0 }) };
  const future = run(0.01, new Date(NOW.getTime() + 3_600_000).toISOString());
  const out = await go(fakeClient({ runs: [future, released] }), fakeAi(), { onDemand: true });
  assert.equal(out.status, "saved");
});

/* ---------------------------------------------------------------- payload */

test("empty data: one call, no tools, payload says '—' and empty lists", async () => {
  const client = fakeClient();
  const fake = fakeAi();
  const out = await go(client, fake);
  assert.equal(out.status, "saved");
  assert.equal(fake.calls.length, 1);
  const params = fake.calls[0];
  assert.equal(params.model, "claude-haiku-4-5");
  assert.equal("tools" in params, false);
  const payload = JSON.parse(params.messages[0].content);
  assert.equal(payload.day, DAY);
  assert.equal(payload.financials.Revenue, "—");
  assert.equal(payload.financials.Profit, "—");
  assert.deepEqual([payload.campaigns, payload.tasks_updated, payload.meetings, payload.activity], [[], [], [], []]);
});

test("payload carries yesterday's rows and no ids or PII", async () => {
  const pii = { id: "row-uuid", client_id: "client-uuid", owner: "Dana Owner", participants: ["dana@example.com"], body: "private notes dana@example.com", detail: "user 1234", url: "https://x.example" };
  const client = fakeClient({
    data: {
      summary: [{ day: DAY, revenue_minor: 30000, orders: 3, currency: "USD" }],
      campaigns: [
        { ...pii, day: DAY, campaign_name: "Fall Launch", campaign_status: "ACTIVE", spend_minor: 5000, impressions: 900, clicks: 40, purchases: 2, purchase_value_minor: 12000, roas: 2.4 },
        { day: "2026-09-12", campaign_name: "Old", spend_minor: 1 },
      ],
      jobs: [
        { ...pii, title: "Restock tees", status: "In Progress", priority: "High", due_on: "2026-09-15", is_done: false, updated_at: "2026-09-13T18:00:00Z" },
        { title: "Stale", updated_at: "2026-09-10T18:00:00Z" },
      ],
      messages: [{ ...pii, kind: "meeting_note", title: "Weekly sync", occurred_at: "2026-09-13T16:00:00Z" }],
      activity: [
        { ...pii, source: "shopify", kind: "order", title: "Order #1001", occurred_at: "2026-09-13T09:00:00Z" },
        { source: "shopify", kind: "order", title: "Today's order", occurred_at: "2026-09-14T09:00:00Z" },
      ],
    },
  });
  const fake = fakeAi();
  await go(client, fake);
  const content = fake.calls[0].messages[0].content;
  const payload = JSON.parse(content);
  assert.equal(payload.financials.Revenue, "$300.00");
  assert.deepEqual(payload.campaigns.map((c) => c.campaign), ["Fall Launch"]);
  assert.deepEqual(payload.tasks_updated.map((t) => t.title), ["Restock tees"]);
  assert.deepEqual(payload.meetings, [{ kind: "meeting_note", title: "Weekly sync" }]);
  assert.deepEqual(payload.activity, [{ source: "shopify", kind: "order", title: "Order #1001" }]);
  for (const leak of ["row-uuid", "client-uuid", "Dana Owner", "dana@example.com", "private notes", "user 1234", "https://x.example", '"id"', '"owner"', '"participants"', '"body"', '"detail"', '"url"']) {
    assert.equal(content.includes(leak), false, `payload leaked ${leak}`);
  }
});

test("the reads never select id, owner, participant, body, detail or url columns", async () => {
  const client = fakeClient();
  await go(client, fakeAi());
  for (const name of ["campaign_daily_v1", "jobs_v1", "messages_v1", "activity_v1"]) {
    const cols = client.calls[name][0].cols.split(",");
    for (const bad of ["id", "client_id", "campaign_id", "external_id", "owner", "participants", "body", "detail", "url"]) {
      assert.equal(cols.includes(bad), false, `${name} selects ${bad}`);
    }
  }
});

test("yesterday's local day bounds the timestamped reads", async () => {
  const client = fakeClient();
  await go(client, fakeAi());
  assert.deepEqual(client.calls.campaign_daily_v1[0].filters.find((f) => f[0] === "eq"), ["eq", "day", DAY]);
  const jobs = client.calls.jobs_v1[0].filters;
  assert.deepEqual(jobs.find((f) => f[0] === "is"), ["is", "deleted_at", null]);
  assert.deepEqual(jobs.find((f) => f[0] === "gte"), ["gte", "updated_at", "2026-09-12T00:00:00Z"]);
  assert.deepEqual(jobs.find((f) => f[0] === "lt"), ["lt", "updated_at", "2026-09-15T00:00:00Z"]);
});

/* ---------------------------------------------------------------- stored */

test("the stored briefing renders from records, and a blank one reads as none", async () => {
  assert.deepEqual(await loadStoredBriefing(fakeClient({ stored: [{ body: " - Hi \n", updated_at: "t" }] }), DAY), { text: "- Hi", updatedAt: "t" });
  assert.equal(await loadStoredBriefing(fakeClient({ stored: [{ body: "  ", updated_at: "t" }] }), DAY), null);
  assert.equal(await loadStoredBriefing(fakeClient(), DAY), null);
  const client = fakeClient();
  await loadStoredBriefing(client, DAY);
  assert.ok(client.calls.records_v1[0].filters.some((f) => f[0] === "eq" && f[1] === "external_id" && f[2] === `briefing:${DAY}`));
});

test("flash codes map to fixed copy; anything else renders nothing", () => {
  assert.equal(briefingFlash("saved"), "Briefing updated.");
  assert.match(briefingFlash("rate_limited"), /15 minutes/);
  assert.match(briefingFlash("cap_reached"), /budget is used up/);
  assert.equal(briefingFlash("<script>"), null);
  assert.equal(briefingFlash("toString"), null);
  assert.equal(briefingFlash(undefined), null);
});

/* -------------------------------------------------------------------- env */

test("AI_MONTHLY_BUDGET_USD: a positive number, anything else is unset", () => {
  const prev = process.env.AI_MONTHLY_BUDGET_USD;
  try {
    for (const [raw, want] of [["12.5", 12.5], [" 20 ", 20], ["0", undefined], ["-1", undefined], ["abc", undefined], ["", undefined], ["Infinity", undefined]]) {
      process.env.AI_MONTHLY_BUDGET_USD = raw;
      assert.equal(getConfig().aiMonthlyBudgetUsd, want, `raw ${JSON.stringify(raw)}`);
    }
    delete process.env.AI_MONTHLY_BUDGET_USD;
    assert.equal(getConfig().aiMonthlyBudgetUsd, undefined);
  } finally {
    if (prev === undefined) delete process.env.AI_MONTHLY_BUDGET_USD;
    else process.env.AI_MONTHLY_BUDGET_USD = prev;
  }
});
