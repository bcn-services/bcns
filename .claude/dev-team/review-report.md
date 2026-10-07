REVIEW: 0C/0I/0M
# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 7 (delta 7a92f5c..4ce59f2, excl. engineer-report.md)

## Findings

No findings.

## Verification (no finding)
- Prior Important fixed: run.ts:336 `emptyFullListTables` now filters to `media`. Only drive.ts:53 declares a `media` fullList (monday `jobs`, meta `records`), so Monday and Meta go back to the base tombstone path. The thrown text is now fixed to the "folder" wording, and EMPTY_NOUN is gone. Pinned by empty-full-list.test.ts "never guards Monday jobs or Meta records".
- Prior Minor (Meta backfill flap) gone: Meta never reaches the throw now. Drive has no analogue. pull() ignores the cursor, so a retried backfill walks the whole folder again and throws the same way each time, with no error -> ok -> error flip.
- No regression vs feat/hub-first-run: `git diff -a feat/hub-first-run...HEAD` on run.ts is only the guard plus the SourceError import. On worker.test.ts it is only the new empty_full_list_fails_not_tombstones test. stale_no_false_alarm, lease_lost_write_ignored and the worker_isolation meta stub match base exactly.
- DB test empty_full_list_fails_not_tombstones, traced against the committed code:
  - mkClient(drive) seeds config {folder_id:'f1'} (passes the drive configSchema) and a google_oauth_refresh token with expires_at null, so it never refreshes.
  - The stub answers `/drive/v3/files` with {files} and no nextPageToken. walkFolder yields one page with last=true, so entity 'file' finishes. No thumbnailLink, so there is no Storage call. kind 'file' passes the media check.
  - Run 2 (empty) throws before applyTombstones, so deleted_at and purge_after stay null.
  - Run 3: applyTombstones sets deleted_at and purge_after on d2 (run.ts:353).
  - The fixture pattern matches drive-tombstone.test.ts, which already runs DB-backed. Not executed here (no local stack, per instructions).
- The pure runOne Drive twin passes: the fetch stub returns {files} for every URL, and the regex `update data\.media set deleted_at = now\(\)` matches run.ts's template.
- friendlyError: run.ts:296 is the only producer of "found nothing to sync" (git grep at 4ce59f2). It always says "folder", so collapsing to EMPTY_FOLDER_WARNING is exact. The guard never shipped, so no old board or ad account messages exist in connector_runs. folderCheck (source-settings.ts:227) still matches the string.
- Docs: DESIGN §4.1 (:780-789), §5 step 3 (:1071), §5.5 stale row and test table rows :1303-1304 match the code. Monday "board not found" is at monday.ts:45. NOTES #7/#8 are accurate. No other doc still describes a Monday or Meta guard.
- Counts:
  - platform non-DB: 17 files / 174 pass (floor 173), run on a `git archive 4ce59f2` extract, so QA's concurrent mutations could not affect it.
  - connect: 341/341 pass in the worktree (floor 341; git status was clean at run time). Removing the monday assertion did not change the test count.

## STANDARDS.md Updates
none (findings-only run, no repo edits per instructions)
