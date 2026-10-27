import { test } from "node:test";
import assert from "node:assert/strict";
import { cellQuery } from "../lib/grid.mjs";
import { run as source } from "../source.mjs";

const cells = (rows) => rows.map((r) => ({ exhausted_at: null, last_run_at: null, ...r }));

// --- jobs/source.mjs -------------------------------------------------------

// `pages`, when given, is the sequence of `{results, nextPageToken}` handed
// back on successive `places.search` calls (across every cell in the run, in
// call order) — the last entry repeats once exhausted. `results` is a
// shorthand for a single always-final page, used by most tests here.
// `budgets`, when given, is the same kind of sequence for `readBudget`.
function harness({
  budget = { remaining: 500 },
  budgets,
  results = [],
  pages,
  known = [],
  cellRows,
  cellsPerRun = 1,
  minRemaining,
} = {}) {
  const events = [];
  const inserted = [];
  const saved = [];
  const placesCalls = [];
  const budgetCalls = [];
  let pageIdx = 0;
  let budgetIdx = 0;
  const deps = {
    sql: {},
    db: {
      logEvent: (_s, job, kind, detail) => events.push({ job, kind, detail }),
      businessByPlaceId: async (_s, id) => (known.includes(id) ? [{ id }] : []),
      insertBusinesses: async (_s, rows) => {
        inserted.push(...rows);
        return rows;
      },
    },
    places: {
      search: async (query, opts) => {
        placesCalls.push({ query, pageToken: opts?.pageToken });
        if (pages) {
          // Cycles per cell (mod length) rather than clamping to the last
          // entry, so a fixed per-cell page script replays for every cell.
          const p = pages[pageIdx % pages.length];
          pageIdx++;
          return p;
        }
        return { results, nextPageToken: null };
      },
    },
    readBudget: async () => {
      const b = budgets ? budgets[Math.min(budgetIdx, budgets.length - 1)] : budget;
      budgetCalls.push(budgetIdx);
      budgetIdx++;
      if (b instanceof Error) throw b;
      return b;
    },
    loadCells: async () =>
      cellRows ?? cells([{ trade: "accountants", town: "Milford", state: "CT" }]),
    saveCell: async (c) => saved.push(c),
    now: new Date("2026-08-30T13:00:00Z"),
  };
  deps.cellsPerRun = cellsPerRun;
  if (minRemaining !== undefined) deps.minRemaining = minRemaining;
  return { events, inserted, saved, placesCalls, budgetCalls, deps };
}

test("a budget below the required allowance never calls Places and writes a skipped event", async () => {
  const h = harness({ budget: { remaining: 5 } });
  await source(h.deps);
  assert.equal(h.placesCalls.length, 0);
  assert.deepEqual(
    h.events.map((e) => e.kind),
    ["skipped"]
  );
  assert.match(h.events[0].detail.reason, /budget exhausted/);
});

test("a budget that cannot be read never spends", async () => {
  const h = harness({ budget: new Error("count query failed") });
  await source(h.deps);
  assert.equal(h.placesCalls.length, 0);
  assert.equal(h.events[0].kind, "skipped");
  assert.match(h.events[0].detail.reason, /unreadable/);
});

test("inserted rows carry place_id, source_query and stage sourced", async () => {
  const h = harness({
    results: [{ place_id: "p1", name: "Harbor Lane Bookkeeping", phone: "phone-fixture-1" }],
  });
  await source(h.deps);
  assert.equal(h.inserted.length, 1);
  assert.equal(h.inserted[0].place_id, "p1");
  assert.equal(h.inserted[0].source_query, "accountants in Milford CT");
  assert.equal(h.inserted[0].stage, "sourced");
  assert.equal(h.inserted[0].town, "Milford");
});

test("a website URL is stored as a bare hostname, and no website as null", async () => {
  const h = harness({
    results: [
      { place_id: "p1", name: "Acme", website: "https://www.acme.example.invalid/roofing?x=1" },
      { place_id: "p2", name: "No Site" },
    ],
  });
  await source(h.deps);
  assert.deepEqual(
    h.inserted.map((r) => r.domain),
    ["acme.example.invalid", null]
  );
});

