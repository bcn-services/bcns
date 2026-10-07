VERDICT: PASS
## VERDICT: PASS
**Branch:** feat/qbo-data-view (QA test commit on top of bc10fa6)
**Gate mode:** tests

## Criteria Checked
- QuickBooks tab on /data for connected client — "qbo view: a connected QuickBooks card gets a tab with views; every hub source has a view" — PASS
- Expenses view, real columns date/vendor/amount(money)/account/type/payment type/memo — "config shape, real columns in order, no blob" + "only qbo_expense rows come back" (row shape) + live PostgREST select — PASS
- Search covers vendor and memo — "search covers vendor and memo" + live PostgREST (q=globex/packing/initech/refund) — PASS
- Date filter — "from/to filter runs on occurred_at" + live PostgREST with UTC tz (2 rows, to-inclusive) — PASS
- CSV export like other views — "CSV export works like the other views" + live export through handleExport — PASS
- 30-day count/stat strip — "joins the 30-day count and stat strip" + live fetchCounts30 = 3 — PASS
- Money value x100 any currency, credits negative — "amount is value x 100 for every currency" (USD/JPY/negative) + added EUR — PASS
- Tests in apps/connect/tests + in package.json list — probe throwing test: 322->323 total, fail 0->1; restored, cmp identical — PASS
- No migration — git diff --name-status da54d22: only 6 files in apps/connect, no sql — PASS

## Evidence per ask
- Suite: 322/322 pass, 0 fail/skip/cancel (floor 322); now 323 with my added test, 0 fail.
- PostgREST syntax is REAL: ran PostgREST v16.4 (downloaded release binary to /tmp/pgrst, Postgres 17 local, no supabase start; torn down) with an api.records_v1 view over data.records and drove the app's real fetchPage/fetchCounts30/handleExport via postgrest-js 2.116.0. `alias:attributes->>key` select and `attributes->>key.ilike."%x%"` inside or= both worked; rows came back with named fields, search hit vendor and memo, order on occurred_at ok, no error.
- Hostile search live: terms `"returned"`, `(chairs)`, `50%`, `a,b`, `x)`, `%`, `_`, `\` all returned err=null with correct counts (50% matched only the literal-percent memo; `%`/`_` not treated as wildcards).
- Edge cases live + unit: null vendor/memo/payment_type render empty (cell and CSV, no "null"); Bill with null payment_type empty; -5000 => -$50.00 / CSV -50.00; JPY 150000 => ¥1,500 / 1500; EUR 2550 => €25.50 / 25.50; vendor `=cmd|calc` CSV => `'=cmd|calc`; memo with comma/quotes CSV-quoted.
- data.test.mjs diff: only STAT_IDS 14->15 (3 asserts) and adding "quickbooks" to the all-sources catalog (14->15); no assertion weakened or removed. Existing money columns use minorDigits undefined => same `?? currencyDigits` path; full suite green.
- typecheck exit 0; `next build` succeeds (/data, /data/export present).
- Guardrails: no platform/worker change, no package.json deps change (only test list line), no lockfile change, no migration; fixtures use fake names (Globex, Initech, Umbrella KK).

## Failures
none

## Tests Added
- `apps/connect/tests/qbo-data-view.test.mjs` — engineer's 8 tests plus one QA edge-case test (null cells, EUR, negative, CSV formula guard, exact escaped or= string for `a,b)"%`).

## Not Verifiable
none. Live data absent in prod; verified against a local PostgREST with fixture rows instead of the mocked fake alone.

## Notes (non-blocking)
- INFO — timestamptz date filters depend on DB session TZ (pre-existing for all views; Supabase is UTC; my first local run in Los_Angeles TZ shifted the "from" boundary).
