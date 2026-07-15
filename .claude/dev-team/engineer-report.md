# Engineer Report
**Task:** P2 — SQLite schema, P&L module, recurring materializer, typed IPC handlers
**Branch:** feat/delucas-p1-scaffold
**Date:** 2026-07-15

## Design Decisions
- `src/shared/` boundary: `types.ts` and `pnl.ts` have zero Node/Electron imports — importable from renderer, shell, and headless tests; no boundary violation possible
- `day_of_month BETWEEN 1 AND 28` in schema: caps day to the safest universal value (Feb always has ≥28 days), avoiding leap-year/month-end edge cases in recurring materialization
- `amount_cents INTEGER` + `direction TEXT` instead of signed amount: keeps constraint logic explicit; direction is always `revenue|expense`, never inferred from sign
- ISO 8601 date strings (`YYYY-MM-DD`) in SQLite: month bucketing is a pure `str.slice(0,7)` — no Date parsing, no TZ risk
- `source_ref = "recurring:<ruleId>:<YYYY-MM>"` for idempotency: existence check on `(source = 'recurring', source_ref = ?)` before each insert; running materializer twice creates zero duplicates
- `db.pragma("journal_mode = WAL")` on startup: safe for single-process Electron; improves read concurrency if background workers are added later
- `db:query` channel restricted to SELECT-only: prevents generic SQL write injection via renderer; typed IPC handlers (`db:insertTransaction`, etc.) are the correct write path
- `tsx` for tests: `--experimental-strip-types` fails on extensionless CJS→ESM cross-boundary imports; `tsx` handles it transparently with no tsconfig changes needed
- `better-sqlite3` compiled against system Node 22 (not Electron ABI): acceptable for dev; production packaging will need `electron-rebuild` — flagged below

## Files Changed
- `src/shared/types.ts` — all domain types: Transaction, RecurringRule, MonthPnl, CategoryBreakdown, NewTransaction, etc.
- `src/shared/pnl.ts` — bucketByMonth, computeMonthPnl, compute12MonthSeries, generateSummary; pure functions, no side effects
- `src/shell-electron/db/schema.ts` — MIGRATIONS array with full DDL for all 4 tables + indexes
- `src/shell-electron/db/migrations.ts` — schema_migrations tracking table; idempotent apply loop with per-migration transactions
- `src/shell-electron/db/queries.ts` — typed getTransactions, getTransactionsByMonth, insertTransaction, getRecurringRules, isEmailProcessed, markEmailProcessed, getSetting, setSetting
- `src/shell-electron/recurring.ts` — materializeRecurring: walks rule date range, deduplicates via source_ref EXISTS check
- `src/shell-electron/main.ts` — real DB init + WAL pragma + startup materialization; 12 typed ipcMain handlers replacing P1 stubs
- `src/bridge/BridgeInterface.ts` — expanded BridgeAPI with all 10 typed db methods; imports shared types
- `src/bridge/preload.ts` — forwarding stubs for all new ipcRenderer.invoke channels
- `src/bridge/mockBridge.ts` — no-op stubs for all new BridgeAPI methods (was causing renderer typecheck failure)
- `tsconfig.main.json` — added `src/shared/**/*` to include
- `tsconfig.renderer.json` — added `src/shared/**/*` to include
- `package.json` — added better-sqlite3, @types/better-sqlite3, tsx devDep; updated test script
- `tests/pnl.test.mjs` — 22 unit tests: bucketByMonth (4), computeMonthPnl (7), compute12MonthSeries (6), generateSummary (5)
- `tests/db.test.mjs` — 21 unit tests: migrations (3), queries (4), email dedup (3), settings (3), recurring materializer (8)

## Deferred / Out of Scope
- Electron ABI rebuild for better-sqlite3: compiles against system Node 22 now; `electron-rebuild` or `@electron/rebuild` needed in the packaging step (P6/deploy phase)
- `getRecurringRules` query is exposed via IPC but not yet used by the renderer — placeholder for P5 settings UI
- No `INSERT INTO recurring_rules` query helper — rules currently inserted only via test SQL; add when P5 adds a rule-management UI

## Flags for Reviewer
- `better-sqlite3` native addon: if the Electron build ever packages with `asar`, the `.node` file must be excluded or prebuild-unpacked — standard Electron packaging concern
- `materializeRecurring` on every startup: O(rules × months) but trivially fast for <100 rules; no pagination needed at this scale
- `db:query` SELECT-only guard is a string prefix check (`trimStart().toUpperCase().startsWith("SELECT")`) — acceptable for a single-user local app, but not SQL injection-proof for adversarial input; satisfactory given renderer sandbox + no network exposure
- `getTransactions` returns all rows with no pagination: will grow unbounded; QA/P5 should add a date-range param before the 12-month series call loads full history
