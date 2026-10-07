REVIEW: 0C/1I/1M
# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 10 (delta 01bb408..6294fd6, excl. engineer-report.md)

## Findings

### Important
Important — platform/worker/src/run.ts:295 (emptyFullListTables :329, EMPTY_NOUN :326; DESIGN.md:783-784; NOTES.md:93) — The guard covers monday and meta (jobs/records), but on those sources an unshared board or account already throws before the guard: monday "board <id> not found", meta a Graph permission error. So the guard only ever fires on a board or account that really is empty. Their tombstones also heal themselves, because applyTombstones un-deletes ids that come back and only media gets purge_after. So on those sources the guard protects nothing and makes the state permanently wrong. Scenario: a Monday client archives every item on the board, or a Meta client archives all campaigns (the default edges leave out archived ones). Every hourly run then errors, and the archived jobs/records stay live in jobs_v1, SB and MCP forever. The hub shows the generic "We'll try again" copy, health goes stale after 3 intervals, and bcns gets a stale alert 6 h later for a client who did nothing wrong. The §4.1 rationale ("an empty or unshared ... Monday board is far likelier") is false for Monday. — Fix: run the guard only for the `media` table (drive), the only table where a wrongful tombstone is lossy (30-day purge cascades into media_set_items). Move the runOne cases in empty-full-list.test.ts and worker.test.ts empty_full_list_fails_not_tombstones to a Drive fixture, drop monday/meta from EMPTY_NOUN, and correct DESIGN §4.1 and NOTES #7.

### Minor
Minor — platform/worker/src/run.ts:295 + connectors/meta.ts backfill resume — A Meta backfill on an empty account throws on its last page after that page's transaction has already saved cursor `{entity:'adimage'}`. The retry resumes at adimage, so campaign and ad are not in `finished`. The guard and their tombstones are skipped, the run goes ok and sends backfill_done, and later incremental runs error again. Health flaps error → ok → error. No data loss. — Fix: goes away with the Important fix (guard on drive only).

## Earlier findings (01bb408 report): all fixed
- I1 folderCheck: source-settings.ts:221-233 returns "pending" only while no finished run has started since the change, and "none" when there are finished runs but no backfill. Pinned in source-settings.test.mjs; mutating the filter back turns it red.
- I2 empty/unshared Drive folder tombstones everything: fixed by the run.ts:295 guard, which throws before applyTombstones and before status ok, and leaves cursors as finishError does. Drive pull ignores the cursor, so a retry walks the whole folder. Pinned by the pure empty-full-list.test.ts (runs without DB, vitest include `test/**`) and the DB test worker.test.ts empty_full_list_fails_not_tombstones; removing the throw turns it red.
- M1 refusal helper: migration p_hourly makes rate_limited null-safe (a null last_reset_at falls through to sync_running, so 22004 is gone). reset passes true, folder passes false, and the revoke signature `(uuid, data.source, boolean)` matches. New DB test checks the ISO detail is more than 59 min ahead.
- M2 double-click: justReset (:354) is used by resyncSource (:372) with an injected `now`. 59:00 / 58:59 / garbage / sync_running / BCNS4 / null are pinned; bypassing it turns the test red.

## Verified clean (no finding)
- run.ts NUL byte: one pre-existing NUL at :22 (the `seen` key separator); the count is 1 before and after, and no new control bytes.
- worker.test.ts edits are fixture-only (stale_no_false_alarm fabricates its ok run; lease_lost and worker_isolation stubs return one entity); no assertion weakened.
- Half-committed pages on a guard throw match normal error semantics; Monday/Drive retries walk everything.
- A new empty Monday board that never succeeded shows 'error' with no email. Acceptable on its own and subsumed by the Important fix.
- DB tests (source-settings.test.ts, worker.test.ts) run for the first time in CI. Their fixtures use the existing mkClient/schedule helpers and the engineer ran them green on a local stack. Not re-run here per instructions.
- Counts: platform non-DB 17 files / 173 pass (floor 172 holds); connect source-settings 15/15 and wired in package.json. The full connect run in an extract fails only 2 files that import packages/ (missing from the extract), so those failures come from the environment.
- DESIGN §4.6, §5.3, §5.5 and NOTES #8 match the code apart from the Important above. Merge triggers deploy-worker.yml (platform/worker/** touched), and the engineer flagged it. Not a finding.

## STANDARDS.md Updates
none (findings-only run, no repo edits per instructions)