test("a place_id already in the database is not inserted again", async () => {
  const h = harness({
    results: [
      { place_id: "p1", name: "Known" },
      { place_id: "p2", name: "New" },
    ],
    known: ["p1"],
  });
  await source(h.deps);
  assert.deepEqual(
    h.inserted.map((r) => r.place_id),
    ["p2"]
  );
});

test("a place_id repeated within one page is inserted once", async () => {
  const h = harness({
    results: [
      { place_id: "p1", name: "A" },
      { place_id: "p1", name: "A" },
    ],
  });
  await source(h.deps);
  assert.equal(h.inserted.length, 1);
});

test("an all-known run marks the cell exhausted on the saved row", async () => {
  const results = Array.from({ length: 20 }, (_, i) => ({ place_id: `p${i}`, name: `b${i}` }));
  const h = harness({ results, known: results.map((r) => r.place_id) });
  await source(h.deps);
  assert.equal(h.inserted.length, 0);
  assert.ok(h.saved[0].exhausted_at);
  assert.equal(h.events.at(-1).detail.exhausted, true);
});

test("an exhausted grid writes a skipped event and calls nothing", async () => {
  const h = harness({
    cellRows: cells([
      { trade: "accountants", town: "Milford", state: "CT", exhausted_at: "2026-01-01" },
    ]),
  });
  await source(h.deps);
  assert.equal(h.events.at(-1).kind, "skipped");
  assert.match(h.events.at(-1).detail.reason, /exhausted/);
  assert.equal(h.placesCalls.length, 0);
});

test("a stale row outside the grid is skipped, never searched, never thrown on", async () => {
  const h = harness({
    cellRows: cells([
      { trade: "roofers", town: "Milford", state: "CT", last_run_at: "2020-01-01" },
      { trade: "dentists", town: "Boston", state: "MA" },
      { trade: "bookkeepers", town: "Milford", state: "CT", last_run_at: "2026-08-01" },
    ]),
  });
  await source({ ...h.deps, cellsPerRun: 1 });
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].trade, "bookkeepers");
  assert.equal(h.placesCalls[0].query, "bookkeepers in Milford CT");
});

test("a grid holding only stale rows skips cleanly", async () => {
  const h = harness({ cellRows: cells([{ trade: "roofers", town: "Milford", state: "CT" }]) });
  await source(h.deps);
  assert.equal(h.events.at(-1).kind, "skipped");
  assert.equal(h.placesCalls.length, 0);
});

test("every run writes an events row", async () => {
  const h = harness({ results: [{ place_id: "p1", name: "Acme" }] });
  await source(h.deps);
  assert.ok(h.events.length >= 1);
  assert.equal(h.events.at(-1).job, "source");
});

// --- multi-cell, multi-page, per-page budget checks -------------------------

test("two cells at three pages each make exactly six Places calls, with the budget read before every one", async () => {
  const h = harness({
    cellsPerRun: 2,
    cellRows: cells([
      { trade: "accountants", town: "Milford", state: "CT" },
      { trade: "bookkeepers", town: "Milford", state: "CT" },
    ]),
    budget: { remaining: 500 },
    // Every page but the last of each cell says there is another page; the
    // third is taken (MAX_PAGES=3) and only then does paging stop.
    pages: [
      { results: [], nextPageToken: "t1" },
      { results: [], nextPageToken: "t2" },
      { results: [], nextPageToken: null },
    ],
  });
  const out = await source(h.deps);
  assert.equal(h.placesCalls.length, 6);
  assert.equal(h.budgetCalls.length, 6, "readBudget must run before every page, not once per run");
  assert.equal(out.cells.length, 2);
  // Each cell gets exactly one 'sourced' event, not one per page.
  assert.equal(h.events.filter((e) => e.kind === "sourced").length, 2);
});

