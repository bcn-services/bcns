---
paths:
  - "apps/hq/lib/tasks.ts"
  - "apps/hq/lib/ops.ts"
  - "apps/hq/lib/fires*.ts"
  - "apps/hq/jobs/tickets.mjs"
  - "apps/hq/components/TodayNate.tsx"
---

# HQ alert keys

- A fire key and the `tasks.alert_key` it dedupes against are one contract. Platform ticket fires are `ops:ticket:<id>`; the task the job and `createOpsTask` write is `ticket:platform:<id>` (TA: `ticket:ta:<id>`). The mapping lives in `createOpsTask` (`lib/tasks.ts`) and the Today matcher (`TodayNate.tsx`): change both or neither.
- Dedupe is against the newest task for the key, not only open ones: a done `ticket:*` task is returned, never re-spawned, until the source ticket is updated after `synced_at`.
- Adding a fire kind means adding its key shape here and a test that the Today matcher hides the fire once a task exists.
