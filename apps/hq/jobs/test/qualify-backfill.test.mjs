import { test } from "node:test";
import assert from "node:assert/strict";
import { run as qualify, BACKFILL_LIMIT, MAX_QUALIFY_FAILURES } from "../qualify.mjs";
import { unscoredCallDue } from "../lib/db.mjs";

// --- unscoredCallDue: selection SQL, no DB ----------------------------------

test("unscoredCallDue selects unsuppressed, unscored call_due rows, oldest first, bounded", () => {
  const out = unscoredCallDue((strings, ...vals) => ({ text: strings.join("?"), vals }), {
    limit: 7,
  });
  const text = out.text.replace(/\s+/g, " ");
  assert.match(text, /stage = 'call_due'/);
  assert.match(text, /suppressed_at is null/);
  assert.match(text, /fit_score is null/);
  assert.match(text, /research \? 'backfill_skip'/, "rows already given up on are excluded");
  assert.match(text, /not \(/);
  assert.match(text, /order by updated_at asc/);
  assert.deepEqual(out.vals, [7]);
});

// --- run() harness ----------------------------------------------------------

const SHOPIFY = '<script src="https://cdn.shopify.com/s/files/1/x/theme.js"></script>';
const CALENDLY = '<iframe src="https://calendly.com/harborlane/30min"></iframe>';
const PAGE = (extra = "") => `<html><body><p>Harbor Lane Bookkeeping, family run since 1998,
  serves Milford and Stratford CT.</p>${extra}</body></html>`;
const FIT_PAGE = PAGE(SHOPIFY + CALENDLY);
const ONE_SIGNAL_PAGE = PAGE(SHOPIFY);
const MONDAY = Date.UTC(2026, 9, 19, 12);

const MODEL = JSON.stringify({
  owner_name: null,
  facts: ["has served Milford since 1998"],
  signals: { store: true, booking: true, payments: false, marketing: false },
  headcount_band: "6-20",
  locations: 1,
  fit_score: 80,
  reason: "books clients by phone",
});

const biz = (over = {}) => ({
  id: "b1",
  name: "Harbor Lane Bookkeeping",
  domain: "harborlane.example.invalid",
  phone: "phone-fixture-1",
  state: "CT",
  trade: "bookkeepers",
  research: { rating: 4.8 },
  ...over,
});

// `sourced` feeds sourcedBacklog, `unscored` feeds unscoredCallDue. A db with
// `unscoredCallDue: false` has no such method (an old-style fake). Every
// updateBusiness call is recorded BEFORE it can throw (`failUpdate`: calls
// numbered 1..n throw), so tests see throwing writes too.
function harness({
  sourced = [],
  unscored = [],
  home = FIT_PAGE,
  fetchPage,
  answer = MODEL,
  claude,
  failUpdate = 0,
  onUpdate,
  clock,
  hasUnscored = true,
  over = {},
} = {}) {
  const events = [];
  const updates = [];
  const unscoredCalls = [];
  const promoteCalls = [];
  let n = 0;
  const db = {
    logEvent: (_s, job, kind, detail) => events.push({ job, kind, detail }),
    sourcedBacklog: async () => sourced,
    updateBusiness: async (_s, id, patch) => {
      updates.push({ id, patch });
      onUpdate?.();
      if (++n <= failUpdate) throw new Error("db write failed");
      return [];
    },
    promotedToday: async () => [{ count: 0 }],
    promoteQualified: async () => {
      promoteCalls.push(1);
      return [];
    },
  };
  if (hasUnscored) {
    db.unscoredCallDue = async (_s, opts) => {
      unscoredCalls.push(opts);
      return unscored;
    };
  }
  const deps = {
    sql: {},
    db,
    clock: clock ?? (() => MONDAY),
    fetchPage:
      fetchPage ??
      (async (url) => {
        if (/^https:\/\/[^/]+$/.test(url)) return home;
        throw new Error("404");
      }),
    claude: claude === undefined ? { ask: async () => answer } : claude,
    ...over,
  };
  return { events, updates, unscoredCalls, promoteCalls, deps };
}

const kinds = (h) => h.events.map((e) => e.kind);

// --- bounded, sourced path unchanged ---------------------------------------

test("backfill is bounded by backfillLimit, defaulting to BACKFILL_LIMIT", async () => {
  const h = harness({ over: { backfillLimit: 3 } });
  await qualify(h.deps);
  assert.deepEqual(h.unscoredCalls, [{ limit: 3 }]);
  const d = harness();
  await qualify(d.deps);
  assert.deepEqual(d.unscoredCalls, [{ limit: BACKFILL_LIMIT }]);
  assert.equal(BACKFILL_LIMIT, 100);
});

test("sourced backlog with zero backfill rows behaves as before", async () => {
  const h = harness({
    sourced: [biz({ id: "fit" }), biz({ id: "thin", domain: "thin.example.invalid" })],
    fetchPage: async (url) => {
      if (/^https:\/\/[^/]+$/.test(url)) return url.includes("thin") ? ONE_SIGNAL_PAGE : FIT_PAGE;
      throw new Error("404");
    },
  });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 1);
  assert.equal(out.lost, 1);
  assert.equal(out.backfilled, 0);
  assert.equal(out.backfillSkipped, 0);
  assert.equal(out.timedOut, false);
  assert.deepEqual(
    h.updates.map((u) => [u.id, u.patch.stage]),
    [
      ["fit", "qualified"],
      ["thin", "lost"],
    ]
  );
  assert.ok(!kinds(h).some((k) => k.startsWith("backfill")));
});

