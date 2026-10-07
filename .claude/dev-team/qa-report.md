VERDICT: PASS
## VERDICT: PASS
**Branch:** feat/source-settings
**Task:** item 8 fix round 1, delta QA of 01bb408..6294fd6. **Gate mode:** tests. **Date:** 2026-10-06

## Counts (floors; all rose, none dropped)
- connect `pnpm test` 339 -> 341 pass / 0 fail (+2 = source-settings.test.mjs 13 -> 15; file is in the literal `tsx --test` list, ran alone: 15/15).
- platform (no DB, 38 DB files skipped) 16 files/165 -> 17 files/173 pass (engineer said 172: off by one low; floor holds). `empty-full-list.test.ts` (7) IS picked up: vitest `include: test/**/*.test.ts`, it does not import ./helpers so the DB-skip filter leaves it in; listed in the run. migration-text test 19 -> 20.
- connect typecheck, platform typecheck, connect build, root `pnpm lint --force` (10/10, 0 cached): all clean.

## Review findings, each confirmed fixed
- I1 guard: run.ts:291-299 throws SourceError before applyTombstones and before `status='ok'`; pure test asserts no `update data.jobs set deleted_at`, no `set status = 'ok'`, and the finishError params `[1,'error','found nothing to sync: the board is empty...']`. Applies to every fullList connector (drive, monday, meta); meet has none.
- I2 folderCheck: pending only while no finished run started after the change; finished runs without a backfill -> "none"; the marker error counts as "empty". Test pins it.
- M1: replayed the real `data.source_reset_refused` text on a throwaway PG17 (stub table, deleted after): null last_reset + no lease -> sync_running (no 22004); 5-min-old reset + p_hourly=true -> rate_limited with ISO detail; p_hourly=false (folder) -> sync_running; 2 h old -> sync_running; lease held -> sync_running; disabled/absent -> not_found.
- M2: justReset (>= 59 min ahead) makes resyncSource return ok=resync; boundaries 59:00 true, 58:59 false, garbage/null/sync_running/BCNS4 false.
- Low: no "bcns has been notified" anywhere in apps/connect, platform/docs, DESIGN, NOTES; default copy asserted exact, `/notified/` negated.

## Mutations (cp backup, restore, cmp byte-identical, `git status` clean after each; one mutation at a time)
- Owner check -> `if false` in api.reset_source_cursors: red "api.reset_source_cursors: owner only".
- 1-hour clause deleted: red "reset_source_cursors: once an hour, in the same update".
- target adds 'oauth_client_id': red "source_settings_v1: target is built from the allow-list only, never from config itself" (8 pairs vs 7).
- set_source_folder cursor reset dropped: red "set_source_folder: writes folder_id + notes_url and resets the cursors in the same statement".
- run.ts guard condition -> `if (false)`: red "runOne with a complete but empty listing > fails the run and tombstones nothing".
- run.ts guard moved after applyTombstones: same red assertion (no-tombstone expectation).
- emptyFullListTables loses `!seen.get(t)?.size`: 3 red: "passes a finished table with ids", "judges a two-entity table on the union of its ids", "still tombstones and succeeds when the listing has ids".
- folderCheck restored to the 01bb408 backfill-only body: red "folderCheck: pending, found, empty, failed - only full syncs after the change count" (expected 'none').
- justReset -> `return false`: red "resyncSource calls reset_source_cursors once..." and "justReset: only a rate_limited refusal...". friendlyError marker branch off: red "friendlyError: the worker's empty-listing failure reads as the empty-folder warning".

## Findings
- LOW (rule-literal, orchestrator call) platform/test/worker.test.ts stale_no_false_alarm: the assertion `expect(real).toMatchObject({status:'ok', rows_fetched:1, entity_rows:{board:1,item:0}})` was DELETED and the real empty-board run replaced by fabricated ok rows. It asserted the I1 bug itself (empty board ends ok), so it cannot survive the fix; the shape moved to empty_full_list_fails_not_tombstones (status error, same entity_rows). Remaining assertions (by.shopify, by.monday 'stale') unchanged. lease_lost_write_ignored and worker_isolation: fixtures only (stub returns 1 item / 1 campaign), no assertion touched.
- LOW run.ts "cursors untouched" is not literal: the final page's tx writes backfill_cursor before the guard throws. Safe for drive/monday (they ignore the resume cursor, a non-null cursor keeps backfill mode, next run re-walks). Meta backfill resumes at cursor.entity, so a first backfill on a zero-campaign account may fail once then complete ok without relisting; incremental then errors each run (the documented tradeoff).
- LOW guard also errors a legitimately empty Meta ad account or Monday board every run (engineer noted Meta; Monday follows from the same rule); matches the review's recommended fix, health shows error only.
- LOW not executed by me: DB-backed worker.test.ts (empty_full_list_fails_not_tombstones, stale_no_false_alarm, lease_lost, worker_isolation) and source-settings.test.ts need the local stack (barred); engineer reports them green on a local stack, CI is the first independent run.
- LOW PR now touches platform/worker/**, so merge triggers deploy-worker.yml too (engineer flagged; put in PR body).

## Guardrails
- `git diff eab3d5b..HEAD --stat -- platform/worker/src/connectors` empty; health.ts untouched; apps/connect/package.json diff is the test list only; no deps/lock change; fix round touched no file outside item scope.

## Not Verifiable
- none beyond the DB-backed tests above. No tests added by QA; nothing committed.
