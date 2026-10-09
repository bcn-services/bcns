REVIEW: 0C/1I/1M

# Review Report
**Date:** 2026-10-08
**Files Reviewed:** 4 (platform/worker/src/health.ts, platform/worker/src/connectors/meet.ts, platform/test/break-emails.test.ts, platform/test/tenant.test.ts; commit 96ea2f7 vs chore/connect-polish)

## Findings

### Important
Important — .gitignore:50 + worktree index (`git diff --cached --stat`: 15 files, 460 deletions) — `.claude/dev-team/*-report.md` is gitignored and the index already stages deletions of all 15 tracked reports (engineer-report.md, item5-*, item9-*, qa-, review-*); the planned `git add .claude/dev-team/` silently skips ignored files, so the outcome commit would delete 15 files outside platform/ and commit none of this item's reports (breaks "no file outside platform/" and "reports committed") — before committing, `git restore --staged .claude/dev-team/` (index only, no checkout) and `git add -f` the item's report files, or confirm with Nate that untracking the old reports is intended and belongs in this PR.

### Minor
Minor — platform/DESIGN.md:1149,1158 — §5.6 documents the 'no owner to email' sent-row last_error but not the new rule; an operator who finds a sent client_break/weekly_digest row with last_error 'resend 409: idempotency key already used', or a retried row whose earlier error vanished on success, has no spec line explaining either — add one clause after "Idempotency-Key = dedupe_key": "a 409 (key already used) marks the row sent with last_error = 'resend 409: idempotency key already used'; any other success clears last_error".

## Rulings on the orchestrator's questions
- last_error cleared on success (health.ts:382): acceptable, keep as is, no coalesce. data.notifications has no grant and no view (DESIGN.md D4/D21:507). The only code reader is the worker, and health.ts:141/257 read only dedupe_key/sent_at. The hub reads connector_health_v1. worker.test.ts reads last_error only on the no-owner and digest paths, and those use a separate statement (health.ts:356) or have no prior error. `attempts` still records the failures. A sent row that still shows a stale "resend HTTP 500" would mislead.
- 409 (health.ts:322): matches the decision. The check runs before `!r.ok`, the 500 path still throws with the status, and the ops-alert branch sends no Idempotency-Key so it can't hit this path. Concurrent case: losing an email needs two sendPending runs overlapping on the same key, and sendPending only runs from alerts() under the housekeeping lease (tick.ts:103). So that would take a lease expiry mid-step plus the original request then failing at Resend. Too remote for a note. If owners change between a lost-response send and the retry, invalid_idempotent_request marks the row sent and the new owner gets no email. That is consistent with "already sent".
- Sub-item 5 (tenant.test.ts:18-35): all five deletes are byte-identical to the old ones, including the comment. acmeCreated is declared at :17, before `try`. The loop and the betaSnapshot expect are inside `try`. No other line changed.
- Sub-item 9 (meet.ts:120-121): the comment is accurate. fullListSources is at connectors/index.ts:205, the `modifiedTime > since` filter is at meet.ts:20, and it cites §5.5. No code change.
- Mutation: by inspection, removing health.ts:322 makes a 409 hit `!r.ok` and throw, so break-emails.test.ts:125 rejects (red). That matches the engineer's mutation result. I did not rerun it in a throwaway worktree because the brief forbids new worktrees. No file outside platform/ is in the diff, and there is no migration or supabase/ change.

## STANDARDS.md Updates
None written (lane guardrail: no file outside platform/ is touched). Proposed for after the PR: (1) Platform worker: a Resend send with Idempotency-Key = dedupe_key treats 409 as sent and records why in data.notifications.last_error. (2) DB-backed platform tests do cleanup deletes in `finally`. (3) Repo process: `.claude/dev-team/*-report.md` is gitignored (.gitignore:50), so committing a report needs `git add -f`.
