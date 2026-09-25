# Fix Report
**Date:** 2026-09-24
**Findings addressed:** 9 of 10 (9 applied: 4 SB + 2 hub + 3 worker findings; 1 explicitly deferred — Opus M5)

## Changes Made
- `apps/sb/lib/financials.ts:561-562` (`toQboTxn`) — removed the `amountCents <= 0` rejection so a negative `amount_cents` (a deliberate credit/refund) passes through instead of being dropped — review Critical (S1, review-report-b).
- `apps/sb/tests/quarter-budget.test.mjs:103-112` — added test proving a +10000 debit and a -2500 credit net to 7500 spent — S1 coverage.
- `apps/sb/lib/financials.ts:480` (`TXN_EXTERNAL_ID_RE`) — tightened `[0-9]+` to `[0-9]{1,20}` to match a real QBO id — review Important (S4, review-report-opus I2).
- `apps/sb/lib/financials.ts:781-787` (`parseBulkAssignInput`) — rewrote: dedupes txn ids via `Set`, rejects over `QBO_RECENT_LIMIT` with `code: "txn"`, and now rejects an empty/missing sector with `code: "sector"` instead of silently treating it as a bulk unassign — review Critical (S2, review-report-b) + Important (S4, review-report-opus I2).
- `apps/sb/tests/quarter-budget.test.mjs:215-236` — added tests for empty/null/missing sector rejection, duplicate-id collapse, and the over-cap rejection at `QBO_RECENT_LIMIT`/`+1` — S2/S4 coverage.
- `apps/sb/app/financials/transactions.tsx` (bulk `<select>`) — added `required` + `disabled` placeholder option, matching the now-mandatory sector — S2.
- `apps/sb/lib/financials.ts` (`SectorTotalsResult`, `sectorTotals`, new `pickQboCurrency`) — `sectorTotals` takes an optional `currency` param, skips + counts (`skippedCurrencyCount`) any in-window, sector-assigned txn whose currency disagrees; `pickQboCurrency` picks the most common currency among the QBO txns, falling back to the page currency — review Important (S3, review-report-b).
- `apps/sb/app/financials/page.tsx` — computed `qboCurrency = pickQboCurrency(...)` independent of the page-wide `pickCurrency` (Shopify/Meta), passed it + `skippedCurrencyCount` into `QuarterlyBudgetPanel`, and added `currency` to each `recentTxnRows` entry — S3.
- `apps/sb/app/financials/transactions.tsx` (`QuarterlyBudgetPanel`) — renders a one-line note when `skippedCurrencyCount > 0`; (`RecentTransactionsPanel`) — formats each row's amount with its own `t.currency` instead of one panel-wide currency prop, which is now removed as dead — S3.
- `apps/sb/tests/quarter-budget.test.mjs:115-141` — added tests for currency-skip behavior (with and without a `currency` filter, for backward compatibility) and for `pickQboCurrency`'s most-common/fallback behavior — S3 coverage.
- `apps/connect/lib/quickbooks-oauth.ts` — added `isValidRealmId(realmId)` (`^[0-9]{1,32}$`) — review Important (H1, review-report-opus M1).
- `apps/connect/app/api/oauth/quickbooks/callback/route.ts:48-50` — calls `isValidRealmId` and fails with `bad_realm_id` before `exchangeCode`, so a malformed realmId never spends the single-use code — H1.
- `apps/connect/tests/quickbooks-oauth.test.mjs` — added a direct `isValidRealmId` unit test, extended the existing route-ordering static assertion to include the new guard, and added a static (non-runtime, matching the suite's existing pattern for anything gated behind `requireOwner`) proof that the guard sits strictly before `exchangeCode`'s one fetch — H1 coverage.
- `apps/connect/lib/quickbooks-oauth.ts` (`handleQuickbooksToken`) — `expires_in` now must be a positive integer `<= 86400*7` or the exchange is refused as `malformed`; a missing value still defaults to 3600 — review Important (H2, review-report-opus M2).
- `apps/connect/tests/quickbooks-oauth.test.mjs` — added a test covering 0, negative, non-integer, `Infinity`, and over-cap `expires_in`, plus the boundary value passing — H2 coverage.
- `platform/worker/src/connectors/quickbooks.ts` (`refreshToken`) — now validates `access_token` (non-empty string), `refresh_token` (unchanged, already checked), and `expires_in` (finite, > 0) before returning, throwing a `SourceError` on any of the three being invalid — review Important (W1, review-report-opus M3).
- `platform/test/quickbooks.test.ts` — added tests for a missing `access_token` and for an invalid `expires_in` (0, -1, non-numeric) — W1 coverage.
- `platform/worker/src/connectors/quickbooks.ts` (`baseUrl`) — throws `QUICKBOOKS_ENV must be 'sandbox' or 'production'` when the env var is unset or anything other than those two values, instead of defaulting to sandbox — review Important (W3, review-report-opus M4).
- `platform/test/quickbooks.test.ts` (`baseUrl` describe) — rewrote the "defaults to sandbox" and "typo fails safe" tests to expect a throw instead; added a `sandbox`-explicit case; added `beforeEach`/`afterEach` env scaffolding to the unrelated `pull()` describe block so its tests (which don't care about `QUICKBOOKS_ENV`) still get a valid value now that `baseUrl()` no longer defaults — W3 coverage + regression fix caused by the change.
- `platform/DESIGN.md:962` (§4.7) — updated the Env row to describe `QUICKBOOKS_ENV` as required (throws rather than defaulting) instead of "defaults to sandbox so a missing var fails safe" — W3.
- `platform/worker/src/run.ts` (`refreshOne`) — the DB update marking `status = 'auth_failed'` now only runs when `classify(e) === 'auth'`; any other error (a transient 5xx, network failure) leaves the row's status untouched. The success-path token-write moved outside the `try` so a failure there (e.g. a DB error) propagates out of `tx()` instead of being caught and miscategorized as a refresh failure — review Important (W2, review-report-opus I1). No test added: `refreshOne` has zero existing coverage and adding it here would require a live local Postgres, which this environment doesn't have (per task instruction).
- `platform/worker/src/tokens.ts:13-18` — updated the stale comment above `refreshTokens` (it claimed `refreshOne` marks `auth_failed` on any throw) to describe the new `classify(e) === 'auth'` gating and why the hourly `auth_failed` retry clause is still needed for genuinely dead tokens.
- `apps/connect/lib/env.ts` — checked, confirmed no `QUICKBOOKS_ENV` reference exists there, so no change needed for W3 consistency.

## Disputed
None.

## Deferred
- **Opus M5** (`save_record` never updates `kind`) — explicitly out of scope per task instruction; recorded here as an open risk carried forward from `review-report-opus.md`, not fixed in this pass.

## Verification
- `corepack pnpm --filter @bcn-services/sb test` — 269 tests, 268 pass, 1 skipped (pre-existing, no Supabase env for a live RLS probe), 0 fail.
- `corepack pnpm --filter @bcn-services/sb typecheck` — clean.
- `corepack pnpm --filter @bcn-services/sb lint` — clean.
- `corepack pnpm --filter @bcn-services/connect test` — 167 tests, all pass.
- `cd platform && corepack pnpm vitest run test/quickbooks.test.ts` — 23 tests, all pass.
- `cd platform && corepack pnpm typecheck` — clean.
- (Not run: `platform`'s `worker.test.ts` — pre-existing failure in this environment, `supabase status` / local Postgres on `127.0.0.1:54322` unavailable; not one of the instructed targeted commands.)

### Mutation proof — S1 (negative amount_cents guard)
Reverted `toQboTxn`'s guard back to `!Number.isSafeInteger(amountCents) || amountCents <= 0`, ran only the new test:
```
not ok 1 - sectorTotals: a negative amount_cents (credit/refund) offsets that sector's spend
  error: 'toQboTxn must accept a negative amount_cents'
```
Restored the fix, re-ran the same test:
```
ok 1 - sectorTotals: a negative amount_cents (credit/refund) offsets that sector's spend
# pass 1, fail 0
```

### Mutation proof — S2 (empty-sector guard)
Reverted `parseBulkAssignInput` to treat `""`/`null`/missing `sector` as a valid unassign (`{ ok: true, value: { txns, sector: null } }`), ran only the new test:
```
not ok 1 - parseBulkAssignInput: rejects an empty/missing sector — bulk unassign is not a feature
  expected: { ok: false, code: 'sector' }
  actual:   { ok: true, value: { txns: [ 'Purchase:1' ], sector: null } }
```
Restored the fix, re-ran the same test:
```
ok 1 - parseBulkAssignInput: rejects an empty/missing sector — bulk unassign is not a feature
# pass 1, fail 0
```

## Commits (branch `quickbooks-connector`)
- `1f1edf5` — fix: SB financials credit handling, bulk-assign guards, currency mixing (S1-S4)
- `942ca9b` — fix: validate realmId and expires_in before trusting Intuit (H1, H2)
- `5e13813` — fix: worker refresh hardening and QUICKBOOKS_ENV fail-loud (W1, W2, W3)

## Summary
All 9 in-scope findings (4 SB, 2 hub, 3 worker) applied with the smallest diff that satisfies each; both new SB guards (S1, S2) mutation-proven red/green. Every targeted verification command passes clean. Opus M5 (`save_record` never updates `kind`) is intentionally deferred per task instruction and remains an open risk.
