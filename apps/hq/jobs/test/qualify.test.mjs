import { test } from "node:test";
import assert from "node:assert/strict";
import { trim, MAX_CHARS } from "../lib/trim.mjs";
import {
  run as qualify,
  PROMPT,
  parseAnswer,
  fitScore,
  MIN_SIGNALS,
  CHAIN_CAP,
  CALL_TASKS_PER_DAY,
  CODE_NICHE,
  MAX_QUALIFY_FAILURES,
} from "../qualify.mjs";

test("trim caps a 500KB page at 7000 characters", () => {
  const big = "<p>" + "word ".repeat(120_000) + "</p>";
  assert.ok(big.length > 500_000);
  const out = trim(big);
  assert.ok(out.length <= MAX_CHARS, `got ${out.length}`);
});

test("trim removes script, style, nav and footer content", () => {
  const html = `
    <html><head><style>.a{color:red}SECRETSTYLE</style></head>
    <body><nav>SECRETNAV</nav>
    <p>Acme Roofing serves Milford.</p>
    <script>var x = 'SECRETSCRIPT';</script>
    <footer>SECRETFOOTER</footer></body></html>`;
  const out = trim(html);
  for (const s of ["SECRETSTYLE", "SECRETNAV", "SECRETSCRIPT", "SECRETFOOTER"]) {
    assert.ok(!out.includes(s), `${s} survived the trim`);
  }
  assert.match(out, /Acme Roofing serves Milford\./);
});

test("trim leaks nothing from an unclosed script tag", () => {
  assert.ok(!trim('<p>hi</p><script>var x = "SECRET"').includes("SECRET"));
});

test("trim collapses whitespace and decodes common entities", () => {
  assert.equal(trim("<p>a  &amp;   b</p>\n\n\n<p>c</p>"), "a & b\nc");
  assert.equal(trim(""), "");
});

test("trim does not fuse words across block tags", () => {
  assert.match(trim("<li>Roofing</li><li>Siding</li>"), /Roofing\nSiding/);
});

// --- jobs/qualify.mjs ------------------------------------------------------

// --- fitScore --------------------------------------------------------------

const S = (n) =>
  Object.fromEntries(["store", "booking", "payments", "marketing"].map((k, i) => [k, i < n]));
const base = { signals: S(2), nicheScore: 0, headcountBand: null, locations: null, state: "TX" };

test("fitScore: one more signal outranks every other factor combined", () => {
  const best2 = fitScore({
    ...base,
    signals: S(2),
    nicheScore: 100,
    headcountBand: "1-5",
    locations: 1,
    state: "CT",
  });
  const bare3 = fitScore({ ...base, signals: S(3) });
  assert.ok(bare3 > best2, `${bare3} should beat ${best2}`);
  assert.ok(
    fitScore({ ...base, signals: S(4) }) >
      fitScore({
        ...base,
        signals: S(3),
        nicheScore: 100,
        headcountBand: "1-5",
        locations: 1,
        state: "CT",
      })
  );
});

test("fitScore: small headcount and a single location add points; larger or multi do not", () => {
  const b = fitScore(base);
  assert.equal(fitScore({ ...base, headcountBand: "1-5" }), b + 5);
  assert.equal(fitScore({ ...base, headcountBand: "6-20" }), b + 5);
  assert.equal(fitScore({ ...base, headcountBand: "21-50" }), b);
  assert.equal(fitScore({ ...base, headcountBand: "51+" }), b);
  assert.equal(fitScore({ ...base, locations: 1 }), b + 5);
  assert.equal(fitScore({ ...base, locations: 2 }), b);
});

test("fitScore: chains and franchises (3+ locations) score below any non-chain that passes the gate", () => {
  const chain = fitScore({
    ...base,
    signals: S(4),
    nicheScore: 100,
    headcountBand: "1-5",
    locations: 3,
    state: "CT",
  });
  assert.ok(chain <= CHAIN_CAP);
  assert.ok(chain < fitScore({ ...base, signals: S(MIN_SIGNALS) }));
});

test("fitScore: geography only breaks ties, CT > NYC > CA > other, and totals under one point", () => {
  const g = (state) => fitScore({ ...base, state });
  assert.ok(g("CT") > g("NY") && g("NY") > g("CA") && g("CA") > g("TX"));
  assert.equal(g("NJ"), g("NY"));
  // The biggest geography bonus is smaller than the smallest other step (1 niche point).
  assert.ok(g("CT") - g("TX") < 1);
  assert.equal(typeof g("CT"), "number");
  assert.equal(g("CT"), 40.3); // exact one-decimal value, no float noise
});

