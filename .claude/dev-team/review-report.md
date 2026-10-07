REVIEW: 0C/0I/4M
# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 4

## Findings

### Minor
Minor — docs/architecture/platform-v1.md:261 — this is a line the engineer edited, and it still reads "no such branch exists; it was written fresh … (PR #98, merged)". The present tense is now false: the guard exists on main — change it to "no such branch existed".
Minor — docs/architecture/platform-v1.md:204-214 — the section "What exists today (read from origin/main)" still says client rows come only from onboard.ts and that there is "no sign-up route". Both are stale since #99 merged. The lever bullet at :229 now lists `pending` as current, so the section contradicts itself — date-stamp the heading (e.g. "as of 2026-09-30") or update those bullets (follow-up, pre-existing).
Minor — platform/DESIGN.md:389-390 — the hook spec returns a 403 for every status other than `active`. Since 20261001000200_signup_pending.sql, a `pending` user gets a token with `client_status: 'pending'` and no tenant claims. Line 67 now says `pending` exists while the hook spec is silent about it — add a matching one-line SQL comment pointing to 20261001000200 (follow-up).
Minor — docs/architecture/platform-v1.md:70,316 — "Actions minutes exhausted until 2026-10-01" is past its date as of 2026-10-06. This stale claim was already there and is unrelated to this item — re-verify, or mark it as historical (follow-up).

## STANDARDS.md Updates
none (scoped by caller: no repo edits)
