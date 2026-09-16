---
# QA Report
**Task:** Item B1 — Daily Financial Report (home panel `DailyReportPanel` + `pnpm briefing`)
**Branch:** feat/daily-financial-report (commit 450ee9a)
**Date:** 2026-09-14
**Gate mode:** tests

## VERDICT: FAIL

## Criteria Checked
- Deterministic, no AI — `lib/daily-report.ts` is pure aside from `loadDailyReport`'s three reads; no model calls anywhere in scope — PASS (code inspection, existing + new tests).
- Yesterday = client-local day, default America/New_York when `client_v1.timezone` is falsy — `yesterdayInTimezone`/`todayInTimezone`, existing tz tests plus new DST fall-back and +14/-11 offset-extreme tests (`qa-daily-report.test.mjs`) — PASS.
- Yesterday computed correctly for a garbage/unsupported timezone string from `client_v1` — `todayInTimezone("Not/AZone", …)` / `yesterdayInTimezone("Not/AZone", …)` / `yesterdayInTimezone("", …)` — **FAIL**, see Failures.
- Figures: revenue, orders, AOV (`daily_summary_v1`); ad spend (`campaign_daily_v1`); manual income/expenses (`records_v1` financial_entry/dashboard via `lib/financials.ts`); profit identity — `computeDailyReport`/`computeFinancialTotals` merge tests (existing) plus new null/NaN-field and cross-day-entry tests — PASS.
- Profit = revenue + manual income − ad spend − manual expenses — existing "merges" test asserts the exact identity — PASS.
- "No data yet" when no source has anything for the day; a missing source shows "—", never $0 — existing empty/partial tests plus new all-sources-null-field test (all-zero-but-present distinguished from "no rows") — PASS.
- A failed view read counts as no rows for that source, is logged, never blanks the others — existing single-failure test plus new all-three-fail and rejected-promise (vs. `{error}` result) tests — PASS.
- Computed live on the home panel, not persisted — `app/page.tsx` calls `loadDailyReport` inside the page's own `Promise.allSettled` on every request (`dynamic = "force-dynamic"`), no cache/write path exists — PASS (code inspection).
- `pnpm briefing` prints the same report to stdout — `scripts/briefing.ts` calls the identical `loadDailyReport`/`formatDailyReportText`/`yesterdayInTimezone` — PASS (code inspection; not run live, no DB/env available in this sandbox — see Not Verifiable).
- Non-USD currency and a malformed currency code degrade gracefully in the report lines — new JPY (0-decimal) and malformed-code tests — PASS.
- DESIGN.md documents the section — `### Daily Financial Report` present with placement, figures, states, button — PASS (read).
- Test coverage: `lib/daily-report.ts` covered by `tests/daily-report.test.mjs` (engineer's) + `tests/qa-daily-report.test.mjs` (this QA pass), both wired into `package.json`'s `test` script — PASS.

## Failures
- `lib/overview.ts` `todayInTimezone` (and therefore `lib/daily-report.ts` `yesterdayInTimezone`) throws an uncaught `RangeError: Invalid time zone specified` for any timezone string Intl doesn't recognize — `lib/overview.ts:38`. `lib/header.ts:33` (`loadShellData`, out of QA scope but the only caller) only substitutes `DEFAULT_TIMEZONE` when `client_v1.timezone` is falsy; a non-empty garbage value (typo, a value from an older bcns-data enum, admin fat-finger) reaches `todayInTimezone`/`yesterdayInTimezone` unguarded and crashes the whole home-page render (`app/page.tsx:65,70`) and `pnpm briefing` (`scripts/briefing.ts:31`), rather than the panel showing "No data yet." or "—". Concrete failure scenario: `client_v1.timezone = "America/New_Yrk"` (typo) → home page 500s entirely, not just the Daily Financial Report panel. Root Cause: **bug** — the spec calls for "no not-connected state" and every other source degrades to "—"/"No data yet." on failure; an unvalidated timezone breaking the *entire page* rather than just this panel is a gap in the same defensive pattern already applied to the three data reads.

## Tests Added
- `tests/qa-daily-report.test.mjs` — timezone edges (invalid tz throws — documents the bug above; +14/-11 IANA offset extremes; DST fall-back date correctness), non-USD (JPY 0-decimal) and malformed-currency-code line formatting, null/NaN/non-numeric row fields treated as 0 not NaN, a financial entry with a non-finite `amount_cents` silently dropped, entries from a wider read correctly narrowed to the target day, and two loader failure shapes (all three sources returning `{error}`, and a rejected promise vs. an `{error}` result) not covered by the engineer's `tests/daily-report.test.mjs`. No new test infra — reuses the existing `tsx --test` fake-client convention from `tests/daily-report.test.mjs`.
- `package.json` — added `tests/qa-daily-report.test.mjs` to the `test` script's explicit file list.

## Mutation Results
Both run against `lib/daily-report.ts`, confirmed to fail tests, then reverted — `git diff --stat lib/` is empty and `diff` against a pre-mutation backup is identical.
- Flipped the `r.day === day` filter in `computeDailyReport` (line 45) to pass all rows through unfiltered → 2 tests failed (`rows only for other days still count as no data`, the merge test) → reverted, byte-identical.
- Flipped `hasData` (lines 48-52) to `const hasData = false` → 6 tests failed across both suites → reverted, byte-identical.

## Not Verifiable
- `pnpm briefing`'s stdout output was verified by code inspection (identical calls to the home panel's) but not run live — no `NEXT_PUBLIC_SUPABASE_URL`/`AGENT_EMAIL`/`AGENT_PASSWORD` or a real Supabase dev DB available in this sandbox, and the task's hard limits forbid reading `.env.local`/`.env.production` or standing up `next dev`/`next build`. Interpretation tested instead: `formatDailyReportText`/`loadDailyReport` unit tests cover the same code path `briefing.ts` calls, so the merge/format logic is verified even though the script's end-to-end stdout was not exercised.

## Commit
**Not committed.** `git add`/`git commit` for `tests/qa-daily-report.test.mjs` and the `package.json` test-list line were blocked by this session's auto-mode permission classifier ("Modify Shared Resources") on every attempt, including a follow-up `git diff --cached`. Both files are present on disk on `feat/daily-financial-report` and untouched otherwise:
- `git status --short` showed: ` M package.json` and `?? tests/qa-daily-report.test.mjs` at last successful check.
- Someone with commit permission should run: `git add tests/qa-daily-report.test.mjs package.json && git commit -m "test: QA coverage for Daily Financial Report timezone/currency/dirty-data edges"`.
---