test("fitScore: a CT row with one fewer niche point ranks below the same row elsewhere", () => {
  // nicheScore 50 -> 3 points, 33 -> 2 points: exactly one point apart.
  const elsewhere = fitScore({ ...base, nicheScore: 50, state: "TX" });
  const ct = fitScore({ ...base, nicheScore: 33, state: "CT" });
  assert.ok(ct < elsewhere, `CT ${ct} should rank below ${elsewhere}`);
  // And with the niche points equal, CT wins the tie.
  assert.ok(fitScore({ ...base, nicheScore: 50, state: "CT" }) > elsewhere);
});

test("fitScore: stays within 0-100 and tolerates a model that returns junk", () => {
  const max = fitScore({
    signals: S(4),
    nicheScore: 9999,
    headcountBand: "1-5",
    locations: 1,
    state: "CT",
  });
  assert.ok(max <= 100);
  const junk = fitScore({
    signals: S(2),
    nicheScore: "lots",
    headcountBand: {},
    locations: "many",
    state: null,
  });
  assert.equal(junk, 40);
});

// --- failures, parking, guards ---------------------------------------------

test("parseAnswer digs the object out of a fenced or chatty reply", () => {
  const obj = { facts: [], fit_score: 10, reason: "thin" };
  assert.deepEqual(parseAnswer(JSON.stringify(obj)), obj);
  assert.deepEqual(parseAnswer("```json\n" + JSON.stringify(obj) + "\n```"), obj);
  assert.deepEqual(parseAnswer(`Here you go:\n${JSON.stringify(obj)}\nHope that helps!`), obj);
  // Already-parsed objects pass through; genuinely unusable prose still throws,
  // which leaves the row at sourced for the next tick rather than mis-filing it.
  assert.deepEqual(parseAnswer(obj), obj);
  assert.throws(() => parseAnswer("The PAGE TEXT appears to be empty."), /no JSON/);
});

// --- jobs/qualify.mjs ------------------------------------------------------

// Signals live in raw tags; each snippet is one platform from lib/signals.mjs.
const SHOPIFY = '<script src="https://cdn.shopify.com/s/files/1/x/theme.js"></script>';
const CALENDLY = '<iframe src="https://calendly.com/harborlane/30min"></iframe>';
const STRIPE = '<script src="https://js.stripe.com/v3/"></script>';

const PAGE = (extra = "") => `<html><body><p>Harbor Lane Bookkeeping, family run since 1998,
  serves Milford and Stratford CT.</p>${extra}</body></html>`;
// Two code-detected signals (store + booking): clears the gate.
const FIT_PAGE = (extra = "") => PAGE(SHOPIFY + CALENDLY + extra);

// 2026-10-19 is a Monday: promotion runs. Tests never read the real clock.
const MONDAY = Date.UTC(2026, 9, 19, 12);
const SATURDAY = Date.UTC(2026, 9, 24, 12);

const MODEL = (over = {}) =>
  JSON.stringify({
    owner_name: null,
    facts: ["has served Milford since 1998", "offers payroll prep", "is run by a small team"],
    signals: { store: true, booking: true, payments: false, marketing: false },
    headcount_band: "6-20",
    locations: 1,
    fit_score: 80,
    reason: "books clients by phone",
    ...over,
  });

// `answer` may be a string, or a function (it can throw). claude === null models
// "no client at all"; `claudeThrows` models a CLI that is absent.
function harness({
  rows,
  pages = {},
  answer,
  claude,
  promotedToday = 0,
  promoted = [],
  now = MONDAY,
  over = {},
} = {}) {
  const events = [];
  const updates = [];
  const fetched = [];
  const promoteCalls = [];
  const asks = [];
  const deps = {
    sql: {},
    clock: () => now,
    db: {
      logEvent: (_s, job, kind, detail) => events.push({ job, kind, detail }),
      sourcedBacklog: async () => rows,
      updateBusiness: async (_s, id, patch) => {
        updates.push({ id, patch });
        return [];
      },
      promotedToday: async () => [{ count: promotedToday }],
      promoteQualified: async (_s, { limit }) => {
        promoteCalls.push(limit);
        return promoted.slice(0, limit);
      },
    },
    fetchPage: async (url) => {
      fetched.push(url);
      if (url in pages) return pages[url];
      const path = url.replace(/^https:\/\/[^/]+/, "");
      if (path === "") return pages.home ?? FIT_PAGE();
      throw new Error("404");
    },
    claude:
      claude === undefined
        ? {
            ask: async (p) => {
              asks.push(p);
              return typeof answer === "function" ? answer() : (answer ?? MODEL());
            },
          }
        : claude,
    ...over,
  };
  return { events, updates, fetched, promoteCalls, asks, deps };
}

