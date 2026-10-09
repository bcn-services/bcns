BUILT — feat/weekly-digest — 71a0c2a — self-check: pnpm --filter @bcn-services/platform test pass
# Engineer Report (item 5, weekly digest)
**Branch:** feat/weekly-digest (stacked on item 4). **Date:** 2026-10-06. Feature commit 71a0c2a; a report-only commit sits on top.
TEST_COUNT: platform vitest local before 160 pass -> after 177 pass (+17, all in new test/weekly-digest.test.ts, 17 files); typecheck clean. DB-backed `weekly_digest_emails` in worker.test.ts is typechecked but NOT RUN (no docker/supabase locally); CI is its first execution.
MUTATION_1: no-data branch replaced with `if (false) return null` -> RED: weekly-digest.test.ts > weeklyDigest > "no data -> null: zero rows, and rows carrying only inventory / conversion" (only that test). Restored from cp backup, shasum identical.
MUTATION_2: dedupe_key given `:${Math.random()}` (not week-stable) -> RED: "key is literal, identical for two nows in one week, different the next week" (only that test). Restored, shasum identical, git status clean apart from intended files.
DECISION: all code in health.ts (not a new digest.ts) — sendPending needs digestEmail and digest.ts importing health.ts would be a circular import. HUB_URL now exported.
DECISION: lastWeek = local time minus 9h, take that Mon-Sun week, step back one week. Verified literals: Mon 08:59 NY -> 2026-W39, 09:01 -> 2026-W40, LA vs NY same instant differ, 2027-01-04 -> 2026-W53.
DECISION: no-data rule applied to the BUILT payload (no money group, sessions null, no ad group -> null), so a row with ad spend but no currency anywhere also yields null rather than an empty email. Same as orchestrator rule otherwise (currency non-null | sessions non-null | ad_spend non-null; inventory/conversion alone never).
DEVIATION: refunds and payouts lines shown only when nonzero (Orders/Sales always shown when currency present). Reason: a 0 payout line is noise for non-Payments shops; "source reported" cannot be told from the view's coalesced 0s.
DEVIATION: ROAS copy reads "Ad sales for every 1 USD spent: 3.20" (no "ROAS" jargon, currency-safe). AOV shown as "Average order".
LIMIT: api.daily_summary_v1 collapses currency per day with max(currency), so two currencies in ONE day are not separable; multi-currency works across days only. Pre-existing view behaviour, not changed (no migration).
LIMIT: view has no per-source breakdown for sessions; summed across sources.
FLAG: a client with no data this week is re-queried every tick until Monday 09:00 (one range query each, ponytail-marked in code). First deploy mid-week emails each client with data immediately for the last full week.
FLAG: raiseWeeklyDigests catches a bad timezone per client (logs digest_bad_timezone) so one bad row cannot block others.
FLAG for reviewer: DB test assumes seed.sql data (acme/beta 50 days ending today, gamma paused, beta has no owner) and drives full tick() with a fetch that delegates non-Resend URLs to idleFetch; sendPending flushes any unsent rows so digest batches are filtered by the weekly_digest: Idempotency-Key.
DOCS: platform/DESIGN.md updated (notification kind enum, D23 step list, step table row 5a, weekly digest paragraph, kinds table row). No README lists kinds.
NOT_DONE: no migration, no push, no deps added. Staged deletions of old .claude/dev-team/*report.md files pre-existed in the index; committed with explicit pathspec so they are untouched.
FILES: platform/worker/src/health.ts, platform/worker/src/tick.ts, platform/test/weekly-digest.test.ts, platform/test/worker.test.ts, platform/DESIGN.md
