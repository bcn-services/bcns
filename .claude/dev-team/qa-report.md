VERDICT: PASS
## VERDICT: PASS
**Branch:** feat/source-settings
**Task:** item 8 source settings. **Gate mode:** tests (+ limited live smoke). **Date:** 2026-10-06

## Counts (floors from item 3)
- connect 326 -> 339 pass / 0 fail (floor held, rose by 13). platform 15 files/146 -> 16 files/165 pass (+19 = source-settings-migration.test.ts; DB file source-settings.test.ts is CI-only).
- Wiring: tests/source-settings.test.mjs is in the literal `tsx --test` list (apps/connect/package.json). Probe: appended a throwing test -> `# tests 340 / pass 339 / fail 1`; restored from cp, shasum identical.
- connect typecheck, platform typecheck, connect build, root `pnpm lint` (10/10): all clean.

## Mutations (cp backup, restore, shasum identical, git status clean after each)
- M1 owner check removed from api.reset_source_cursors -> red: "api.reset_source_cursors: owner only" (expected ... to contain 'if data.active_client_role() is distinct from owner...').
- M2 1-hour clause removed -> red: "reset_source_cursors: once an hour, in the same update".
- M3a source_settings_v1 target adds 'oauth_client_id' key -> red: "source_settings_v1: target is built from the allow-list only, never from config itself" (pairs list 8 vs 7).
- M3b source_settings_v1 returns `s.config || ...` -> same test red ("not to contain 'config'").
- M4 cursor reset dropped from set_source_folder -> red: "set_source_folder: writes folder_id + notes_url and resets the cursors in the same statement".
- M5 parseDriveFolder host check removed -> red: "parseDriveFolder refuses other hosts, schemes and malformed ids" (AssertionError).
- M6 (extra) sourcePage isOwner forced true -> red: "sourcePage: owners get the controls, members and Shopify do not".

## Done-when mapping
- Owner opens each source, sees status/target/runs: page.tsx + sourcePage model (status card, target via allow-list, last 20 runs); connected cards link to /sources/<source> -- PASS (model tests + live: /sources/meet,/drive 307 -> /login?error=unconfigured; /sources/upload, /sources/nope 404; server killed by PID, port free).
- One click = add-source --reset-cursors: api.reset_source_cursors sets backfill_cursor='{}', incremental_cursor='{}', next_run_at=now() (identical to add-source.ts:46-47) plus last_reset_at stamp -- PASS. Pure-text test asserts the exact SET list.
- Drive row repointable from hub: api.set_source_folder (meet/drive only, id regex, drive.google.com URL, cursors reset in same UPDATE) + Change folder form -- PASS.
- Tests wired into the executing runner with counts above item 3 -- PASS (see counts).

## Independent PG replay (throwaway initdb, port 54998, stub schema, deleted afterwards)
- Member read: target allow-listed only (oauth_client_id/secret/surprise absent). Member reset -> forbidden_role. Owner reset ok -> cursors {} {}, due, last_reset_at set; 2nd reset -> rate_limited with ISO detail. Shopify reset -> validation/source. set_source_folder inside the hour ok, config merged (oauth keys kept), cursors {}; bad id -> folder_id, evil URL -> folder_url, monday -> source. Lease held: reset and folder both -> sync_running. Other tenant -> not_found/source. authenticated has no EXECUTE on data.source_reset_refused; anon none on api fns.

## CI read of platform/test/source-settings.test.ts (no PostgREST locally, so not executed)
- Helper names/signatures (clientWithToken, mintJwt(sub,{client_id}), serviceClient().auth.admin.createUser, sql, pool) and fixture inserts match quickbooks-disconnect.test.ts; typecheck clean; enum values (run_status 'ok', run_mode 'backfill'/'incremental') valid; error codes/details (BCNS2/3/4/9, `details`) match the migration.
- Catalog: RPC_ARGS has all 4 entries (reads 'none'; writes pass shopify -> BCNS3 before any write, acmeOwner); function_privileges, search_path_pinned (all 5 fns pinned), tokens_unreachable (no 'source_tokens' in any function body, only in a header comment) all hold by reading. No catalog entry missing.

## Guardrail sweep
- No package.json/lock change except the test list; platform/worker + platform/scripts untouched; nothing reads data.source_tokens (only negative assertions); fixtures synthetic ("client-123", example.test); copy has no cursor/OAuth/MCP; "checked on the next sync, within the hour" present; Shopify gets no re-sync/change-folder (email-us line); change-folder only meet/drive; unknown source 404 before auth; members read, owner controls gated by role in model + requireOwner + DB.

## Findings
- LOW — apps/connect/lib/source-settings.ts friendlyError default "bcns has been notified" — claim not verified against a real alert path for failed runs — reword to "email us if it keeps happening" or confirm.
- LOW — platform migration guard tests are SQL-text assertions; behaviour (roles, hour, lease) first runs for real in CI via source-settings.test.ts (my replay shows the SQL behaves) — watch the first CI run.
- LOW — `git diff eab3d5b..HEAD` deletes item 3's .claude/dev-team/qa-report.md and review-report.md (engineer notes it) — keep out of the PR if it shows as noise.
- LOW — page shows raw worker error text in a Details toggle to members too; relies on worker redaction — acceptable, note only.

No tests added; nothing committed by QA.
