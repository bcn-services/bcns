# Review Report
**Date:** 2026-10-06
**Files Reviewed:** 13

REVIEW: 0C/0I/4M
**Branch:** feat/mcp-directory

## Findings

### Minor
Minor — platform/scripts/seed-demo-tenant.ts:7,260 — Nate re-seeds weeks later (for example before the ChatGPT submission): `daily_metrics` keys include `day`, so the earlier run's rows for days now outside the 60-day window stay. Those days then show sessions and ad spend with zero orders, and the header's "re-running yields the same row counts" holds only for the same base date — fix: in the same transaction, delete this tenant's `daily_metrics` rows older than the plan's first day, or pin `--base-date` in the Nate-only command.
Minor — platform/scripts/seed-demo-tenant.ts:309-321 — `createUser` succeeds, then the membership insert throws (for example DATABASE_URL and SUPABASE_URL point at different projects, which violates the `memberships.user_id` foreign key). The new password was never printed, and a re-run prints "unchanged" — fix: print the password right after `createUser`/`updateUserById`, or say in the error to re-run with `--reset-password`.
Minor — apps/web/CONTENT.md:1452-1453 — the cross-check rows for `pageMeta.connectSetup.*` point to the "Page Meta — connect, deluxe, aiConsulting" section, which never mentions `connectSetup` (no length or usage entry), so the docs drift — fix: add `pageMeta.connectSetup` to that section's heading and text.
Minor — apps/web/components/services/connect-setup.tsx:45-50 — the visible Eyebrow and the sr-only `<h2 id="setup-what">` carry the same text, so screen readers read "What this does" twice — fix: put `aria-hidden` on the Eyebrow, or style the h2 as the eyebrow.

## Probes run (clean)
- Seed schema: every column the script writes exists on data.money/customers/products/jobs/messages/records/daily_metrics. Each `on conflict` target matches a real unique key or primary key (`(client_id,source,external_id)` unique, daily_metrics primary key on 6 columns, ai_settings primary key `client_id`, memberships primary key `user_id`, clients `slug` unique). Omitted NOT NULL columns all have defaults. Every metric name is in the `metric_defs` seed. Every source is in the `data.source` enum. Mixed-key money rows (refund/payout) only drop nullable columns.
- Reviewer visibility: clients.status defaults to 'active', and `active_client_id()`/the JWT hook need only active status plus a membership. Item 1's grace/pause path needs `grace_until`, which the demo never gets. The MCP OAuth page signs in with a password (no mailbox needed). Redirect allow-list has claude.ai, claude.com and chatgpt.com.
- Prod safety: dry run opens no connection (mutation 2 confirmed by the orchestrator). The refusal runs inside the transaction before any table write, and its rollback is tested. The membership upsert runs only after the slug passed the demo-marker check, and keys on `reviewer+<slug>@bcn-services.com`, so it cannot move a real user. Nothing enumerates all clients in the worker or hub. Real row shapes match the connectors (refunds negative, `meeting_note`, `campaign`).
- MCP: `annotations.title` matches MCP ToolAnnotations (`title?: string`, already in AgentToolAnnotations). No consumer depends on the identity of the shared `TOOL_ANNOTATIONS` object. The list-time throw is caught before deploy by the CI apps test job.
- Web: no imports from apps/*, platform or packages/{data-client,tenant}. $200/month with no setup fee appears in body and meta. Legal lines 942-1019 are untouched. Sitemap and teaser are wired. Links use the focus-visible ring. The hub's sharing toggle that the copy mentions exists (apps/connect/app/access).
- Secrets: password is generated with randomBytes, logged once and never written. No credential literals.

## STANDARDS.md Updates
- Operator Scripts: importable `main(argv, deps)` with throwing `die()`; dry-run by default behind an `--apply` guard and a notes-marker refusal; passwords printed once.
- MCP Server: every tool needs a `TOOL_TITLES` entry (`mcpTools()` throws), and annotations are built per tool.
- Client-facing Copy: the jargon ban on the Connect setup page is test-enforced.