// --- success ----------------------------------------------------------------

test("backfill success: research gets a numeric fit_score, signals, page_text, scored_by; no stage", async () => {
  const h = harness({ unscored: [biz()] });
  const out = await qualify(h.deps);
  assert.equal(out.backfilled, 1);
  assert.equal(out.backfillSkipped, 0);
  assert.equal(out.qualified, 0);
  assert.equal(h.updates.length, 1);
  const { patch } = h.updates[0];
  assert.deepEqual(Object.keys(patch), ["research"]);
  const r = patch.research;
  assert.equal(typeof r.fit_score, "number");
  assert.equal(r.scored_by, "claude");
  assert.deepEqual(r.signals, { store: true, booking: true, payments: false, marketing: false });
  assert.deepEqual(r.signal_evidence.store, ["shopify"]);
  assert.match(r.page_text, /Harbor Lane Bookkeeping/);
  assert.equal(r.rating, 4.8, "existing keys survive");
  assert.ok(!("backfill_skip" in r));
  const ev = h.events.find((e) => e.kind === "backfilled");
  assert.deepEqual(ev.detail, { business: "b1", signals: 2, scored_by: "claude" });
});

test("backfill with no model client is scored by code", async () => {
  const h = harness({ unscored: [biz()], claude: null });
  await qualify(h.deps);
  assert.equal(h.updates[0].patch.research.scored_by, "code");
  assert.equal(typeof h.updates[0].patch.research.fit_score, "number");
});

test("a model outage in the sourced loop carries into backfill (shared model)", async () => {
  let asks = 0;
  const h = harness({
    sourced: [biz({ id: "s1" })],
    unscored: [biz({ id: "u1" })],
    claude: {
      ask: async () => {
        asks++;
        throw Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
      },
    },
  });
  const out = await qualify(h.deps);
  assert.equal(asks, 1, "backfill must not retry a dead model");
  assert.equal(out.qualified, 1);
  assert.equal(out.backfilled, 1);
  assert.equal(h.updates.find((u) => u.id === "u1").patch.research.scored_by, "code");
});

// --- unscorable marker ------------------------------------------------------

const GATES = {
  no_phone: { row: biz({ phone: "  " }), reason: "no_phone" },
  no_domain: { row: biz({ domain: null }), reason: "no_domain" },
  one_signal: { row: biz(), home: ONE_SIGNAL_PAGE, reason: "unfit" },
};

for (const [name, g] of Object.entries(GATES)) {
  test(`backfill gate failure (${name}): backfill_skip=${g.reason}, no fit_score, no stage`, async () => {
    const h = harness({ unscored: [g.row], home: g.home });
    const out = await qualify(h.deps);
    assert.equal(out.backfilled, 0);
    assert.equal(out.backfillSkipped, 1);
    assert.equal(out.lost, 0);
    assert.equal(h.updates.length, 1);
    const { patch } = h.updates[0];
    assert.ok(!("stage" in patch));
    assert.equal(patch.research.backfill_skip, g.reason);
    assert.ok(!("fit_score" in patch.research));
    assert.equal(patch.research.rating, 4.8);
    const ev = h.events.find((e) => e.kind === "backfill_skipped");
    assert.deepEqual(ev.detail, { business: "b1", reason: g.reason });
    assert.ok(!kinds(h).includes("lost"));
  });
}

test("no_phone and no_domain rows cost no fetch", async () => {
  const fetched = [];
  const h = harness({
    unscored: [biz({ id: "a", phone: "" }), biz({ id: "b", domain: "" })],
    fetchPage: async (u) => {
      fetched.push(u);
      return FIT_PAGE;
    },
  });
  await qualify(h.deps);
  assert.equal(fetched.length, 0);
});