// Fixtures: invented businesses, phones are placeholders (no real numbers).
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
const enoent = () => Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });

test("a row with 2+ code signals and a phone is qualified, scored by claude, research is an OBJECT", async () => {
  const h = harness({ rows: [biz()] });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 1);
  const { patch } = h.updates[0];
  assert.equal(patch.stage, "qualified");
  assert.equal(typeof patch.research, "object", "research must be an object, never a JSON string");
  assert.ok(!("email" in patch), "email discovery is gone");
  const r = patch.research;
  assert.equal(r.scored_by, "claude");
  assert.equal(typeof r.fit_score, "number");
  assert.deepEqual(r.signals, { store: true, booking: true, payments: false, marketing: false });
  assert.deepEqual(r.signal_evidence.store, ["shopify"]);
  assert.equal(r.rating, 4.8, "existing research keys survive the merge");
  assert.equal(r.reason, "books clients by phone");
  assert.equal(r.facts.length, 3);
  assert.equal(h.events.at(-1).kind, "qualified");
  assert.equal(h.asks.length, 1);
});

test("the stored fit_score is the code formula, not the number the model returned", async () => {
  const h = harness({ rows: [biz()], answer: MODEL({ fit_score: 100 }) });
  await qualify(h.deps);
  // 2 signals (40) + niche 100*0.06 (6) + band 6-20 (5) + 1 location (5) + CT (0.3)
  assert.equal(h.updates[0].patch.research.fit_score, 56.3);
});

test("the prompt no longer asks for an address", () => {
  assert.doesNotMatch(PROMPT, /"email"|email address|contact email/i);
  assert.match(PROMPT, /"owner_name"/);
});

test("HARD GATE: one signal is lost/unfit and the model is never asked; signals claimed by the model do not count", async () => {
  const h = harness({ rows: [biz()], pages: { home: PAGE(SHOPIFY) } });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 0);
  assert.equal(out.lost, 1);
  assert.equal(h.asks.length, 0);
  assert.equal(h.updates[0].patch.stage, "lost");
  assert.equal(h.updates[0].patch.research.lost_reason, "unfit");
  assert.equal(MIN_SIGNALS, 2);
});

test("HARD GATE: no phone is lost/no_phone, nothing fetched, nothing asked", async () => {
  const h = harness({ rows: [biz({ phone: "  " }), biz({ id: "b2", phone: null })] });
  const out = await qualify(h.deps);
  assert.equal(out.lost, 2);
  assert.deepEqual(
    h.updates.map((u) => u.patch.research.lost_reason),
    ["no_phone", "no_phone"]
  );
  assert.equal(h.fetched.length, 0);
  assert.equal(h.asks.length, 0);
});

test("a business with no domain is lost/unfit, not retried forever", async () => {
  const h = harness({ rows: [biz({ domain: null })] });
  await qualify(h.deps);
  assert.equal(h.updates[0].patch.research.lost_reason, "unfit");
  assert.equal(h.fetched.length, 0);
});

test("new code never writes the legacy no_email stage", async () => {
  const h = harness({
    rows: [biz(), biz({ id: "b2", phone: null }), biz({ id: "b3", domain: null })],
  });
  await qualify(h.deps);
  const stages = h.updates.map((u) => u.patch.stage);
  assert.ok(
    stages.every((s) => s === "qualified" || s === "lost"),
    stages.join()
  );
});

// --- code-only fallback -----------------------------------------------------

test("claude absent from deps: every row is scored by code alone, scored_by=code", async () => {
  const h = harness({ rows: [biz(), biz({ id: "b2" })], claude: null });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 2);
  for (const u of h.updates) {
    assert.equal(u.patch.stage, "qualified");
    assert.equal(u.patch.research.scored_by, "code");
    assert.equal(typeof u.patch.research.fit_score, "number");
  }
  // 2 signals (40) + flat niche 50*0.06 (3) + CT (0.3); no headcount/location read
  assert.equal(h.updates[0].patch.research.fit_score, 43.3);
  assert.equal(CODE_NICHE, 50);
});

