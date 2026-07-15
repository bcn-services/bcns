# Engineer Report
**Task:** P5 — Dashboard (product) for DeLuca's pizza app
**Branch:** feat/delucas-p1-scaffold
**Date:** 2026-07-15

## Design Decisions

- **Two-tab routing via useState** — no react-router; two-screen app doesn't justify the dependency; `Tab = "dashboard" | "addfix"` enum in App.tsx is the entire routing layer
- **Custom SVG bar chart (ProfitBarChart)** — recharts skipped; 12-bar profit chart is simple enough that a 60-line SVG component avoids a ~150 kB dependency; zero-line centered, green/red per profit sign, month labels on x-axis
- **useDashboardData batches 4 bridge calls in one Promise.all** — getMonthPnl + get12MonthSeries + getTransactionsForMonth + getSummary all fire together; `refresh()` increments a `tick` counter to re-run the effect after mutations
- **useIngestionState polls every 30 s** — matches expected email check cadence for a pizza business; same interval as existing EmailStatusBanner
- **BannerList uses dismissed-error string tracking** — dismissing stores the exact error string; if the error text changes or recurs after clearing, banner re-appears automatically; never permanently suppressed while broken
- **TransactionList inline edit in same table row** — EditRow renders as colspan=5 `<tr>`; no modal needed; saves round-trips and keeps context
- **RentRuleEditor uses shared RuleForm** — add and edit both use the same RuleForm component with different initial state and submitLabel; zero logic duplication
- **All 6 new IPC handlers validate at the boundary** — same pattern as P2/P3: typed checks before SQLite; updateTransaction/deleteTransaction return `{ok, error}` consistent with insertTransaction
- **getTransactionsForMonth is a semantic alias** — forwards to getTransactionsByMonth in main.ts; BridgeInterface exposes the task-spec name while avoiding code duplication

## Files Changed

- `src/bridge/BridgeInterface.ts` — MutationResult, TransactionUpdatesInput, RecurringRuleUpdates types; 6 new db: method signatures
- `src/bridge/mockBridge.ts` — no-op stubs for all 6 new bridge methods
- `src/bridge/preload.ts` — wired all 6 new methods to ipcRenderer.invoke
- `src/shell-electron/db/queries.ts` — updateTransaction, deleteTransaction, insertRecurringRule, updateRecurringRule, deleteRecurringRule functions
- `src/shell-electron/main.ts` — 6 IPC handlers with full input validation
- `src/renderer/App.tsx` — two-tab shell replacing P1 placeholder
- `src/renderer/hooks/useDashboardData.ts` — 4-call Promise.all + refresh tick
- `src/renderer/hooks/useIngestionState.ts` — 3-call Promise.all + 30 s poll
- `src/renderer/pages/Dashboard.tsx` — assembles BannerList + MonthNav + HeadlineNumbers + ProfitBarChart + CategoryBars + IngestionStrip
- `src/renderer/pages/AddFix.tsx` — assembles ManualEntryForm + DragDropZone + ReviewQueue + TransactionList + RentRuleEditor + MonthNav
- `src/renderer/components/HeadlineNumbers.tsx` — Revenue/Expenses/Profit stat cards + summary sentence
- `src/renderer/components/ProfitBarChart.tsx` — custom SVG 12-month profit chart
- `src/renderer/components/CategoryBars.tsx` — horizontal bars per expense category
- `src/renderer/components/BannerList.tsx` — dismissible email error banner that re-appears while broken
- `src/renderer/components/TransactionList.tsx` — table with inline edit (EditRow) and delete (confirm in-row)
- `src/renderer/components/MonthNav.tsx` — prev/next month buttons; Next disabled at current month
- `src/renderer/components/RentRuleEditor.tsx` — full CRUD for recurring rules via shared RuleForm component
- `apps/delucas/package.json` — dashboard.test.mjs added to test script
- `tests/dashboard.test.mjs` — 23 behavioral checks (23/23 pass); full suite 113/113

## Deferred / Out of Scope

- Dashboard and AddFix each maintain independent `currentMonth` state — sharing would require lifting to App.tsx; task spec doesn't require it
- ProfitBarChart has no tooltip on hover — plain functional styling only per guardrail
- No loading skeleton beyond "—" placeholder in HeadlineNumbers

## Flags for Reviewer

- `updateTransaction` in queries.ts builds SET clause from Object.keys of the validated update object — keys come from a typed interface, not raw renderer input, so no injection risk, but worth a review pass
- `getTransactionsForMonth` IPC handler returns `{ok, error}` on validation failure rather than throwing — inconsistent with `getTransactionsByMonth` which throws; no runtime impact since the renderer hook treats the response as a typed array, but QA may flag it
- RentRuleEditor re-fetches rules after each CRUD operation but not on a poll interval — background recurring materializer changes won't appear until next user interaction
