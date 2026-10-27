# HQ jobs

Two scheduled jobs feed the call queue. Plain Node 22 ESM, run by systemd on the droplet
(`infra/hq-job@.service`, one `hq-*.timer` each). Only dependency: `postgres`.

- `source` (Mon-Fri 11:00 UTC, `hq-source.timer`): walks the trade x town grid, searches Places, inserts new `sourced` businesses. Writes one `places_call` event per search, before the request.
- `qualify` (hourly 08-20 UTC at :15, `hq-qualify.timer`): fetches each sourced site, scores fit (code signals gate it, the `claude` CLI scores it, code alone if the CLI is absent), then promotes qualified rows to `call_due` until 50 have been promoted today.
- Every run, pass or fail, writes `events(job, kind='run', via='job', detail{ok, ms, error})`. Exit codes: 0 ok, 1 job failed, 2 bad usage.
- The Places budget is counted from `places_call` events in the current UTC month (all jobs), against the cap. An unreadable count stops the run.

Env (in `/srv/hq/jobs.env` on the droplet): `DATABASE_URL` (HQ pooler), `GOOGLE_PLACES_API_KEY`, `BCNS_PLACES_MONTHLY_CAP` (default 950), `SOURCE_CELLS_PER_RUN`, `QUALIFY_BUDGET_MS`, `CALL_TASKS_PER_DAY` (default 50), `CLAUDE_CODE_OAUTH_TOKEN` (optional).

Run one locally against the local HQ stack:

    cd apps/hq/jobs && npm install --no-save --no-package-lock
    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node run.mjs qualify

Tests (no database needed): `node --test apps/hq/jobs/test/*.test.mjs`.
