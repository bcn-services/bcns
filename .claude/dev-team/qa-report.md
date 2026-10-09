# QA Report
**Task:** Item D, apps/sb polish (formatMoney /100, vendor Inter Tight) | **Branch:** polish/sb | **Date:** 2026-10-08 | **Gate mode:** tests

## VERDICT: PASS

## Criteria Checked
- pnpm test in apps/sb: 274 tests, 273 pass, 0 fail, 1 skip (floor 273 met; no test file added, package.json untouched) -- PASS
- root pnpm typecheck: 11/11 successful -- PASS
- grep next/font/google apps/sb: only apps/sb/DESIGN.md:56 (orchestrator-ruled, DESIGN.md untouched); fonts dir has woff2 + OFL.txt + README.md -- PASS
- formatMoney divides by 100, JPY 1999 -> "¥20" and 150000 -> "¥1,500" asserted in tests/overview.test.mjs, green -- PASS
- Only apps/sb touched (layout.tsx, lib/overview.ts, 2 tests, new app/fonts/); package.json + DESIGN.md diff empty -- PASS
- Font: magic bytes wOF2; sha256 83d548cd...938aaf matches README; fvar wght axis min 100 / default 400 / max 900 (decoded via node brotli, no installs) covers 400-700; family name Inter Tight; fonts dir 56 KB (<400 KB) -- PASS
- Parity (static, layout.tsx): family Inter Tight, weight "400 700", variable --font-inter-tight, display swap, fallback [system-ui, sans-serif]; globals.css untouched -- PASS
- Callers: page.tsx passes *_minor sums, financials/transactions.tsx passes *Cents, daily-report.ts reads *_minor; none need a change -- PASS
- Mutation (formatMoney reverted to 10 ** digits in-place, backup via cp): 2 fail (overview JPY test, qa-daily-report JPY test), 271 pass; restored, shasum -c OK, back to 273/0 -- PASS

## Tests Added
- none new; flipped /extended: tests/overview.test.mjs (JPY formatMoney + formatMoneyWhole JPY), tests/qa-daily-report.test.mjs (JPY daily line "¥123")

## Not Verifiable
- next build / browser render of the font: forbidden by guardrails (no sb build, no dev server); parity verified statically only.
- Notes: engineer also fixed formatMoneyWhole (same bug); not mutation-checked (only formatMoney mutated), its JPY assertion is present and green. DESIGN.md:56 is stale (says next/font/google), left untouched per orchestrator. Non-USD tenants display changes 100x (SB is USD, no reviewer-visible change).
