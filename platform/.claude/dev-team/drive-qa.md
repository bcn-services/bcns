# Drive Connector QA Report

**Scope:** 5th connector `drive` (Google Drive content library indexed into `data.media`, bytes stay in Drive), commits `bde7ae0..HEAD`.
**Gate mode:** tests (no frontend/behavioral pass).

## VERDICT: PASS

## Criteria

1. **Migration applies cleanly, exact content.**
   `supabase db reset` → `Applying migration 20260912000600_drive_source.sql...` succeeded; `od -c` confirms file content is exactly `alter type data.source add value 'drive';\n`; `psql` `select enum_range(NULL::data.source)` returns `{shopify,meta,monday,meet,upload,dashboard,platform,drive}`.
   **PASS**

2. **Typecheck clean, `pnpm test` green twice (55 passed, 1 todo, 7 files).**
   `pnpm typecheck` → no output, exit clean. `pnpm test` run 1: `Test Files 7 passed (7)` / `Tests 55 passed | 1 todo (56)`. `pnpm test` run 2: identical (`7 passed`, `55 passed | 1 todo`). The `test/scripts.test.ts` cleanup-flake fix held on both runs (no failed `afterAll`, only the expected benign `cleanup … Error: no client with slug …` stderr line from a client the test itself already hard-deleted).
   **PASS**

3. **`pnpm db:types` no-op; committed diff vs `bde7ae0` is enum-only.**
   `git status --short packages/data-client/src/database.types.ts` empty before regen; ran `pnpm db:types`; `git diff --stat` on that file after regen: empty (no changes). `git diff bde7ae0..HEAD -- packages/data-client/src/database.types.ts | grep '^[+-]' | grep -v '^[+-][+-]' | grep -v '"drive"'` → no output.
   **PASS**

4. **`worker/src/connectors/drive.ts` matches DESIGN.md §4.6 contract.**
   Read DESIGN.md §4.6 and `worker/src/connectors/drive.ts` line by line: `backfill(ctx)`/`incremental(ctx)` both delegate to the same `pull(ctx)` generator; `defaults.backfillDepth === '0'`; `defaults.fullList === [{ entity: 'file', table: 'media' }]`; cursor is `{ pulled_at }` when `done`, else `{ pageToken }`; `q` includes `trashed=false` and `mimeType != 'application/vnd.google-apps.folder'` (Google-native docs/sheets/slides are not excluded, only real folders); thumbnail fetch/copy to `` `${ctx.clientId}/thumb/${f.id}.jpg` `` only runs for ids not in `ctx.knownMedia(ids)`; thumbnail failure is caught, logged as `drive_thumb_skip`, and the row still lands with `thumb_path: null`; `normalize` never sets a `storage_path` key (upsert defaults it to `null`), sets `attributes.web_view_link`, and `bytes` is `null` for Google-native files (no `size` field) — confirmed via fixture file `deck1` (`application/vnd.google-apps.presentation`, no `size`). Cross-checked against the passing `drive_thumb_once` and `normalize_idempotent` tests in `test/connectors.test.ts`.
   **PASS**

5. **Mutation checks (Drive-specific branches).** See table below — every mutation produced the required `drive_thumb_once` failure, and every revert left `git status --short worker/` empty.
   **PASS**

6. **Tombstone behaviour end-to-end against the local DB.**
   Wrote `test/drive-tombstone.test.ts` (new). `pnpm exec vitest run test/drive-tombstone.test.ts` → 1 passed. Run 1 (3 files) → 3 `data.media` rows, `deleted_at null`, `storage_path null`. Run 2 (2 files, `f3` missing) → `f3.deleted_at` not null, `f3.purge_after` still null; `f1`/`f2` untouched (`deleted_at` still null **and** `updated_at` unchanged byte-for-byte from run 1 — the canonical upsert's `is distinct from` guard skips the no-op write, so the `touch_updated_at` trigger never fires). Run 3 (all 3 back) → `f3.deleted_at` cleared (un-deleted). `worker/src/run.ts`'s exported `runOne` was the entry point used (matches the pattern in `test/worker.test.ts` and `test/connectors.test.ts`'s `tombstone_only_on_done`); `applyTombstones`/`upsertCanonical` are not both exported for direct use (`upsertCanonical` is, `applyTombstones` is not), so `runOne` end-to-end was the correct and available path — no fallback needed.
   **PASS**

7. **`purge()` selects only `deleted_at is not null and purge_after < now()`.**
   Ran the exact query `purge()` uses (`worker/src/media.ts:38-39`) inside a rolled-back transaction against the local DB with two seeded rows: one `deleted_at` in the past + `purge_after` in the past (should be selected), one `deleted_at null` + `purge_after` in the past (must not be selected). Result: only the first row (`88888888-…-888888888881`) came back; the `deleted_at null` row was correctly excluded. Transaction rolled back — no data left behind.
   **PASS**

8. **`scripts/checklist.ts` `checklist('drive', …)` rejects `/G1/`; G2 message differs from `meet`.**
   `pnpm exec vitest run test/scripts.test.ts -t checklist` → 1 passed (the existing `§9 checklist refuses a Meta USER token and a bcns Google client, accepts a system user` test, which asserts both `checklist('meet', …)` and `checklist('drive', …)` reject `/G1/` for a bcns-owned OAuth client). Read `scripts/checklist.ts:71-74`: the G2 message branches on `source === 'meet'` (`'G2: no readable Gemini notes doc in the folder'`) vs. the `drive` else-branch (`'G2: no readable file in the Drive folder'`) — the two strings differ.
   **PASS**

## Mutation Check Table

| Mutation | Target test | Failed as required? | Reverted cleanly? |
|---|---|---|---|
| (a) Remove `known.has(...)` guard — always fetch the thumbnail | `drive_thumb_once` | Yes — `expected [ [...] ] to be undefined` (thumb refetched for an already-known `img1`) | Yes — `git status --short worker/` empty |
| (b) Rethrow inside the `thumb()` catch instead of returning `null` | `drive_thumb_once` | Yes — uncaught `Error: HTTP 500` from `deck1`'s failing thumbnail fetch, propagated out of `pull()` (the `deck1` row never lands) | Yes — `git status --short worker/` empty |
| (c) Thumb path omits the client prefix (`` `thumb/${f.id}.jpg` ``) | `drive_thumb_once` | Yes — `expected [['thumb/img1.jpg', 'image/png']] to deeply equal [['<clientId>/thumb/img1.jpg', 'image/png']]` | Yes — `git status --short worker/` empty |

After all three: `diff <(git show HEAD:worker/src/connectors/drive.ts) worker/src/connectors/drive.ts` → identical.

## Tests Added

- `/Users/nateseluga/bcns-data/test/drive-tombstone.test.ts` — end-to-end tombstone/un-tombstone behavior for the `drive` connector against the real local DB via `runOne`: 3-file listing lands 3 rows with `deleted_at null`/`storage_path null`; a 2-file listing tombstones the missing row (`purge_after` stays null) and leaves the other two rows' `updated_at` unchanged; a 3-file listing again un-deletes the reappeared row. Left uncommitted per guardrails.

## Not Verifiable

none — every `done when:` criterion above mapped to a check that was actually run.
