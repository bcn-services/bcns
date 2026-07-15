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

---

# Engineer Report — P3
**Task:** P3 — Ingestion framework, manual/recurring/drag-and-drop sources, LLM extraction
**Branch:** feat/delucas-p1-scaffold
**Date:** 2026-07-15

## Design Decisions
- `NormalizedTransaction = NewTransaction` alias — same shape, no duplication; `IngestionSource` and `IngestionRunReport` live in `src/shell-electron/ingestion/types.ts` (not shared, since they belong to main-process context)
- Runner holds last-run report in module-level memory (not SQLite) — simple, sufficient for single-window desktop app; loses state on restart (acceptable, UI shows "no data yet")
- `ManualSource` and `DragDropSource` are single-shot singletons: `stage(tx)` then next `pull()` yields and clears; safe because IPC is sequential and one transaction at a time
- `RecurringSource` returns `[]` — `materializeRecurring` is idempotent and owns its writes; returning those rows would risk double-counting in `found/imported` stats
- `null source_ref` on manual entries intentionally skips dedup — each manual submission is explicit user intent, not a dedup-able document
- PDF-to-image: `pdfjs-dist` (ESM v4) + `@napi-rs/canvas` (ships ARM64 macOS prebuilts, no pkg-config) — rejected `canvas@2.11.2` (requires pixman/Cairo native build, fails without pkg-config on dev machine)
- LLM: `@anthropic-ai/sdk` with `claude-3-5-sonnet-latest`, strict JSON validation in `validateLLMResult()`, mock bypass via `mock?` param — zero live API in tests
- Bridge mirror types (`LLMExtractResultBridge`, `IngestionRunReportBridge`) in `BridgeInterface.ts` — duplicate of main-process types but import-safe for renderer (no node:* deps)
- IPC validation: all ingestion handlers validate at the boundary consistent with existing `db:insertTransaction` pattern

## Files Changed
- `src/shell-electron/ingestion/types.ts` — `NormalizedTransaction`, `IngestionSource`, `IngestionRunReport` types
- `src/shell-electron/ingestion/runner.ts` — source executor, dedup by source_ref, in-memory last-run report
- `src/shell-electron/ingestion/sources/manual.ts` — single-shot manual entry source
- `src/shell-electron/ingestion/sources/recurring.ts` — wraps `materializeRecurring()` as IngestionSource
- `src/shell-electron/ingestion/sources/dragdrop.ts` — single-shot drag-and-drop source
- `src/shell-electron/ingestion/llm.ts` — Anthropic SDK extraction, `LLMExtractResult`, strict JSON validation, mock bypass
- `src/shell-electron/ingestion/pdf.ts` — PDF-first-page-to-base64 via pdfjs-dist + @napi-rs/canvas
- `src/shell-electron/db/queries.ts` — added `getTransactionBySourceRef(db, sourceRef)` for runner dedup
- `src/shell-electron/main.ts` — singleton source instances; 5 new IPC handlers; all ingestion imports
- `src/bridge/BridgeInterface.ts` — added bridge mirror types; expanded `ingestion` namespace with 5 new methods
- `src/bridge/preload.ts` — wired 5 new ingestion methods via `ipcRenderer.invoke`
- `src/bridge/mockBridge.ts` — mock stubs for 5 new ingestion methods
- `src/renderer/components/ManualEntryForm.tsx` — plain-English entry form with direction toggle, date, amount, vendor, category
- `src/renderer/components/ConfirmCard.tsx` — editable LLM-result review card with approve/reject
- `src/renderer/components/DragDropZone.tsx` — drop zone + browse; calls processPdf; shows ConfirmCard; falls back on LLM error
- `src/renderer/components/IngestionStrip.tsx` — "Since last sync" status strip, fetches getLastRunReport on mount
- `package.json` — added `@anthropic-ai/sdk`, `@napi-rs/canvas`, `pdfjs-dist`; updated test script
- `tests/ingestion.test.mjs` — 19 unit tests: runner dedup, source normalization, LLM mock/null/bypass

## Deferred / Out of Scope
- Renderer components not wired to App.tsx routing — P5 will compose the dashboard
- `IngestionStrip` will be placed in P5 dashboard header
- PDF pipeline integration-tested via Electron dev mode only; no fixture PDF in tests (avoids real client docs)
- LLM malformed-JSON path not unit-tested via real SDK response — mock bypass is the test seam; testing the real path requires either a live API call or deeply mocked SDK internals

## Flags for Reviewer
- `pdfFirstPageToBase64` uses `import("pdfjs-dist")` dynamic ESM — verify electron-vite's main bundle handles this correctly or add it to `external` in `electron-vite.config.ts`
- `@napi-rs/canvas` is a native addon — must be in `external` list for electron-vite main build to avoid bundling failure
- `ingestion:runSources` computes `currentMonth` at call time — will lag at month rollover if app runs for many days; consider computing in `app.whenReady` and updating on a daily timer
- Runner `found` count excludes recurring transactions (RecurringSource returns `[]`) — IngestionStrip will show `found=0` for recurring-only runs; consider a note in the strip label
