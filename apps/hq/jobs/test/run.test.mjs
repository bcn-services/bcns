import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main, jobDeps, JOBS, PROCESS_BUDGET_MS } from "../run.mjs";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));

function setup({ run, logFails = false, env = { DATABASE_URL: "unused" } } = {}) {
  const events = [];
  const sql = { end: async () => {} };
  const db = {
    logEvent: async (_s, job, kind, detail) => {
      if (logFails) throw new Error("events insert failed");
      events.push({ job, kind, detail });
    },
  };
  const seen = {};
  const load = async () => ({
    run: async (d) => {
      seen.deps = d;
      return run(d);
    },
  });
  return {
    events,
    seen,
    args: (name) => ({ argv: [name], env, deps: { sql, db, load, job: {} } }),
  };
}

test("usage errors exit 2 and write nothing", async () => {
  for (const argv of [[], ["bogus"], ["source", "extra"], [""]]) {
    const s = setup({ run: async () => ({}) });
    const code = await main({ argv, env: {}, deps: { ...s.args("x").deps } });
    assert.equal(code, 2, JSON.stringify(argv));
    assert.equal(s.events.length, 0);
  }
});

test("the CLI itself: `run.mjs bogus` exits non-zero without needing postgres or env", () => {
  const r = spawnSync(process.execPath, [RUN, "bogus"], { encoding: "utf8", env: {} });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
  assert.equal(spawnSync(process.execPath, [RUN], { env: {} }).status, 2);
});

test("success exits 0 and writes one run row {ok:true, ms, error:null}", async () => {
  const s = setup({ run: async () => ({ done: 1 }) });
  const code = await main(s.args("qualify"));
  assert.equal(code, 0);
  assert.equal(s.events.length, 1);
  const [e] = s.events;
  assert.equal(e.job, "qualify");
  assert.equal(e.kind, "run");
  assert.equal(e.detail.ok, true);
  assert.equal(e.detail.error, null);
  assert.equal(typeof e.detail.ms, "number");
});

test("a throwing job exits 1 and records ok:false with the message", async () => {
  const s = setup({
    run: async () => {
      throw new Error("places exploded");
    },
    env: { DATABASE_URL: "unused", GOOGLE_PLACES_API_KEY: "k" },
  });
  const code = await main(s.args("source"));
  assert.equal(code, 1);
  assert.deepEqual(Object.keys(s.events[0].detail).sort(), ["error", "ms", "ok"]);
  assert.equal(s.events[0].detail.ok, false);
  assert.equal(s.events[0].detail.error, "places exploded");
  assert.equal(s.events[0].kind, "run");
});

test("if the run row cannot be written the exit code is 1 even when the job passed", async () => {
  const s = setup({ run: async () => ({}), logFails: true });
  assert.equal(await main(s.args("qualify")), 1);
});

test("source without GOOGLE_PLACES_API_KEY fails closed and says so in the run row", async () => {
  const events = [];
  const code = await main({
    argv: ["source"],
    env: { DATABASE_URL: "unused" },
    deps: {
      sql: { end: async () => {} },
      db: { logEvent: async (_s, job, kind, detail) => events.push({ job, kind, detail }) },
      load: async () => ({ run: async () => ({}) }),
    },
  });
  assert.equal(code, 1);
  assert.equal(events[0].detail.ok, false);
  assert.match(events[0].detail.error, /GOOGLE_PLACES_API_KEY/);
});

test("a missing DATABASE_URL exits 1 (no db, so no run row) without importing postgres", async () => {
  const code = await main({ argv: ["qualify"], env: {}, deps: {} });
  assert.equal(code, 1);
});

test("the job gets sql, db, and a deadline inside the 22 minute process budget", async () => {
  const s = setup({ run: async () => ({}) });
  const before = Date.now();
  await main(s.args("qualify"));
  const { deadline, sql, db } = s.seen.deps;
  assert.ok(sql && db);
  assert.ok(deadline >= before + PROCESS_BUDGET_MS && deadline <= Date.now() + PROCESS_BUDGET_MS);
  assert.equal(PROCESS_BUDGET_MS, 22 * 60 * 1000);
});

test("deps.job overrides built deps, and undefined optionals are dropped so job defaults apply", async () => {
  const s = setup({ run: async () => ({}) });
  const a = s.args("qualify");
  a.deps.job = { fetchPage: "stub", claude: null, callTasksPerDay: undefined };
  await main(a);
  assert.equal(s.seen.deps.fetchPage, "stub");
  assert.equal(s.seen.deps.claude, null);
  assert.ok(!("callTasksPerDay" in s.seen.deps));
});

test("jobDeps reads env for each job", async () => {
  const q = await jobDeps("qualify", {
    env: { CALL_TASKS_PER_DAY: "30", QUALIFY_BUDGET_MS: "1000" },
    sql: {},
    db: {},
  });
  assert.equal(q.callTasksPerDay, 30);
  assert.equal(q.budgetMs, 1000);
  assert.equal(typeof q.fetchPage, "function");
  const d = await jobDeps("qualify", { env: {}, sql: {}, db: {} });
  assert.equal(d.callTasksPerDay, undefined);

  const calls = [];
  const db = {
    upsertCells: async (_s, g) => calls.push(["upsert", g.length > 0]),
    allCells: async () => [{ c: 1 }],
    saveCell: async () => {},
  };
  const s = await jobDeps("source", {
    env: { GOOGLE_PLACES_API_KEY: "k", SOURCE_CELLS_PER_RUN: "4", BCNS_PLACES_MONTHLY_CAP: "10" },
    sql: {},
    db,
  });
  assert.equal(s.cellsPerRun, 4);
  assert.equal(typeof s.places.search, "function");
  assert.deepEqual(await s.loadCells(), [{ c: 1 }]);
  assert.deepEqual(calls, [["upsert", true]]);
  assert.deepEqual(JOBS, ["source", "qualify"]);
});