test("a one-signal backfill row keeps its signals and evidence on research", async () => {
  const h = harness({ unscored: [biz()], home: ONE_SIGNAL_PAGE });
  await qualify(h.deps);
  const r = h.updates[0].patch.research;
  assert.equal(r.signals.store, true);
  assert.deepEqual(r.signal_evidence.store, ["shopify"]);
});

// --- failure counters -------------------------------------------------------

const cap = MAX_QUALIFY_FAILURES;
const FAILURES = {
  "fetch throws": {
    counter: "qualify_failures",
    reason: "fetch_failed",
    opts: () => ({
      fetchPage: async () => {
        throw new Error("ECONNRESET");
      },
    }),
  },
  "empty page": {
    counter: "qualify_failures",
    reason: "fetch_failed",
    opts: () => ({ home: "" }),
  },
  "post-fetch throw": {
    counter: "qualify_errors",
    reason: "qualify_failed",
    // the success write throws; the failure write that follows lands
    opts: () => ({ failUpdate: 1 }),
  },
};

for (const [name, f] of Object.entries(FAILURES)) {
  test(`backfill ${name}: below the cap only the counter, no backfill_skip, no stage`, async () => {
    const h = harness({ unscored: [biz()], ...f.opts() });
    const out = await qualify(h.deps);
    assert.equal(out.backfillSkipped, 0);
    assert.equal(out.backfilled, 0);
    const last = h.updates.at(-1).patch;
    assert.ok(!("stage" in last));
    assert.equal(last.research[f.counter], 1);
    assert.ok(!("backfill_skip" in last.research));
    assert.ok(!kinds(h).includes("backfill_skipped"));
  });

  test(`backfill ${name}: at the cap (${cap}) sets backfill_skip='${f.reason}', never stage`, async () => {
    const research = { rating: 4.8, [f.counter]: cap - 1 };
    const h = harness({ unscored: [biz({ research })], ...f.opts() });
    const out = await qualify(h.deps);
    assert.equal(out.backfillSkipped, 1);
    assert.equal(out.lost, 0);
    const last = h.updates.at(-1).patch;
    assert.deepEqual(Object.keys(last), ["research"]);
    assert.equal(last.research.backfill_skip, f.reason);
    assert.equal(last.research[f.counter], cap);
    assert.ok(!("lost_reason" in last.research));
    const ev = h.events.find((e) => e.kind === "backfill_skipped");
    assert.deepEqual(ev.detail, { business: "b1", reason: f.reason });
    assert.ok(!kinds(h).includes("lost"));
  });
}

// --- stage is never written, on any path -------------------------------------

test("no updateBusiness patch for a backfill row ever carries stage, on every path", async () => {
  const scenarios = [
    { unscored: [biz()] }, // success
    { unscored: [biz({ phone: "" })] }, // no_phone
    { unscored: [biz({ domain: null })] }, // no domain
    { unscored: [biz()], home: ONE_SIGNAL_PAGE }, // <2 signals
    { unscored: [biz()], home: "" }, // empty page
    { unscored: [biz({ research: { qualify_failures: cap - 1 } })], home: "" }, // third empty
    {
      unscored: [biz()],
      fetchPage: async () => {
        throw new Error("boom");
      },
    }, // fetch throws
    { unscored: [biz()], failUpdate: 1 }, // post-fetch throw
    { unscored: [biz({ research: { qualify_errors: cap - 1 } })], failUpdate: 1 }, // third failure
    { unscored: [biz({ research: '{"rating":1}' })] }, // string research
  ];
  for (const [i, s] of scenarios.entries()) {
    const h = harness(s);
    await qualify(h.deps);
    assert.ok(h.updates.length >= 1, `scenario ${i} wrote nothing`);
    for (const u of h.updates) {
      assert.ok(!("stage" in u.patch), `scenario ${i} wrote stage: ${JSON.stringify(u.patch)}`);
    }
  }
});

// --- string-typed research --------------------------------------------------

test("string research (legacy double-encoding) is merged into a plain object on success", async () => {
  const h = harness({ unscored: [biz({ research: '{"rating":4.8,"old_key":"keep"}' })] });
  await qualify(h.deps);
  const r = h.updates[0].patch.research;
  assert.equal(typeof r, "object");
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.ok(!Array.isArray(r));
  assert.equal(r.rating, 4.8);
  assert.equal(r.old_key, "keep");
  assert.equal(typeof r.fit_score, "number");
});

