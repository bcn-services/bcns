---
paths:
  - "platform/worker/src/**/*.ts"
  - "apps/connect/lib/sources.ts"
  - "apps/connect/lib/source-settings.ts"
  - "apps/connect/app/sources/**/*.tsx"
---

# Connector health

- `connector_health` rows are written by the worker's `computeHealth` (`platform/worker/src/health.ts`) and by `data.*` connect/disconnect functions (e.g. `data.attach_source` seeds `never_ran`). Never by hub code.
- The hub (`apps/connect`) reads health through the `api` views and cannot read `data.source_tokens`, so tokens are unreachable from `api`.
- A fix that must "derive state from tokens" lives in a `data.*` function (a migration under `platform/supabase/migrations/`) or in the worker, never in hub code.
