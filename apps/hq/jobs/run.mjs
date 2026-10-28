// node jobs/run.mjs <source|qualify|deliverable|uptime>
//
// One entry point for the systemd units (infra/hq-job@.service). Writes one
// events row per run, {job, kind:'run', via:'job', detail:{ok, ms, error}},
// whether the job passed or threw (except an idle {claimed:0} pass); exits
// 0 / 1 (job failed) / 2 (usage).
//
// DATABASE_URL is the HQ project's pooler URL, set only in /srv/hq/jobs.env.
// `postgres` is imported only once the job name is valid and no db is injected,
// so `run.mjs bogus` needs nothing installed.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const JOBS = ["source", "qualify", "deliverable", "uptime"];

// systemd's TimeoutStartSec is 25 min; this is the point after which a job
// stops taking on new work, leaving room for the last row and the db close.
export const PROCESS_BUDGET_MS = 22 * 60 * 1000;

// Unset or empty -> undefined (the job's own default). An explicit value, "0"
// included, wins; junk throws so the run fails loudly instead of defaulting
// (a mistyped BCNS_PLACES_MONTHLY_CAP must not silently become 950).
const num = (env, key) => {
  const v = env[key];
  if (v === undefined || String(v).trim() === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`${key} must be a non-negative number, got "${v}"`);
  return n;
};

// What each job is handed, built from env alone.
export async function jobDeps(name, { env, sql, db }) {
  if (name === "uptime") return {}; // fetch + the db are all it needs
  if (name === "source") {
    if (!env.GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set");
    const [{ createPlaces }, { createReadBudget }, { GRID }] = await Promise.all([
      import("./lib/places.mjs"),
      import("./lib/budget.mjs"),
      import("./lib/grid.mjs"),
    ]);
    return {
      places: createPlaces({ apiKey: env.GOOGLE_PLACES_API_KEY }),
      readBudget: createReadBudget({ sql, cap: num(env, "BCNS_PLACES_MONTHLY_CAP") }),
      // The grid lives in code; the table only tracks run state.
      loadCells: async () => {
        await db.upsertCells(sql, GRID);
        return db.allCells(sql);
      },
      saveCell: (cell) => db.saveCell(sql, cell),
      cellsPerRun: num(env, "SOURCE_CELLS_PER_RUN"),
    };
  }
  if (name === "deliverable") {
    const { deliverableDeps } = await import("./deliverable.mjs");
    return deliverableDeps(env);
  }
  const [{ createFetchPage }, { claudeClient }] = await Promise.all([
    import("./lib/fetch-page.mjs"),
    import("./lib/claude.mjs"),
  ]);
  return {
    fetchPage: createFetchPage(),
    // Absent CLI or token just means code-only scoring (qualify handles it).
    claude: claudeClient({ env }),
    callTasksPerDay: num(env, "CALL_TASKS_PER_DAY"),
    budgetMs: num(env, "QUALIFY_BUDGET_MS"),
  };
}

// deps (all optional, for tests): sql, db, job (merged over the built job deps),
// load(name) -> module with run().
export async function main({ argv = process.argv.slice(2), env = process.env, deps = {} } = {}) {
  const name = argv[0];
  if (argv.length !== 1 || !JOBS.includes(name)) {
    console.error(`usage: node jobs/run.mjs <${JOBS.join("|")}>`);
    return 2;
  }

  const startedAt = Date.now();
  let sql = deps.sql;
  let ownSql = false;
  let db;
  let ok = false;
  let error = null;
  let out;
  try {
    if (!sql) {
      if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
      const { default: postgres } = await import("postgres");
      sql = postgres(env.DATABASE_URL);
      ownSql = true;
    }
    db = deps.db ?? (await import("./lib/db.mjs"));
    const mod = await (deps.load ?? ((n) => import(`./${n}.mjs`)))(name);
    const jobDeps_ = { ...(await jobDeps(name, { env, sql, db })), ...deps.job };
    // Drop unset optionals so the job's own defaults apply.
    for (const k of Object.keys(jobDeps_)) if (jobDeps_[k] === undefined) delete jobDeps_[k];
    out = await mod.run({ sql, db, deadline: startedAt + PROCESS_BUDGET_MS, ...jobDeps_ });
    console.log(JSON.stringify(out));
    if (out?.tamper) throw new Error(out.error); // the job already failed its row; log the run ok:false
    ok = true;
  } catch (err) {
    error = String(err?.message ?? err);
    console.error(`job ${name} failed: ${error}`);
  }

  let code = ok ? 0 : 1;
  // An idle tick ({claimed:0}) logs nothing: the deliverable timer fires every
  // minute and ops reads only the newest 200 run events, so idle rows would push
  // real job failures out of that window within hours.
  const idle = ok && out?.claimed === 0 && !out.recovered?.length; // a recovered stale row is news
  try {
    if (!db || !sql) throw new Error("no database to record the run in");
    // uptime fires every 5 min (288/day) and every check is already a uptime_checks row; a success
    // event would push source/qualify runs out of hqRuns' newest-200 window. A failed run still logs.
    if (!idle && (name !== "uptime" || !ok))
      await db.logEvent(sql, name, "run", { ok, ms: Date.now() - startedAt, error });
  } catch (err) {
    console.error(`could not write the run event: ${String(err?.message ?? err)}`);
    code = 1;
  }
  if (ownSql) await sql.end({ timeout: 5 }).catch(() => {});
  return code;
}

// Real paths on both sides: /srv/hq/current is a symlink to a release dir, and
// comparing the unresolved argv path to the resolved module URL silently did nothing.
const isCli = (() => {
  try {
    return (
      !!process.argv[1] &&
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();
if (isCli) process.exitCode = await main();
