# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 6

## Findings

### Minor
MINOR — apps/connect/lib/data-stats.ts:54 — a QuickBooks-only client with no pins cookie opens /data and the pinned strip is empty: `defaultPins` only names shopify/meta ids, so "Expenses, 30 days" exists in the catalog (and the tab badge) but is not shown until pinned by hand (same pre-existing gap for monday/meet/drive) — if the done-when "stat strip includes it" means visible by default, add `quickbooks/expenses` to `defaultPins`.

## Probes run
- Callers: selectKeys (data-query fetchPage, data-csv export), filterColumn (applyFilters only), tieBreak (counts head select, order, DataTable row key) — all unchanged for views without `attrs`; `attrs` keys (date, vendor, amount, currency, account, txn_type, payment_type, memo) collide with no records_v1 column used by the view, tieBreak `id`, dateColumn `occurred_at`, or extra `kind`.
- Allow-list: QBO selects 8 named attributes + id; `accounts`, `credit`, `attributes` never selected (test asserts no blob).
- Money: existing views pass `minorDigits` undefined -> `?? currencyDigits` path byte-identical; QBO USD/JPY/EUR/negative correct in formatCell and csvCell; negative CSV money not formula-guarded.
- Injection: attr names static; search term goes through pre-existing cleanSearch/searchFilter double escaping; QA verified hostile terms against live PostgREST v16.
- Tenant scoping: records_v1 is security_invoker over data.records (RLS); no client_id param path added; `source` enum has 'quickbooks' (20260924000100).
- page.tsx:80 `views[0]!`: quickbooks now has a view; a test asserts every HUB_SOURCE has one.
- Wiring: `pnpm test` = 323 pass / 0 fail (base 314; +8 engineer, +1 QA); file is in the literal package.json list.
- Mutations (throwaway detached worktree, cp-restored, cmp identical, removed): filterColumn ignores attrs -> 3 RED; selectItem ignores attrs -> 5 RED; csvCell drops minorDigits -> 1 RED; QBO config drops minorDigits -> 1 RED; selectKeys drops tieBreak -> 7 RED.
- No external calls, retries, or money writes in the diff.

## STANDARDS.md Updates
- Connect /data Views: JSON attributes reach the hub only through a per-view `attrs` allow-list
- Connect /data Views: money columns carry their scale explicitly (`minorDigits`)
