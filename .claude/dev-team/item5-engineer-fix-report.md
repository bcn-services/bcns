BUILT — feat/weekly-digest — d894120 — self-check: pnpm --filter @bcn-services/platform test pass
# Engineer Fix Report (round 1, item 5)
**Date:** 2026-10-06
**Findings addressed:** 3 of 3 (0 QA + 1 Important + 2 Minor)

## Changes Made
- platform/worker/src/health.ts `fmtMoney` — always `minor / 100`, Intl rounds to the currency's own digits; doc comment rewritten (JPY was 100x high, KWD 10x low) — review Important
- platform/test/weekly-digest.test.ts — JPY test now `revenue_minor: 500000` -> `¥5,000` / `¥2,500`; new KWD case 1234 minor -> pinned literal `'Sales: KWD 12.340'` (Intl puts U+00A0 between code and amount) — review Important
- platform/test/worker.test.ts ~318 — repeat-week `run()` now `expect((await run()).housekeeping).toBe(true)`; first run already asserted it — review Minor
- platform/DESIGN.md ~1145 — no-data clause says ad spend counts only with a currency (`ad_currency ?? currency`); added that money stays `amount * 100` and `digestEmail` divides by 100 — review Minor
- Sweep: no other "currency's own fraction digits" in my diff; hub `data-format.ts` / `apps/sb` formatMoney left alone (out of scope follow-up).

## Results
- Tests: 178 pass, 0 fail, 0 skip (floor 177, +1 KWD case). Typecheck: clean.
- Mutation: reverted `fmtMoney` to `/ 10 ** maximumFractionDigits` (backup cp to /tmp/health.ts.bak) -> 2 FAIL lines: "money is stored as amount * 100 in every currency: JPY 500000 minor is 5,000 yen" and the KWD case; 176 pass. Restored from backup: shasum identical (cf7d6d4a...), `git status` clean for that file after commit.
- Pinned KWD literal: `KWD 12.340` with U+00A0 after the code.

## Disputed / Deferred
- None disputed. Out of scope per orchestrator: hub `currencyDigits` JPY bug, `api.daily_summary_v1` two-currency merge.

## Note
- Index carried pre-existing staged deletions of `.claude/dev-team/*-report.md` (tracked item-4 reports); not mine, left staged and excluded from the commit (path-limited `git commit`). Reports are gitignored (`.gitignore:50`), so this report is on disk only.
