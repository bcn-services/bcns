---
type: workflow-app
delivery: local-electron
client: DeLuca's
status: scaffold
---

# DeLuca's — Desktop App

Local-first Electron desktop application for DeLuca's restaurant management.

## Architecture

```
src/
  bridge/
    BridgeInterface.ts   # Typed API contract (renderer ↔ shell)
    mockBridge.ts        # Browser-safe mock for pnpm dev
    preload.ts           # Electron contextBridge implementation
  shell-electron/
    main.ts              # Electron main process
  renderer/
    index.html           # HTML entry point
    main.tsx             # React root
    App.tsx              # App shell
```

## Dev Commands

```bash
pnpm dev            # Renderer only in browser at http://localhost:3001 (mock bridge)
pnpm dev:electron   # Full Electron app (real shell + renderer)
pnpm build          # Production build
pnpm lint           # ESLint
pnpm typecheck      # TypeScript checks
```

## IPC Bridge

The `BridgeInterface` defines every capability the renderer may call on the shell.
Renderer code must only access shell capabilities via `window.bridge` — never import
from `electron` or `node:*` directly.

In browser dev mode, `window.bridge` is populated by `mockBridge.ts`.
In Electron, `preload.ts` exposes real implementations via `contextBridge`.
