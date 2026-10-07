REVIEW: 0C/0I/5M
**Branch:** feat/hub-first-run
# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 13

## Findings

### Minor
Minor — platform/test/tenant.test.ts:23 (with helpers.ts:148) — `ai_last_used_at` is `expect: 'none'` and returns a timestamp string once acme has any `data.mcp_tool_calls` row; the loop pushes it into `acmeCreated` and the cleanup `$2::uuid[]` throws 22P02. It is safe today only because `ai_` sorts before `log_mcp_call` and the cleanup deletes the rows. A local re-run after a mid-loop failure (cleanup skipped), or a future acme seed row, turns the test red with a misleading uuid error — fix: push only uuid-shaped strings (`/^[0-9a-f-]{36}$/`), or skip the push for this fn.
Minor — apps/connect/app/access/page.tsx:19-23 — `health.error` is ignored, so a failed read of connector_health_v1 shows an owner whose sources are connected "Connect a source on the Sources page…" — fix: when `health.error` is set, show "Couldn't load your sources right now" instead of the empty-state line.
Minor — apps/connect/lib/first-run.ts:59,68 — visibility depends on live state only, so the checklist comes back after all four steps are done when one reverses. Example: an established owner removes their only teammate, or disconnects their only source, and the hub shows "Get started 3 of 4" again. Fix: accept and say so in the PR body, or hide for good once all four have been done (needs a stored marker, so it is out of scope here).
Minor — apps/connect/lib/first-run.ts:64 — the "Get your first data in" hint says "This happens on its own within the hour" even when the only connected source's first run failed (status error, last_success_at null), so the owner is told to wait for something that won't happen — fix: when a connected card has tone error, change the hint to "A source needs attention, see its card."
Minor — apps/connect/app/access/copy-url.tsx:21-26 — a successful copy is never announced to screen readers: the role=status span is only filled on failure, and a change to the button label is not announced. "Copied" also never resets — fix: put "Copied" in the status span (keep the destructive colour for failure only), and go back to idle after about 2 s.

## Verified clean (no finding)
- Migration matches `get_ai_settings` exactly: security definer, `search_path = ''`, `data.tenant_or_raise()`, revoke from public/anon/service_role, grant to authenticated. Prediction for the CI catalog/tenant tests: `function_privileges`, `function_search_path_pinned`, `no_claim_zero_rows` (BCNS0) and `rpc_every_write_scoped` (RPC_ARGS entry present) all pass.
- The data-client RPC_NAMES and database.types (`Args: never`) entries agree. After a data-client build, `tsc --noEmit` passes for apps/sb and apps/_template. apps/mcp passes no rpcs to the AI, so this function is not reachable by the AI.
- The `memberships_v1` view is security_invoker over the `tenant` select policy, so an owner sees every membership row in their tenant. Members skip both extra reads.
- Prod (aggregate SELECT): no user is a non-smoke member of more than one tenant, so the team step cannot tick on its own. Smoke rows are excluded.
- Every starter question can be answered from synced fields. QuickBooks vendor and account come from `records_v1.attributes`, which MCP keeps. For Shopify: refund and payout kinds, and `products_v1.inventory_quantity`. For Meta: `insight_ad_day` clicks. For Monday: owner, priority, due_on.
- Connect tests run 326/0 and first-run.test.mjs is in the test list. QA's mutations went RED. Off-limits files (layout.tsx, pending/*, data-views.ts, connectors) are untouched. No new code reads source_tokens. The copy has no jargon.

## STANDARDS.md Updates
none (caller instructed: edit nothing). Proposed: "A new api RPC needs entries in packages/data-client RPC_NAMES + database.types.ts and platform/test/helpers.ts RPC_ARGS; a non-uuid string return under expect 'none' must not reach tenant.test's acmeCreated cleanup."
