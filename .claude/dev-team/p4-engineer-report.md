# Engineer Report — P4: IMAP Email Ingestion
**Branch:** feat/delucas-p1-scaffold
**Commit:** 3e41dbe
**Date:** 2026-07-15

## Status: DONE

## Verification
- `pnpm test` (apps/delucas): 90 total, 0 failed (22 new in email.test.mjs)
- `pnpm lint`: clean
- `pnpm typecheck`: clean
- `pnpm build`: green (main 38 kB, preload 2 kB, renderer 219 kB)

## Files Created
- `apps/delucas/src/shell-electron/ingestion/imap.ts` — IMAP connection manager; `fetchUnprocessedEmails` with `ImapFlowFactory` DI param
- `apps/delucas/src/shell-electron/ingestion/sources/email.ts` — `EmailSource` implementing `IngestionSource`; DI params: `imapFactory`, `mockLlm`, `pdfConverter`, `reviewEnqueuer`
- `apps/delucas/src/shell-electron/ingestion/vendor-mapping.ts` — `loadVendorMap`, `saveVendorMap`, `resolveCategory` (substring, case-insensitive, default "other")
- `apps/delucas/src/shell-electron/ingestion/review-queue.ts` — In-memory queue: `enqueueReviewItem`, `getReviewQueue`, `clearReviewItem`, `clearAllReviewItems`
- `apps/delucas/src/renderer/components/EmailStatusBanner.tsx` — Error banner from `ingestion:getEmailStatus`
- `apps/delucas/src/renderer/components/CheckNowButton.tsx` — Triggers `ingestion:runSources`
- `apps/delucas/src/renderer/components/ReviewQueue.tsx` — Renders review items as `ConfirmCard`s
- `apps/delucas/tests/email.test.mjs` — 22 tests, zero live network calls

## Files Modified
- `apps/delucas/src/bridge/BridgeInterface.ts` — Added `EmailStatusBridge`, `ReviewItemBridge`, `VendorMapBridge` types; 3 new ingestion methods: `getEmailStatus`, `getReviewQueue`, `clearReviewItem`
- `apps/delucas/src/bridge/preload.ts` — 3 new IPC channel forwarding calls
- `apps/delucas/src/bridge/mockBridge.ts` — Stubs for 3 new ingestion methods
- `apps/delucas/src/shell-electron/main.ts` — `EmailSource` wired at startup + in `runSources`; `getImapConfig` reads from settings table; 3 new IPC handlers; `settings:set` extended to accept objects (JSON for vendor map)
- `apps/delucas/src/shell-electron/ingestion/pdf.ts` — Extracted `renderPdfUint8Array` helper; added `pdfBufferToBase64` (Buffer → base64, used by email path)
- `apps/delucas/eslint.config.mjs` — Added `.mjs` override for `argsIgnorePattern: "^_"`
- `apps/delucas/package.json` — Added `imapflow ^1.4.7`; test script includes `email.test.mjs`

## Key Design Decisions

**imapflow is CJS, not ESM.** Team memory said "dynamic import required." The package has no `"type": "module"` and its `lib/imap-flow.js` is `'use strict'` CJS. Used direct `require('imapflow')` wrapped in `defaultImapFactory`. The factory pattern still provides DI for tests.

**DI over mocking.** Four injectable seams in `EmailSource`: `imapFactory`, `mockLlm`, `pdfConverter`, `reviewEnqueuer`. The last two were added after discovering that tsx compiles `.ts` imports from `.mjs` test files as separate CJS module instances — the `review-queue` singleton is not shared across the boundary. The `reviewEnqueuer` DI param resolves this cleanly without restructuring the module.

**IMAP config via settings table.** Keys `imap_host`, `imap_user`, `imap_password`, `imap_port`, `imap_secure`. Defaults: port 993, secure true. `getImapConfig(db)` returns null (no-op) if any of host/user/password is missing.

**Startup ingestion.** `EmailSource` runs on `app.whenReady()` best-effort (errors logged, not re-thrown). The same source instance is reused by `ingestion:runSources` IPC handler.

**Vendor map stored as JSON string in settings table.** The `settings:set` handler was extended to accept objects (JSON-serialized). The `vendor_category_map` key holds `{"napoli": "food", "foxon": "beverage", ...}`. Invalid entries (unknown category values) are silently filtered at load time.

## Flags for Reviewer
- `settings:set` now accepts objects — expands the attack surface slightly at the IPC boundary. The value is stored as `JSON.stringify(value)` which is safe; no eval or dynamic execution.
- `clearAllReviewItems` is exported for test teardown only. It should not be called from production code.
- The startup ingestion run fires before the window is created — if it takes a long time (slow IMAP) it could delay the UI slightly. A timer-based deferred run could help in future.
