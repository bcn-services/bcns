---
# Fix Report — C1: Price string formatting
**Date:** 2026-07-15
**Branch:** worktree-agent-afb098493a86a56c1
**Files changed:** apps/web/lib/content.ts, apps/web/CONTENT.md, PLAN.md
**Findings addressed:** 1 of 1: 1 QA bug (C5)

## Changes Made

- `apps/web/lib/content.ts:314` — `pricing.tiers[0].price` `"$2,000–5,000"` → `"$2,000–$5,000"` — QA bug C5
- `apps/web/lib/content.ts:326` — `pricing.tiers[1].price` `"$5,000–15,000"` → `"$5,000–$15,000"` — QA bug C5
- `apps/web/CONTENT.md:529` — "Currently" description updated to `$2,000–$5,000` to keep files in sync — QA bug C5
- `apps/web/CONTENT.md:559` — "Currently" description updated to `$5,000–$15,000` to keep files in sync — QA bug C5
- `PLAN.md:160` — Card 1 price reference updated to `$2,000–$5,000` to keep files in sync — QA bug C5
- `PLAN.md:161` — Card 2 price reference updated to `$5,000–$15,000` to keep files in sync — QA bug C5

**FAQ pricing text verified:** content.ts:358 uses "to" not en-dash ranges — no $ issue; text matches brief exactly.

**Build:** `pnpm lint && pnpm typecheck && pnpm build` — all green.

## Disputed

None.

## Deferred

None.
---
