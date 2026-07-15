# Engineer Report
**Task:** P1 — App scaffold: Electron + renderer/shell split for apps/delucas/
**Branch:** feat/delucas-p1-scaffold
**Date:** 2026-07-15

## Design Decisions

- **Two-config Vite strategy:** `vite.config.ts` (standalone renderer, port 3001) + `electron.vite.config.ts` (electron-vite wrapping main+preload+renderer) — separates browser-only dev from full Electron mode without duplicating build logic
- **Package name `@delucas/app`** (not `@bcns/delucas`) — task spec explicit; client-scoped namespace
- **Mock bridge install in `main.tsx`:** checks `window.bridge == null` before assigning `mockBridge` — idempotent, safe in both browser (mock) and Electron (preload populates first)
- **Import-boundary test as pure Node.js ESM script** — zero test-framework overhead; headlessly verifiable; scans renderer src for `from 'electron'`, `require('electron')`, `from 'node:*'`, `require('node:*')`
- **tsconfig.renderer.json extends `react-library.json`** — `composite: true` added for project references; `noEmit: true` inherited (typecheck only; build goes through Vite)
- **tsconfig.main.json overrides `module: CommonJS`, `moduleResolution: Node`** — required for Electron main; overrides `ESNext`/`Bundler` in base.json
- **ESLint flat config (`eslint.config.mjs`)** — matches apps/web pattern; .eslintrc.cjs would be silently ignored by ESLint 9 flat config mode
- **IPC channels use `namespace:method` pattern** (`db:query`, `dialog:openFile`) — prevents collisions as bridge grows; main-process stubs return safe zero-values for unimplemented phases
- **`@bcns/ui` resolved via `resolve.alias`** in both Vite configs — package has no build step; alias points to `packages/ui/src/index.ts`
- **Electron 29 chosen** — bundles Node 20, satisfies root `engines: node >=18.18.0` (Electron 28 bundles 18.17.1, misses by one patch)

## Files Changed

- `apps/delucas/package.json` — `@delucas/app` workspace package; scripts: dev/dev:electron/build/lint/typecheck/test/clean; electron 29, react 18, @bcns/ui, electron-vite
- `apps/delucas/README.md` — taxonomy frontmatter (`type: workflow-app`, `delivery: local-electron`), architecture overview, dev commands
- `apps/delucas/tsconfig.json` — project references to tsconfig.renderer.json + tsconfig.main.json
- `apps/delucas/tsconfig.renderer.json` — extends react-library.json; composite; includes renderer + bridge interface/mock
- `apps/delucas/tsconfig.main.json` — extends base.json; overrides module/moduleResolution for CJS; includes shell-electron + bridge interface/preload
- `apps/delucas/eslint.config.mjs` — spreads base from @bcns/config/eslint/base; ignores dist/node_modules
- `apps/delucas/vite.config.ts` — standalone renderer Vite config, port 3001, @bcns/ui alias
- `apps/delucas/electron.vite.config.ts` — electron-vite config for main+preload+renderer; externalizeDepsPlugin on main/preload
- `apps/delucas/tailwind.config.ts` — presets @bcns/config/tailwind; renderer + @bcns/ui content globs
- `apps/delucas/postcss.config.mjs` — tailwindcss + autoprefixer
- `apps/delucas/src/bridge/BridgeInterface.ts` — typed BridgeAPI (db/ingestion/dialog/settings) + Window augmentation; no impl, no forbidden imports
- `apps/delucas/src/bridge/mockBridge.ts` — browser-safe BridgeAPI stub; all methods warn+return safe defaults
- `apps/delucas/src/bridge/preload.ts` — contextBridge.exposeInMainWorld("bridge"); forwards each method to ipcRenderer.invoke()
- `apps/delucas/src/shell-electron/main.ts` — BrowserWindow creation; ipcMain handlers for all four namespaces; dialog fully implemented, others are stubs
- `apps/delucas/src/renderer/index.html` — HTML entry point
- `apps/delucas/src/renderer/main.tsx` — React root; installs mockBridge if window.bridge is null
- `apps/delucas/src/renderer/App.tsx` — basic app shell, routing placeholder
- `apps/delucas/src/renderer/index.css` — Tailwind directives
- `apps/delucas/tests/import-boundary.test.mjs` — pure Node.js ESM static analysis; exits 1 on any renderer import from electron/node:*
- `pnpm-lock.yaml` — updated with electron 29, electron-vite, vite, @vitejs/plugin-react

## Deferred / Out of Scope

- `better-sqlite3` + `imapflow` not installed — P2 (db) and P3/P4 (ingestion) will add them; `electron-rebuild` for native addon ABI deferred until then
- `react-router-dom` routing — App.tsx has placeholder comment; P2+ will add routes
- `electron-builder` packaging config — not needed for dev/scaffold; deferred to ship phase

## Flags for Reviewer

- electron-vite outputs renderer to `apps/delucas/dist/renderer/` — Turbo build output glob is `dist/**`, which covers it; verify caching works correctly across runs
- `tsconfig.main.json` has `noEmit: false` + `composite: true` — `tsc -p tsconfig.json` will emit .js into `dist/main/` during project-reference typecheck; `dist/` should be in .gitignore (not checked)
