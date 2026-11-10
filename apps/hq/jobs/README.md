# HQ jobs

Scheduled jobs feed and report on the call queue. Plain Node 22 ESM, run by systemd on the droplet
(`infra/hq-job@.service`, one `hq-*.timer` each). Only dependency: `postgres`.

- `source` (Mon-Fri 11:00 UTC, `hq-source.timer`): walks the trade x town grid, searches Places, inserts new `sourced` businesses. Writes one `places_call` event per search, before the request.
- `qualify` (hourly 08-20 UTC at :15, `hq-qualify.timer`): fetches each sourced site, scores fit (code signals gate it, the `claude` CLI scores it, code alone if the CLI is absent), then promotes qualified rows to `call_due` until 50 have been promoted today.
  - **Backfill** (after the sourced loop, before promotion, same time budget, at most `BACKFILL_LIMIT` = 100 rows a run): scores `call_due` rows that have no `fit_score`, oldest `updated_at` first. It writes `research` only; it never changes `stage`, never sets `lost`. A row that cannot be scored (no phone, no domain, under 2 signals, or 3 failed fetches) gets `research.backfill_skip = '<reason>'` and is not picked again; its `fit_score` stays null. Events: `backfilled`, `backfill_skipped`. Same `claude -p` calls on the subscription ($0 API); a normal sourced backlog is processed first.
  - Confirm it finished (one aggregate; 0 means done): `select count(*) from businesses where stage = 'call_due' and suppressed_at is null and fit_score is null and not (jsonb_typeof(research) = 'object' and research ? 'backfill_skip');` Rows left unscored and why: same filter with `research ? 'backfill_skip'`, `group by research->>'backfill_skip'`.
- `nudge` (Mon-Fri 12:30 UTC, `hq-nudge.timer`, no `Persistent`): one Resend email, "N calls waiting, M new today" plus the Today link. Counts only, no lead data. Skips when nothing waits or one already went today (`events` job `nudge`, kind `sent`). Env: `RESEND_API_KEY`, `NUDGE_TO`, optional `NUDGE_DRY_RUN=1` (logs the text, sends nothing).
- Every run, pass or fail, writes `events(job, kind='run', via='job', detail{ok, ms, error})`. Exit codes: 0 ok, 1 job failed, 2 bad usage.
- The Places budget is counted from `places_call` events in the current UTC month (all jobs), against the cap. An unreadable count stops the run.

Env (in `/srv/hq/jobs.env` on the droplet): `DATABASE_URL` (HQ pooler), `GOOGLE_PLACES_API_KEY`, `BCNS_PLACES_MONTHLY_CAP` (default 950), `SOURCE_CELLS_PER_RUN`, `QUALIFY_BUDGET_MS`, `CALL_TASKS_PER_DAY` (default 50), `CLAUDE_CODE_OAUTH_TOKEN` (optional).

Deploy: `jobs/` is not a pnpm workspace member and a Next standalone root does not expose `postgres`, so the release needs `cd /srv/hq/current/jobs && npm install --omit=dev --no-package-lock` (item 8 wires this into deploy next to its `cp -r` line).

Paid fee: the budget counts only HQ's own `places_call` events. In the cutover month set `BCNS_PLACES_MONTHLY_CAP` to 950 minus the Places calls bcns-internal already made that month (or start HQ source on the 1st). Google bills any overage past the free tier.

Run one locally against the local HQ stack:

    cd apps/hq/jobs && npm install --no-save --no-package-lock
    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node run.mjs qualify

Tests (no database needed): `node --test apps/hq/jobs/test/*.test.mjs`.
