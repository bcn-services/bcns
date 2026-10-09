REVIEW: 0C/1I/2M
# Review Report
**Date:** 2026-10-08
**Files Reviewed:** 7

## Findings

### Important
Important — apps/connect/lib/first-run.ts:62-63 — `syncDone = aiDone || ...` / `sourceDone = syncDone || ...` ticks "Connect a source" and "Get your first data in" for any owner whose workspace has one MCP tool call, but apps/mcp/src/mcp.ts:213-217 logs a row for every call, failed and unknown-tool calls included, so it proves nothing about a source. Prod example: bcns-oauth-test has 11 mcp_tool_calls and zero connector_health rows, so its owner now sees source ✓ and sync ✓ with no connected card. Any owner who sets up /access before connecting a source sees the same. Also, mcp_tool_calls is not in scope.ts DATA_TABLES, so it survives shop/redact. If a reset tenant has fewer than 4 steps done, its owner now sees "Get your first data in ✓" right after reconnecting, before the first sync. The code comment "the question was asked about synced data" is false. — Fix: keep the step ticks truthful (`syncDone` = a hub health row with last_success_at only; `sourceDone = syncDone || any connected card`) and move the monotonic rule into visibility: `visible: input.role === "owner" && !allDone && !(aiDone && teamDone)`. The disconnect test still passes. Flip `asked.source` / `asked.sync` in the "monotonic" test to false.

### Minor
Minor — apps/connect/lib/data-stats.ts:56 — `quickbooks/expenses` becomes a default pin. It renders as "Expenses, 30 days" with a bare count ("42") next to the money stats "Revenue, 30 days $…" and "Ad spend, 30 days $…", so a QuickBooks owner reads it as $42 of expenses. There are no QuickBooks tenants in prod yet. — Fix: drop `quickbooks/expenses` from defaults, extend the comment ("QuickBooks: only a row count, which reads as a money total"), and update the two data.test.mjs assertions.
Minor — apps/connect/app/access/copy-url.tsx:21 — The accessible name "Copy the workspace address" does not contain the visible label "Copy address" (WCAG 2.5.3 Label in Name), so a voice-control user who says "click Copy address" can miss the button. No double announcement: the role="status" span is empty except on failure. — Fix: `aria-label={state === "copied" ? "Copied workspace address" : "Copy address of this workspace"}`.

## STANDARDS.md Updates
- Connect Hub: "Money is always stored x100" (formatters divide by 10**(minorDigits ?? 2); the currency only sets the output digits).
- Connect Hub: "Which rows survive a disconnect" (connector_health is deleted on disconnect and redact; mcp_tool_calls survives and is logged for every call, so it is no evidence of a source or synced data).
