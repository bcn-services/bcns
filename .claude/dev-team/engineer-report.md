BUILT — feat/qbo-data-view — bc10fa6 — self-check: pnpm --filter @bcn-services/connect test pass
TESTS: 314 -> 322 (# tests 322 / pass 322 / fail 0 / skipped 0); typecheck clean; build ok
WIRED: tests/qbo-data-view.test.mjs appended to the literal `test` list in apps/connect/package.json (count rose by 8 new tests)
MUTATION 1 (searchColumns drops "memo"): RED -> "qbo view: search covers vendor and memo..." only; restored, cmp identical
MUTATION 2a (formatMoney/moneyMajorString ignore minorDigits): RED -> "qbo view: amount is value x 100 for every currency..." only; restored, cmp identical
MUTATION 2b (formatCell ignores currencyKey): RED -> "cells: money column reads its row's currency" + "qbo view: amount is value x 100..."; restored, cmp identical
MUTATION 3 (a: applyFilters skips cfg.extra): 7 RED incl. "qbo view: only qbo_expense rows come back"; (b: QBO entry loses its `extra`): 4 RED (qbo view: only qbo_expense / search / from-to / 30-day count); restored, cmp identical, git status clean
Backups were cp to /tmp/qbo-bak; no git checkout used.
## Files Changed
- apps/connect/lib/data-views.ts — `attrs` allow-list + `Column.minorDigits`, `filterColumn()`, selectKeys emits `alias:attributes->>name`, new quickbooks/expenses entry, doc comment updated
- apps/connect/lib/data-format.ts — minorDigits threaded through formatMoney, moneyMajorString, formatCell, csvCell
- apps/connect/lib/data-query.ts — search columns mapped through filterColumn (or= reads `attributes->>vendor`, `attributes->>memo`)
- apps/connect/tests/qbo-data-view.test.mjs — new (8 tests: filter leak, select aliases, search, date filter, money/CSV, export, 30-day count+STAT_IDS, tab, every HUB_SOURCE has a view, attr-name regex)
- apps/connect/tests/data.test.mjs — STAT_IDS count 14->15 (4 asserts) and the all-sources catalog now includes quickbooks; intentional coupling to view count, no test deleted
- apps/connect/package.json — test list append
## Design Decisions
- As prescribed. Added exported `filterColumn()` in data-views.ts so select and filter share one mapping. No page.tsx change needed (`views[0]!` now defined).
- toFixed uses the currency's digits, so a JPY value with fractional yen would round; QBO JPY has none (ponytail, not marked inline).
## Deferred / Out of Scope
- No render test of DataTable (pages have none); no live PostgREST check of `alias:attributes->>x` select / `attributes->>x.ilike` in or= (prod has zero QBO rows; fake interprets syntax). Reviewer: confirm syntax against PostgREST docs.
## Flags for Reviewer
- Attr names are static constants spliced into select/or strings; test enforces /^[a-z_]+$/.
- records_v1 select of `attributes->>x` returns text; amount arrives as a numeric string, handled by finite().
- .claude/dev-team/*-report.md is gitignored in this repo, so this report is not in the commit.
