# Engineer Report
**Task:** P6 — Settings, backup, first-run, and electron-builder config
**Branch:** feat/delucas-p1-scaffold
**Date:** 2026-07-15

## Design Decisions
- **backup.ts — pure/injectable:** All backup functions take injected `getSetting`/`setSetting` callbacks and optional `today` override — no module-level singletons — so every boundary is unit-testable without Electron or real FS state
- **Backup status in-memory:** `backupStatus` object in `backup.ts`, reset on each run, returned via `backup:getStatus` IPC — no DB persistence needed for dashboard display
- **`dailyTrigger` idempotency:** Compares `last_backup_date` setting to today's string; updates setting only after successful copy — no infinite retry on bad folder
- **quitBackup synchronous:** Uses `fs.copyFileSync` in `app.on('before-quit')` — no async race, safe with better-sqlite3's sync API
- **Rotation — alphabetical = chronological:** ISO date in filename means `sort()` gives oldest-first; `slice(0, len - 30)` selects the oldest to delete — no date parsing needed
- **HeadlineNumbers empty-state gate:** Checks `transactionCount === 0 && all values 0` — distinct from the loading skeleton (pnl === null branch)
- **BannerList refactored:** `SingleBanner` sub-component handles per-banner dismiss; `backupError` prop added alongside existing `emailStatus` — backward compatible
- **electron-builder files override:** Default behavior silently excludes `dist/`; overridden with `!**/*` first + explicit `dist/main/**`, `dist/preload/**`, `dist/renderer/**` — verified asar contains only built files and `package.json`
- **`electron` moved to devDependencies:** electron-builder enforces this; unblocked packaging
- **`package.json` main entry fixed:** Was `dist/main/main.js`; electron-vite outputs `dist/main/index.js`
- **Vendor→category map as JSON string:** Settings table is TEXT; map is `JSON.stringify`'d before `settings:set` and `JSON.parse`'d on read

## Files Changed
- `apps/delucas/src/shell-electron/backup.ts` — new: copyToBackupFolder, rotateOld, dailyTrigger, quitBackup, getBackupStatus, buildBackupDeps
- `apps/delucas/src/shell-electron/main.ts` — adds dailyTrigger on app ready, before-quit handler, backup:getStatus + backup:triggerNow IPC handlers
- `apps/delucas/src/bridge/BridgeInterface.ts` — adds `backup: { getStatus, triggerNow }` to BridgeAPI
- `apps/delucas/src/bridge/preload.ts` — wires backup IPC via ipcRenderer.invoke
- `apps/delucas/src/bridge/mockBridge.ts` — no-op backup stubs for browser dev mode
- `apps/delucas/src/renderer/components/EmptyState.tsx` — new: friendly first-run placeholder
- `apps/delucas/src/renderer/components/HeadlineNumbers.tsx` — adds `transactionCount` prop + EmptyState branch
- `apps/delucas/src/renderer/components/BannerList.tsx` — SingleBanner refactor + backupError prop
- `apps/delucas/src/renderer/pages/Dashboard.tsx` — fetches backup status; passes backupError + transactionCount; shows subtle last-backup date
- `apps/delucas/src/renderer/pages/Settings.tsx` — new: Settings screen (Email/AI/Backup/VendorMap sections)
- `apps/delucas/src/renderer/App.tsx` — adds Settings as third tab
- `apps/delucas/electron-builder.config.mjs` — new: unsigned Mac DMG + Windows NSIS config
- `apps/delucas/package.json` — adds `package` script; moves `electron` to devDeps; fixes `main` entry; adds electron-builder devDep
- `apps/delucas/tests/backup.test.mjs` — new: 10 unit tests (rotation 30-cap, copy, dailyTrigger skip/run/silent, quitBackup)
- `apps/delucas/tests/settings.test.mjs` — new: 10 round-trip tests for all P6 settings keys + JSON vendor map

## Deferred / Out of Scope
- Windows NSIS artifact: requires Windows runner; config is wired, will produce on Windows CI — only Mac DMG verified on macOS
- App icon: electron-builder warns "default Electron icon" — no icon asset in P6 scope
- `description`/`author` in package.json: electron-builder warns — not required for dev handoff

## Flags for Reviewer
- `before-quit` backup: very large DBs (>100 MB) could slow quit — acceptable for a pizza-shop DB; `copyFileSync` is still sync so no async race
- `!**/*` files override in electron-builder config: if a new build artifact dir is added outside `dist/`, it will be excluded — intentional, document in STANDARDS
- `electron` native module rebuild: running `pnpm package` rebuilds better-sqlite3 for Electron's Node version; tests require rebuild for system Node afterward (`npm rebuild better-sqlite3` from app dir) — add note to STANDARDS.md
