---
paths:
  - "platform/scripts/gcp-setup.sh"
  - "platform/test/**"
  - "apps/*/tests/**"
  - "apps/web/__tests__/**"
---

# gcp-setup.sh and test runs

- `platform/scripts/gcp-setup.sh`: Cloud Run job env and secrets are create-time only; deploy-worker's `jobs update` never touches them.
- A new job var needs its own opt-in `--update-*` step (like step 6b, QuickBooks). Never `--set-*` on a live job.
- A step that needs a not-yet-existing secret sits behind an exists-check and skips with a message.
- A test that spawns a nested vitest runs `process.execPath` with `node_modules/vitest/vitest.mjs`, not bare `pnpm` (the child has no corepack). Example: `platform/test/qa-drive-storage-cleanup.test.ts`.
