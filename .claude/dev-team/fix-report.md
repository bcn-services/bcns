# Fix Report — P5 Dashboard
**Date:** 2026-07-15
**Findings addressed:** 4 of 4: 0 QA failures + 3 Important + 1 Minor review findings

## Changes Made
- `main.ts:431–443` — added field allowlist + per-field type validation to `db:updateRecurringRule` before passing to `updateRecurringRule`; allowed fields: `amount_cents`, `day_of_month`, `vendor`, `category`, `end_date`, `is_active`; wrapped in existing try/catch returning `{ok, error}` — review Important (security / validate at boundaries)
- `main.ts:305–308` — changed `return { ok: false, error: "…" }` on bad month input to `throw new Error("…")` so the renderer's catch path handles it and the return type stays `Transaction[]` throughout — review Important (reliability / explicit over implicit)
- `BannerList.tsx:28–32` — removed `dismissedError` from `useEffect` dep array; effect now runs only when `currentError` changes, eliminating the no-op re-run after every dismiss — review Important (reliability / handle errors at boundaries)
- `TransactionList.tsx` — added `deleteError` state; surfaces delete failures via `<p>` element above the table (same visual pattern as `editError`); clears on cancel — review Minor (reliability / don't assume success)

## Disputed
None.

## Deferred
None.

## Verification
- `pnpm --filter @delucas/app typecheck` — PASS
- `pnpm --filter @delucas/app lint` — PASS
- All 113 tests pass (22 pnl + 21 db + 25 ingestion + 22 email + 23 dashboard)

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
# Fix Report — P3 Ingestion framework
**Date:** 2026-07-15
**Findings addressed:** 6 of 6: 0 QA failures + 6 review findings (2 Critical + 3 Important + 1 Minor)

## Changes Made
- `ingestion/llm.ts:65` — hoisted `new Anthropic({ timeout: 30_000 })` to module scope; removed per-call instantiation — review Critical + Minor 6
- `main.ts:307` — added `path.resolve()` + home-dir containment check on `ingestion:processPdf`; strips resolved path from forwarded error messages — review Critical
- `main.ts:282` — added `/^\d{4}-\d{2}-\d{2}$/.test(tx.date)` to `submitManual` validation block — review Important
- `main.ts:330` — added `/^\d{4}-\d{2}-\d{2}$/.test(tx.date)` to `confirmImport` validation block — review Important
- `ingestion/pdf.ts:39–65` — wrapped page-render block in `try/finally`; calls `pdfDocument.destroy()` in finally — review Important
- `ingestion/runner.ts:44–46` — added comment documenting that `failed` counts source-level errors, not per-transaction failures — review Important

## Disputed
None.

## Deferred
None.

## Verification
- `pnpm --filter @delucas/app typecheck` — PASS
- `pnpm --filter @delucas/app lint` — PASS
- All 68 tests pass (22 pnl + 21 db + 25 ingestion)
---
# Fix Report — P4 (Email / IMAP ingestion)
**Date:** 2026-07-15
**Findings addressed:** 8 of 8 review findings (0 QA failures + 8 review findings)

## Changes Made
- `imap.ts:136–145` — added `MAX_ATTACHMENT_BYTES` (20 MB); `streamToBuffer` tracks accumulated size, calls `destroy?.()`, rejects with logged error on overflow — review Critical
- `imap.ts:174` — added `MAX_BATCH_SIZE = 50`; loop breaks at `results.length >= MAX_BATCH_SIZE` so at most 50 unprocessed messages downloaded per run — review Critical
- `imap.ts:206–209` — download failure `catch` block now calls `recordProcessed(db, messageId)` to prevent infinite retry on permanently broken attachments — review Minor
- `main.ts:109` / `email.ts` — `getImapConfig` guards `parseInt` with `Number.isNaN`; calls `setEmailError("Invalid IMAP port in settings")` and returns null; `setEmailError()` exported from `email.ts` — review Important
- `email.ts:43–47` — added JSDoc on `emailStatus` documenting process-lifetime/reset-on-restart as intentional for v1 — review Important
- `main.ts:493–507` — moved startup ingestion block to after `createWindow()` (with `return` on window failure) so IMAP timeout no longer delays window open — review Important
- `vendor-mapping.ts:74–80` — added JSDoc on `resolveCategory` documenting first-match-wins and insertion-order control — review Minor
- `review-queue.ts:33–34` — added JSDoc on `queue` and `nextId` documenting in-memory-only, reset-on-restart as intentional for v1 — review Important / Minor

## Disputed
None.

## Deferred
None.

## Verification
- `pnpm --filter @delucas/app typecheck` — PASS
- `pnpm --filter @delucas/app lint` — PASS
- All 91 tests pass (22 pnl + 21 db + 25 ingestion + 22 email + 1 import-boundary)
---