test("claude CLI absent (ENOENT): code-only score, asked once, the run does not break, promotion still runs", async () => {
  let asks = 0;
  const h = harness({
    rows: [biz(), biz({ id: "b2" }), biz({ id: "b3" })],
    claude: {
      ask: async () => {
        asks++;
        throw enoent();
      },
    },
    promoted: [{ id: "q1" }],
  });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 3);
  assert.equal(out.errors, 0);
  assert.equal(asks, 1, "an outage is detected once; the rest of the run is code-only");
  assert.ok(h.updates.every((u) => u.patch.research.scored_by === "code"));
  assert.equal(h.events.filter((e) => e.kind === "error").length, 1);
  assert.equal(out.promoted, 1);
});

test("an unparseable answer falls back to code for that row only; the next row still uses claude", async () => {
  const answers = ["I cannot read this page, sorry.", MODEL()];
  const h = harness({ rows: [biz(), biz({ id: "b2" })], answer: () => answers.shift() });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 2);
  assert.deepEqual(
    h.updates.map((u) => u.patch.research.scored_by),
    ["code", "claude"]
  );
  assert.equal(out.errors, 0);
});

test("an answer that is JSON but not an object falls back to code", async () => {
  const h = harness({ rows: [biz()], answer: "[1,2]" });
  await qualify(h.deps);
  assert.equal(h.updates[0].patch.research.scored_by, "code");
});

test("a trade outside the grid gets no code niche points", async () => {
  const h = harness({ rows: [biz({ trade: "roofers" })], claude: null });
  await qualify(h.deps);
  assert.equal(h.updates[0].patch.research.fit_score, 40.3);
});

// --- legacy encodings -------------------------------------------------------

test("a legacy double-encoded research string is read, merged, and rewritten as an object", async () => {
  const legacy = JSON.stringify({ rating: 3.9, review_count: 12 });
  const h = harness({ rows: [biz({ research: legacy })] });
  await qualify(h.deps);
  const r = h.updates[0].patch.research;
  assert.equal(typeof r, "object");
  assert.equal(r.rating, 3.9);
  assert.equal(r.review_count, 12);
});

test("garbage research (non-JSON string, array, null) reads as empty, never spreads into the object", async () => {
  for (const research of ["not json", "[1,2]", JSON.stringify("x"), null, [1, 2]]) {
    const h = harness({ rows: [biz({ research })], pages: { home: PAGE(SHOPIFY) } });
    await qualify(h.deps);
    assert.deepEqual(
      Object.keys(h.updates[0].patch.research).sort(),
      ["lost_reason", "signal_evidence", "signals"],
      String(research)
    );
  }
});

// --- failures, parking, guards ---------------------------------------------

test("fetch failures count on the row and leave it sourced; the third parks it lost/fetch_failed", async () => {
  const first = harness({ rows: [biz()], pages: {} });
  first.deps.fetchPage = async () => {
    throw new Error("ECONNREFUSED");
  };
  await qualify(first.deps);
  assert.equal(first.updates[0].patch.stage, undefined);
  assert.equal(first.updates[0].patch.research.qualify_failures, 1);

  const third = harness({
    rows: [biz({ research: { qualify_failures: MAX_QUALIFY_FAILURES - 1 } })],
  });
  third.deps.fetchPage = async () => {
    throw new Error("ECONNREFUSED");
  };
  await qualify(third.deps);
  assert.equal(third.updates[0].patch.stage, "lost");
  assert.equal(third.updates[0].patch.research.lost_reason, "fetch_failed");
});

test("a db error on the stage write rotates the row via qualify_errors and the run continues", async () => {
  const h = harness({ rows: [biz(), biz({ id: "b2" })] });
  const real = h.deps.db.updateBusiness;
  let n = 0;
  h.deps.db.updateBusiness = async (s, id, patch) => {
    if (n++ === 0) throw new Error("db blew up");
    return real(s, id, patch);
  };
  const out = await qualify(h.deps);
  assert.equal(out.errors, 1);
  assert.equal(out.qualified, 1);
  assert.equal(h.updates[0].patch.research.qualify_errors, 1);
});

