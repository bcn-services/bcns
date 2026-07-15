---
# Fix Report — P1 App Scaffold
**Date:** 2026-07-15
**Findings addressed:** 5 of 5: 0 QA failures + 5 review findings (2 Important + 3 Minor)

## Changes Made
- `apps/delucas/src/shell-electron/main.ts:26` — `sandbox: false` → `sandbox: true`; Chromium process sandbox restored — review Important
- `apps/delucas/src/shell-electron/main.ts:32,34` — replaced `void win.loadURL/loadFile(...)` with `.catch(err => console.error('[main] load failed', err))` to surface load failures — review Minor
- `apps/delucas/src/shell-electron/main.ts:86-107` — wrapped `createWindow()` in try/catch inside `app.whenReady` and `activate` handlers; calls `app.quit()` with logged error on failure — review Minor
- `apps/delucas/tests/import-boundary.test.mjs:15-16,41-44` — extended scan to also cover `src/bridge/` (excluding `preload.ts`); now catches forbidden imports in `mockBridge.ts` and `BridgeInterface.ts` — review Important
- `apps/delucas/src/bridge/BridgeInterface.ts:19` — added comment on `db.query` flagging that ipcMain handler must use parameterized queries only and must never pass raw client SQL to SQLite — review Minor

## Disputed
None.

## Deferred
None.

## Verification
- `pnpm --filter @delucas/app typecheck` — PASS
- `pnpm --filter @delucas/app lint` — PASS
- `node apps/delucas/tests/import-boundary.test.mjs` — PASS (4 files checked, 0 violations)

---
# Fix Report — P2 Data model + P&L core
**Date:** 2026-07-15
**Findings addressed:** 7 of 7: 0 QA failures + 7 review findings (2 Critical, 4 Important, 1 Minor)

## Changes Made
- `main.ts:81` — Added `Array.isArray(params)` guard in `db:query`; rejects non-array params with thrown error before spread — review Critical
- `main.ts:100–133` — `db:insertTransaction`: full runtime validation (amount_cents positive integer; direction/category/source checked against closed Sets); try/catch returning `{ ok, error }` structured response — review Critical
- `queries.ts:27–51` — `getTransactionsByMonth`: added `/^\d{4}-\d{2}$/` regex guard before LIKE; added new `getTransactionsInRange(db, from, to)` with date range `>=`/`<=` — review Important
- `main.ts:146–159` — `db:get12MonthSeries`: replaced unbounded `getTransactions()` with 12-month window via `getTransactionsInRange(fromDate, toDate)` — review Important
- `recurring.ts:83–114` — Wrapped each rule's month loop in `db.transaction(...)` to prevent partial materialization on crash — review Important
- `main.ts:226–231` — `settings:set`: rejects non-string/non-number values before `String()` coercion; throws descriptive error — review Important
- `main.ts` (all read-path handlers) — Wrapped `db:query`, `db:getTransactions`, `db:getTransactionsByMonth`, `db:getMonthPnl`, `db:get12MonthSeries`, `db:getSummary`, `db:getRecurringRules`, `db:materializeRecurring`, `db:isEmailProcessed`, `settings:get` in try/catch with `console.error` logging — review Minor

## Disputed
None.

## Deferred
None — all 7 findings addressed. typecheck, lint, and all 43 tests pass on `feat/delucas-p1-scaffold`.
---