test("string research is merged into a plain object on a gate failure and on the failure counter", async () => {
  const gate = harness({
    unscored: [biz({ research: '{"old_key":"keep"}' })],
    home: ONE_SIGNAL_PAGE,
  });
  await qualify(gate.deps);
  const g = gate.updates[0].patch.research;
  assert.equal(typeof g, "object");
  assert.equal(g.old_key, "keep");
  assert.equal(g.backfill_skip, "unfit");

  const fail = harness({ unscored: [biz({ research: '{"old_key":"keep"}' })], home: "" });
  await qualify(fail.deps);
  const f = fail.updates[0].patch.research;
  assert.equal(typeof f, "object");
  assert.equal(f.old_key, "keep");
  assert.equal(f.qualify_failures, 1);
});

test("unparseable string research is treated as empty, not thrown on", async () => {
  const h = harness({ unscored: [biz({ research: "not json" })] });
  const out = await qualify(h.deps);
  assert.equal(out.backfilled, 1);
  assert.equal(typeof h.updates[0].patch.research, "object");
});

// --- shared time budget -----------------------------------------------------

test("budget spent during the sourced loop: backfill never starts, timedOut is true", async () => {
  let t = 0;
  const h = harness({
    sourced: [biz({ id: "s1" }), biz({ id: "s2" })],
    unscored: [biz({ id: "u1" })],
    clock: () => t,
    onUpdate: () => (t += 100), // the first sourced row eats the budget
    over: { budgetMs: 50 },
  });
  const out = await qualify(h.deps);
  assert.equal(out.timedOut, true);
  assert.equal(out.qualified, 1);
  assert.equal(out.backfilled, 0);
  assert.equal(h.unscoredCalls.length, 0, "no backfill query once out of time");
  assert.ok(!h.updates.some((u) => u.id === "u1"));
});

test("budget spent exactly as the sourced loop ends: backfill rows are not processed", async () => {
  let t = 0;
  const h = harness({
    sourced: [biz({ id: "s1" })],
    unscored: [biz({ id: "u1" })],
    clock: () => t,
    onUpdate: () => (t += 100),
    over: { budgetMs: 50 },
  });
  const out = await qualify(h.deps);
  assert.equal(out.timedOut, true);
  assert.equal(out.backfilled, 0);
  assert.ok(!h.updates.some((u) => u.id === "u1"));
});

test("budget that expires mid-backfill stops it and reports timedOut", async () => {
  let t = 0;
  const h = harness({
    unscored: [biz({ id: "u1" }), biz({ id: "u2" }), biz({ id: "u3" })],
    clock: () => t,
    onUpdate: () => (t += 100),
    over: { budgetMs: 50 },
  });
  const out = await qualify(h.deps);
  assert.equal(out.backfilled, 1);
  assert.equal(out.timedOut, true);
  assert.deepEqual(
    h.updates.map((u) => u.id),
    ["u1"]
  );
});

test("deadline caps the backfill budget too", async () => {
  let t = 0;
  const h = harness({
    unscored: [biz({ id: "u1" }), biz({ id: "u2" })],
    clock: () => t,
    onUpdate: () => (t += 100),
    over: { deadline: 50 }, // default 20 min budget, but only 50 ms left
  });
  const out = await qualify(h.deps);
  assert.equal(out.backfilled, 1);
  assert.equal(out.timedOut, true);
});

// --- old-style db -----------------------------------------------------------

test("a db without unscoredCallDue still runs, with zero backfill counts", async () => {
  const h = harness({ sourced: [biz()], hasUnscored: false });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 1);
  assert.equal(out.backfilled, 0);
  assert.equal(out.backfillSkipped, 0);
  assert.equal(out.timedOut, false);
});

test("unscoredCallDue returning null is tolerated", async () => {
  const h = harness();
  h.deps.db.unscoredCallDue = async () => null;
  const out = await qualify(h.deps);
  assert.equal(out.backfilled, 0);
});

test("missing fetchPage returns zeroed backfill keys", async () => {
  const h = harness();
  const out = await qualify({ ...h.deps, fetchPage: undefined });
  assert.equal(out.backfilled, 0);
  assert.equal(out.backfillSkipped, 0);
  assert.deepEqual(out.skipped, ["fetchPage"]);
});

test("a throwing backfill select is logged and promotion still runs", async () => {
  const h = harness();
  h.deps.db.unscoredCallDue = async () => {
    throw new Error("statement timeout");
  };
  const out = await qualify(h.deps);
  assert.equal(out.backfilled, 0);
  assert.equal(out.errors, 1);
  assert.equal(h.promoteCalls.length, 1);
  assert.ok(
    h.events.some((e) => e.kind === "error" && /backfill select failed/.test(e.detail.error))
  );
});