test("an empty page is skipped and counted, with no claude call", async () => {
  const h = harness({ rows: [biz()], pages: { home: "<script>x</script>" } });
  const out = await qualify(h.deps);
  assert.equal(out.skipped, 1);
  assert.equal(h.asks.length, 0);
  assert.equal(h.updates[0].patch.research.qualify_failures, 1);
});

test("an empty backlog writes a skipped event", async () => {
  const h = harness({ rows: [] });
  await qualify(h.deps);
  assert.equal(h.events[0].kind, "skipped");
});

test("no fetchPage writes a skipped event and never throws", async () => {
  const h = harness({ rows: [biz()], over: { fetchPage: undefined } });
  const out = await qualify(h.deps);
  assert.deepEqual(out.skipped, ["fetchPage"]);
  assert.equal(h.updates.length, 0);
});

test("the page text sent to the model is capped", async () => {
  const h = harness({
    rows: [biz()],
    pages: { home: FIT_PAGE(`<p>${"word ".repeat(50_000)}</p>`) },
  });
  await qualify(h.deps);
  assert.ok(h.asks[0].length < PROMPT.length + 2 * MAX_CHARS + 10);
});

test("the time guard stops the loop and leaves untouched rows at sourced", async () => {
  let t = MONDAY;
  const h = harness({ rows: [biz(), biz({ id: "b2" }), biz({ id: "b3" })] });
  h.deps.clock = () => t;
  const real = h.deps.fetchPage;
  h.deps.fetchPage = async (u) => {
    t += 60_000;
    return real(u);
  };
  const out = await qualify({ ...h.deps, budgetMs: 90_000 });
  assert.equal(out.timedOut, true);
  assert.ok(out.qualified < 3);
  assert.ok(h.events.some((e) => e.kind === "skipped" && /time guard/.test(e.detail.reason)));
});

test("a deadline already passed processes no rows and still promotes", async () => {
  const h = harness({ rows: [biz()], promoted: [{ id: "q1" }] });
  const out = await qualify({ ...h.deps, deadline: MONDAY - 1 });
  assert.equal(h.fetched.length, 0);
  assert.equal(out.timedOut, true);
  assert.equal(out.promoted, 1);
});

// --- promotion top-up -------------------------------------------------------

const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));

test("the daily quota is pinned at 50", () => {
  assert.equal(CALL_TASKS_PER_DAY, 50);
});

test("promotion tops up to 50 a day: 12 already promoted today promotes 38, one event per row", async () => {
  const h = harness({ rows: [], promotedToday: 12, promoted: ids(60) });
  const out = await qualify(h.deps);
  assert.deepEqual(h.promoteCalls, [38]);
  assert.equal(out.promoted, 38);
  assert.equal(h.events.filter((e) => e.kind === "promoted").length, 38);
});

test("nothing promoted yet asks for the full 50; a short pool promotes what exists", async () => {
  const h = harness({ rows: [], promoted: ids(7) });
  const out = await qualify(h.deps);
  assert.deepEqual(h.promoteCalls, [50]);
  assert.equal(out.promoted, 7);
});

test("once the day quota is spent, a later run never even asks the db to promote", async () => {
  for (const spent of [50, 63]) {
    const h = harness({ rows: [], promotedToday: spent, promoted: ids(5) });
    const out = await qualify(h.deps);
    assert.equal(h.promoteCalls.length, 0);
    assert.equal(out.promoted, 0);
  }
});

test("callTasksPerDay is configurable", async () => {
  const h = harness({ rows: [], promotedToday: 5, promoted: ids(20) });
  await qualify({ ...h.deps, callTasksPerDay: 10 });
  assert.deepEqual(h.promoteCalls, [5]);
});

test("promotion has no time-of-day window: it runs at 20:45 UTC on a weekday", async () => {
  const h = harness({ rows: [], promoted: ids(3), now: Date.UTC(2026, 9, 21, 20, 45) });
  const out = await qualify(h.deps);
  assert.equal(out.promoted, 3);
});

test("weekends qualify but never promote", async () => {
  const h = harness({ rows: [biz()], promoted: ids(5), now: SATURDAY });
  const out = await qualify(h.deps);
  assert.equal(out.qualified, 1);
  assert.equal(h.promoteCalls.length, 0);
  const sunday = harness({ rows: [], promoted: ids(5), now: Date.UTC(2026, 9, 25, 12) });
  await qualify(sunday.deps);
  assert.equal(sunday.promoteCalls.length, 0);
});

// Silence "unused" for helpers kept for readability.
void STRIPE;
