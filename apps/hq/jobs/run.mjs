// node jobs/run.mjs <source|qualify>
//
// One entry point for the systemd units (infra/hq-job@.service). Writes one
// events row per run, {job, kind:'run', via:'job', detail:{ok, ms, error}},
// whether the job passed or threw; exits 0 / 1 (job failed) / 2 (usage).
//
// DATABASE_URL is the HQ project's pooler URL, set only in /srv/hq/jobs.env.
// `postgres` is imported only once the job name is valid and no db is injected,
// so `run.mjs bogus` needs nothing installed.

import { pathToFileURL } from "node:url";

export const JOBS = ["source", "qualify"];

// systemd's TimeoutStartSec is 25 min; this is the point after which a job
// stops taking on new work, leaving room for the last row and the db close.
export const PROCESS_BUDGET_MS = 22 * 60 * 1000;

const num = (v) => (v ? Number(v) || undefined : undefined);

// What each job is handed, built from env alone.
export async function jobDeps(name, { env, sql, db }) {
  if (name === "source") {
    if (!env.GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set");
    const [{ createPlaces }, { createReadBudget }, { GRID }] = await Promise.all([
      import("./lib/places.mjs"),
      import("./lib/budget.mjs"),
      import("./lib/grid.mjs"),
    ]);
    return {
      places: createPlaces({ apiKey: env.GOOGLE_PLACES_API_KEY }),
      readBudget: createReadBudget({ sql, cap: num(env.BCNS_PLACES_MONTHLY_CAP) }),
      // The grid lives in code; the table only tracks run state.
      loadCells: async () => {
        await db.upsertCells(sql, GRID);
        return db.allCells(sql);
      },
      saveCell: (cell) => db.saveCell(sql, cell),
      cellsPerRun: num(env.SOURCE_CELLS_PER_RUN),
    };
  }
  const [{ createFetchPage }, { claudeClient }] = await Promise.all([
    import("./lib/fetch-page.mjs"),
    import("./lib/claude.mjs"),
  ]);
  return {
    fetchPage: createFetchPage(),
    // Absent CLI or token just means code-only scoring (qualify handles it).
    claude: claudeClient(),
    callTasksPerDay: num(env.CALL_TASKS_PER_DAY),
    budgetMs: num(env.QUALIFY_BUDGET_MS),
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
    const out = await mod.run({ sql, db, deadline: startedAt + PROCESS_BUDGET_MS, ...jobDeps_ });
    console.log(JSON.stringify(out));
    ok = true;
  } catch (err) {
    error = String(err?.message ?? err);
    console.error(`job ${name} failed: ${error}`);
  }

  let code = ok ? 0 : 1;
  try {
    if (!db || !sql) throw new Error("no database to record the run in");
    await db.logEvent(sql, name, "run", { ok, ms: Date.now() - startedAt, error });
  } catch (err) {
    console.error(`could not write the run event: ${String(err?.message ?? err)}`);
    code = 1;
  }
  if (ownSql) await sql.end({ timeout: 5 }).catch(() => {});
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
