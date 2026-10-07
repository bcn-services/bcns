# Engineer Report
**Task:** item 8 — Source settings (hub per-source page: status/target/runs, one-click re-sync, meet/drive change-folder) — attempt #2, fix round 1
**Branch:** feat/source-settings (base eab3d5b; attempt #2 on 01bb408, fix commit 9df52e1)
**Date:** 2026-10-06

## Design Decisions
- DEVIATION reads are security-definer `api.source_settings_v1()` / `api.connector_runs_v1(p_source)` functions, not views: api views must be security_invoker and connector_schedule/runs are internal (catalog internal_tables_unreachable); same shape as item 3 api.ai_last_used_at.
- `target` = jsonb_build_object over TARGET_KEYS (folder_id, notes_url, board_url, board_id, admin_url, shop, realm_id), never config; hub TARGET_KEYS asserted equal to the SQL list. Meta act_id not in the allow-list, so Meta shows no target.
- DEVIATION p_source typed `data.source` (enum rejects unknown values before the body runs).
- DEVIATION new errcode BCNS9: `rate_limited` (detail = next allowed time ISO UTC) / `sync_running` (lease held); refusal reason computed by revoked helper data.source_reset_refused after the guarded UPDATE matches 0 rows.
- reset_source_cursors = one guarded UPDATE: owner check, enabled, last_reset_at older than 1 h, no live lease; sets backfill_cursor/incremental_cursor '{}', next_run_at now(), last_reset_at now() — exactly add-source --reset-cursors plus the stamp.
- DEVIATION Shopify reset refused (BCNS3 source): Shopify re-syncs through its own install flow, which is out of scope to touch.
- set_source_folder: meet/drive only, id ^[A-Za-z0-9_-]{10,128}$, url https://drive.google.com/ ≤500, config||{folder_id,notes_url} + cursor reset in the same UPDATE, lease-guarded, NOT hour-limited.
- DEVIATION added folder_changed_at column (drives the page's "new folder came back empty" warning) and set_source_folder also stamps last_reset_at (re-sync unavailable for 1 h after a folder change).
- DEVIATION hub sends a canonical folder URL built from the parsed id; pasted extras are dropped.
- Hub: pure lib apps/connect/lib/source-settings.ts (parse, model, errorFlag, resyncSource/changeFolder with injected requireOwner+revalidate) + thin server actions/page.
- ATTEMPT #2 empty-listing guard lives in the worker (run.ts), not the hub: a complete fullList walk with zero ids throws SourceError("found nothing to sync: the <folder|board|ad account> is empty or not shared ...") before applyTombstones and before the run is marked ok; finishError records status error, consecutive_failures+1, backoff, cursors untouched, so the next run retries normally.
- ATTEMPT #2 the guard decision is the pure exported emptyFullListTables(fullList, seen, finished): a table fires only when every entity feeding it finished and the union of their ids is empty (Meta campaign+ad judged together; budget-stopped walks never fire).
- ATTEMPT #2 TRADEOFF (also in the run.ts comment): a client who really empties a whole folder/board never gets those rows tombstoned; health shows error (hub only, no email), then stale (alert after 6 h) only if the source succeeded before.
- ATTEMPT #2 DEPLOY: this PR now touches platform/worker/**, so its merge triggers deploy-worker.yml (worker image + Cloud Run Job bcns-data-worker), in addition to deploy-app.yml.
- ATTEMPT #2 folderCheck: "pending" only while no finished run started after folder_changed_at; finished runs but no backfill among them -> "none"; ok backfill with rows -> found; ok backfill with 0 rows or a backfill failing with the empty-listing marker -> empty; else failed.
- ATTEMPT #2 data.source_reset_refused(p_client_id, p_source, p_hourly): rate_limited only when p_hourly (reset path) and last_reset_at is under an hour old; every other refusal is sync_running. set_source_folder passes false.
- ATTEMPT #2 double-click: pure justReset(error, now) — BCNS9 rate_limited whose detail is >= 59 min ahead means the click before just reset; resyncSource treats it as ok=resync. now injected via MutationDeps.now.
- ATTEMPT #2 friendlyError default: "The last sync hit a problem. We'll try again on the next sync. Email us if it keeps happening." (no "bcns has been notified" — error-only states send no email).

## Files Changed
- platform/supabase/migrations/20261007000400_source_settings.sql — columns, 2 read fns, 2 write RPCs, refusal helper, grants (authenticated only).
- platform/test/helpers.ts — RPC_ARGS for the 4 RPCs.
- platform/test/source-settings-migration.test.ts — pure SQL-text assertions (19 tests).
- platform/test/source-settings.test.ts — DB-backed behaviour (skips locally, runs in CI).
- packages/data-client/src/index.ts — RPC_NAMES += 4.
- packages/data-client/src/database.types.ts — Functions entries for the 4 RPCs.
- apps/connect/lib/source-settings.ts — page model, parseDriveFolder, targetFor, errors, actions core.
- apps/connect/lib/sources.ts — export TITLES.
- apps/connect/app/sources/[source]/page.tsx — status card, re-sync panel, change-folder form, recent syncs.
- apps/connect/app/sources/[source]/actions.ts — resyncAction / changeFolderAction.
- apps/connect/app/page.tsx — connected source title links to /sources/<source>.
- apps/connect/app/globals.css — .ss-* / .crumb rules on the .sc card style.
- apps/connect/tests/source-settings.test.mjs + apps/connect/package.json — 13 tests, wired into the test list.
- platform/DESIGN.md — errcode table BCNS6–9, 4 RPC rows, §5.10 add-source row, §9 G2 note.
- platform/NOTES.md — Needs-Nate #8 (hub re-sync/change-folder, empty-folder + tombstone risk).
- platform/docs/connection-day.md — §7 hub path; meet/drive folder prompts point at Change folder.
- ATTEMPT #2 platform/worker/src/run.ts:291-299,326-337 — SourceError import, empty-listing guard before applyTombstones, EMPTY_NOUN, exported emptyFullListTables (file holds a pre-existing NUL byte; edited byte-safe).
- ATTEMPT #2 platform/test/empty-full-list.test.ts — new pure vitest (7): emptyFullListTables cases + runOne wiring with db.js mocked (empty board errors and issues no tombstone; one-item board tombstones and goes ok).
- ATTEMPT #2 platform/test/worker.test.ts:178 — new DB test empty_full_list_fails_not_tombstones (2 items -> empty -> 1 item); stale_no_false_alarm fabricates its ok run; lease_lost_write_ignored and worker_isolation stubs return one entity so they still succeed.
- ATTEMPT #2 apps/connect/lib/source-settings.ts:178,195,221,354,372 — friendlyError marker branch + new default copy, folderCheck rewrite, justReset, resyncSource uses it, MutationDeps.now.
- ATTEMPT #2 apps/connect/tests/source-settings.test.mjs:123,127,142,252,284 — default copy exact + no "notified", marker mapping, folderCheck "none"/marker cases, double-click, justReset boundaries (59:00 / 58:59 / garbage / sync_running / BCNS4 / null).
- ATTEMPT #2 platform/supabase/migrations/20261007000400_source_settings.sql:95-116,139,179 — source_reset_refused gains p_hourly; reset passes true, folder passes false; revoke signature updated (edited in place, still unapplied).
- ATTEMPT #2 platform/test/source-settings-migration.test.ts:132 — p_hourly guard text, single rate_limited, sync_running fallback, call sites; revoke signature.
- ATTEMPT #2 platform/test/source-settings.test.ts:176 — DB test: hourly inside hour -> rate_limited (ISO detail > 59 min ahead); false -> sync_running; reset 2 h old + true -> sync_running.
- ATTEMPT #2 platform/DESIGN.md — §4.1 guard paragraph + tradeoff, §4.6 drive note, §5.3 step 3, §5.5 stale row, test-table rows.
- ATTEMPT #2 platform/NOTES.md — #7 resolved with tradeoff; #8 reworded (empty Drive folder no longer tombstones; meet still unguarded).

## Machine-readable findings
- FIX-1 (Important) run.ts:291-299 guard + emptyFullListTables run.ts:329; pinned by empty-full-list.test.ts and worker.test.ts:178; friendlyError maps marker -> EMPTY_FOLDER_WARNING (source-settings.ts:178).
- FIX-2 (Important) folderCheck source-settings.ts:221-233; test :142 fixed, "none" after incremental-only and marker cases added.
- FIX-3 (Minor) migration :97-113 p_hourly; reset :139 true, folder :179 false.
- FIX-4 (Minor) justReset source-settings.ts:354, used :372; tests :252, :284.
- FIX-5 (Low) friendlyError default source-settings.ts:195; test :123-124.
- COUNTS connect test 339 -> 341 (all pass); platform no-DB 16 files/165 -> 17/172; platform with local stack 38 files/397 tests, all pass (incl. every DB test touched).
- CHECKS pass: connect typecheck, connect build, platform typecheck, root pnpm lint 10/10.
- MUTATION M1 owner check removed from reset -> red "api.reset_source_cursors: owner only".
- MUTATION M2 1-hour clause removed -> red "reset_source_cursors: once an hour, in the same update".
- MUTATION M3 target adds oauth_client_id -> red "source_settings_v1: target is built from the allow-list only, never from config itself".
- MUTATION M4 cursor reset dropped from set_source_folder -> red "set_source_folder: writes folder_id + notes_url and resets the cursors in the same statement".
- MUTATION M5 parseDriveFolder host check removed -> red "not ok 316 - parseDriveFolder refuses other hosts, schemes and malformed ids".
- MUTATION M6 `&& !seen.get(t)?.size` removed -> red "emptyFullListTables > passes a finished table with ids", "> judges a two-entity table on the union of its ids", "runOne ... > still tombstones and succeeds when the listing has ids".
- MUTATION M6b guard throw -> void -> red "runOne with a complete but empty listing > fails the run and tombstones nothing"; same against DB -> red "worker > empty_full_list_fails_not_tombstones".
- MUTATION M7 folderCheck backfill-only filter restored -> red "not ok 322 - folderCheck: pending, found, empty, failed — only full syncs after the change count".
- MUTATION M8 justReset bypassed -> red "not ok 326 - resyncSource calls reset_source_cursors once and redirects with the outcome".
- MUTATION M9 p_hourly guard -> `if true` -> red "rate_limited only for the hourly reset with a reset under an hour old; sync_running otherwise".
- MUTATION M10 friendlyError marker branch disabled -> red "not ok 321 - friendlyError: the worker's empty-listing failure reads as the empty-folder warning".
- MUTATION restore: cp backups, shasum match, clean git status after each.
- NOTE guard also covers Meta: an ad account with zero campaigns and zero ads now errors instead of tombstoning.
- NOTE local stack (colima + supabase start --workdir platform) was started for the DB run and stopped afterwards; colima had not been running before.

## Deferred / Out of Scope
- Meet has no fullList and no empty-listing guard (NOTES #8 still open for it).
- Shopify re-sync from the hub.
- Zombie lease: reset/folder change refused (sync_running) until lease_until passes (<= 8 min).

## Flags for Reviewer
- Merge triggers deploy-worker.yml (platform/worker/** touched) as well as deploy-app.yml.
- Migration edited in place and still unapplied; Nate applies it before the page works (until then the RPCs 404 and the page shows failure copy).
- Empty-listing guard: a genuinely emptied folder/board stays in error and keeps its rows; health 'error' sends no email.
- connector_runs_v1 limit 20 is covered by index connector_runs (client_id, source, started_at desc).
- set_source_folder is deliberately not hour-limited; abuse ceiling is one backfill per click by an owner, lease-guarded.