test("a budget cut after paid pages still inserts what those pages returned", async () => {
  const h = harness({
    pages: [{ results: [{ place_id: "p1", name: "A" }], nextPageToken: "t1" }],
    budgets: [{ remaining: 500 }, { remaining: 5 }],
  });
  await source(h.deps);
  assert.equal(h.placesCalls.length, 1);
  assert.deepEqual(
    h.inserted.map((r) => r.place_id),
    ["p1"]
  );
  assert.equal(h.saved.length, 1);
});

test("a Places error on one cell logs and moves to the next cell", async () => {
  const h = harness({
    cellsPerRun: 2,
    cellRows: cells([
      { trade: "accountants", town: "Milford", state: "CT" },
      { trade: "bookkeepers", town: "Milford", state: "CT" },
    ]),
    budget: { remaining: 500 },
  });
  let n = 0;
  h.deps.places.search = async () => {
    if (n++ === 0) throw new Error("503");
    return { results: [{ place_id: "p2", name: "B" }], nextPageToken: null };
  };
  await source(h.deps);
  assert.ok(
    h.events.some((e) => e.kind === "error" && /places search failed/.test(e.detail.reason))
  );
  assert.deepEqual(
    h.inserted.map((r) => r.place_id),
    ["p2"]
  );
});

test("a budget that drops mid-run stops before the next page, and logs why", async () => {
  const h = harness({
    cellsPerRun: 2,
    cellRows: cells([
      { trade: "accountants", town: "Milford", state: "CT" },
      { trade: "bookkeepers", town: "Milford", state: "CT" },
    ]),
    pages: [
      { results: [], nextPageToken: "t1" },
      { results: [], nextPageToken: "t2" },
    ],
    // Plenty for the first two pages, then below MIN_REMAINING (20) on the
    // read that would gate the third page.
    budgets: [{ remaining: 500 }, { remaining: 500 }, { remaining: 5 }],
  });
  await source(h.deps);
  // Only the first two pages were ever fetched — the third's budget read
  // stopped the run before a third places.search call, and before the
  // second cell was ever touched.
  assert.equal(h.placesCalls.length, 2);
  // The two paid pages are kept (the cell is saved); the second cell is not.
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].trade, "accountants");
  const skip = h.events.find((e) => e.kind === "skipped");
  assert.match(skip.detail.reason, /budget exhausted/);
});

// --- HQ: budget from events ------------------------------------------------

test("every Places search request logs one places_call event BEFORE the request goes out", async () => {
  const h = harness({
    pages: [
      { results: [], nextPageToken: "t1" },
      { results: [], nextPageToken: null },
    ],
  });
  const order = [];
  const log = h.deps.db.logEvent;
  h.deps.db.logEvent = (s, job, kind, detail) => {
    order.push(`event:${kind}`);
    return log(s, job, kind, detail);
  };
  const search = h.deps.places.search;
  h.deps.places.search = (q, o) => {
    order.push("search");
    return search(q, o);
  };
  await source(h.deps);
  const calls = h.events.filter((e) => e.kind === "places_call");
  assert.equal(calls.length, 2, "one per request, not one per cell");
  assert.ok(calls.every((e) => e.job === "source"));
  assert.equal(calls[0].detail.query, "accountants in Milford CT");
  assert.deepEqual(order.slice(0, 4), [
    "event:places_call",
    "search",
    "event:places_call",
    "search",
  ]);
});

test("a request that throws mid-call was already counted", async () => {
  const h = harness();
  h.deps.places.search = async () => {
    throw new Error("socket hang up");
  };
  await source(h.deps);
  assert.equal(h.events.filter((e) => e.kind === "places_call").length, 1);
});

test("an unreadable budget (count query failed) logs skipped and never logs a places_call", async () => {
  const h = harness({ budget: new Error("count query failed") });
  const out = await source(h.deps);
  assert.equal(out.skipped, "budget-unreadable");
  assert.equal(h.events.filter((e) => e.kind === "places_call").length, 0);
});

test("inserted research is a real object, never a JSON string", async () => {
  const h = harness({ results: [{ place_id: "p1", name: "A", rating: 4.5, review_count: 9 }] });
  await source(h.deps);
  assert.deepEqual(h.inserted[0].research, { rating: 4.5, review_count: 9 });
});
