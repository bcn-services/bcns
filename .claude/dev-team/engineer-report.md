# Engineer Report
**Task:** item 8 — Source settings (hub per-source page: status/target/runs, one-click re-sync, meet/drive change-folder)
**Branch:** feat/source-settings (base eab3d5b)
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

## Machine-readable findings
- PREMISE ok: no hub path to reset cursors or change folder existed; add-source --reset-cursors was SQL-only operator path.
- PREMISE risk (code reading, not live): empty/unreadable Drive folder -> files.list 200 with 0 files -> ok run, 0 rows, health ok; drive is fullList so a completed empty walk tombstones all drive media (30-day purge). 403/404 classify as error.
- COUNTS connect 326 -> 339 tests (339 pass); platform 146 -> 165 tests, 15 -> 16 files passed (DB file skipped locally, no supabase start).
- CHECKS pass: connect typecheck, connect build (/sources/[source] built), platform typecheck, data-client build, root pnpm lint 10/10, root test:docs.
- SMOKE throwaway PG17 (stub schema, port 54999, stopped): allow-listed target, 20-run cap, reset ok then rate_limited, shopify BCNS3, missing source BCNS4, folder set + config merged + cursors reset, leased sync_running, member forbidden_role, nobody no_tenant, tenant isolation, direct table/helper access denied.
- SMOKE next start :3128: /sources/meet 307 -> /login?error=unconfigured; /sources/upload 404; killed by PID.
- MUTATION M1 owner check removed from reset -> red "api.reset_source_cursors: owner only".
- MUTATION M2 1-hour clause removed -> red "reset_source_cursors: once an hour, in the same update".
- MUTATION M3 view adds oauth_client_id -> red "source_settings_v1: target is built from the allow-list only, never from config itself".
- MUTATION M4 cursor reset dropped from set_source_folder -> red "set_source_folder: writes folder_id + notes_url and resets the cursors in the same statement".
- MUTATION M5 parseDriveFolder host check removed -> red "not ok 316 - parseDriveFolder refuses other hosts, schemes and malformed ids".
- MUTATION restore: cp backups, shasum match, clean git status after each.
- NOTE §5.9a (shop/redact) unchanged and still true; Shopify is not offered re-sync in the hub.
- NOTE item 3's staged report deletions landed in docs commit 1fb097a (not rewritten).
- FOLLOWUP worker should turn an empty folder into a connector_health error and skip tombstoning on an empty first backfill.
- FOLLOWUP zombie lease: reset/folder change refused (sync_running) until lease_until passes (≤ 8 min).

## Deferred / Out of Scope
- Worker-side empty-folder detection (worker connectors read-only for this item).
- Shopify re-sync from the hub.

## Flags for Reviewer
- Migration must be applied to hosted by Nate before the page works; until then the RPC calls 404 and the page shows the failure copy.
- connector_runs_v1 limit 20 is covered by the existing index connector_runs (client_id, source, started_at desc).
- set_source_folder is deliberately not hour-limited; abuse ceiling is one backfill per click by an owner, lease-guarded.
