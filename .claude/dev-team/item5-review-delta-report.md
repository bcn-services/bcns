REVIEW: 0C/0I/0M

# Delta Review Report (71a0c2a..d894120)
**Date:** 2026-10-06
**Files Reviewed:** 4

All 3 findings are fixed, and the fix commit introduces nothing new.
- Fixed, was Important: `fmtMoney` (health.ts:219-221) now always divides by 100, and Intl rounds to each currency's own digits. JPY 500000 shows as ¥5,000, and the average order of 250000 as ¥2,500. The new KWD test (1234 → `KWD 12.340`) also pins the divide-by-100 rule; under the old code it would have printed KWD 1.234. No other caller depends on the old behaviour.
- Fixed, was Minor: worker.test.ts:319 now asserts `housekeeping` is true on the repeat tick, so the dedupe check can no longer pass without running.
- Fixed, was Minor: DESIGN.md:1145 now says ad spend counts only when it has a currency (`ad_currency ?? currency`), which matches health.ts:202. It also states the money convention: stored ×100, displayed /100.
- Tests: platform vitest at HEAD d894120 gives 178 passed, 0 failed, above the 177 floor.
