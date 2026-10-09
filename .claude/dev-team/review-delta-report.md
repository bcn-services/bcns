REVIEW: 0C/0I/1M
# Review Delta Report — Item A (apps/connect polish), fix round f084396..2ab399e
**Date:** 2026-10-08 · **Files Reviewed:** 5 (fix round), 7 (whole item 6013ef2..2ab399e)

## Prior findings
- Important (first-run ticks) — resolved: first-run.ts:60-61 ticks source/sync from health rows only; an AI call ticks neither; comments are true; tests flipped as prescribed, none deleted or weakened (the disconnect test now asserts all four ticks plus visible).
- Minor (quickbooks/expenses default pin) — resolved: data-stats.ts:57, data.test.mjs:551.
- Minor (aria-label) — resolved: copy-url.tsx:21; both names contain the visible text.

## Findings
Minor — apps/connect/lib/first-run.ts:76 — `!(aiDone && teamDone)` also hides the checklist for an owner whose source is connected but has not synced yet. Connect writes a `never_ran` health row at once (20260930000100_health_pending_on_connect.sql:64), so base showed "3 of 4 — Get your first data in" here. Two cases hit it: an owner who invited someone and used AI before connecting, and shopify-review on the next resubmission. shop/redact deletes connector_health but keeps memberships and mcp_tool_calls (not in scope.ts DATA_TABLES), so the Sources page the reviewer sees after install loses a checklist that base would show. — Fix: `!(aiDone && teamDone && !sourceDone)`. Checked in a scratch copy: all 14 first-run tests pass, plus a probe (ai + team + never_ran row → visible) that fails on the current rule. Cost: a finished owner who disconnects and then reconnects their only source sees 3/4 until the first sync (≤1 h).

## Answer: never-connected owner with an AI call and an invitee
Acceptable, not Important. Without stored state this case looks exactly like "finished, then disconnected the only source": no health rows in either, and ai + team both true. So any stateless rule that keeps the disconnect case hidden also hides this one. The source cards with their Connect / Request buttons stay on the same page (the step links to #sources), and 0 prod tenants are in this state.

## Prod check (read-only SELECTs, cnsxbglhredokjbvudfd)
- Checklist visibility under base vs new is identical for all 5 owner rows (bcns-oauth-test, pjg, sb ×2, shopify-review). shopify-review is hidden under both: Shopify ok and synced, 12 AI calls, 1 non-smoke member added 2026-10-08.
- shopify-review does change outside the checklist: 1 JPY and 2 OMR order rows now render ¥1,514 (was ¥151,400) and OMR 76.930 (was 7.693). This is the mandated /100 fix, and it is correct (connectors/index.ts:116 stores round(amount*100) for every currency), but a reviewer who opens /data orders can see it. For Shopify-only tenants, the Shopify defaultPins are unchanged.

## Gates
`cd apps/connect && pnpm test`: 386/386, and first-run.test.mjs is in the test list. Root typecheck and lint exit 0. The item diff touches nothing outside apps/connect except the .claude/dev-team reports. No edits to shopify.app.toml, lib/sources.ts, app/api/, middleware.ts, or any package.json.

## STANDARDS.md suggestion (not applied)
- Connect hub: shop/redact deletes only scope.ts DATA_TABLES. memberships and mcp_tool_calls survive, so a reset tenant keeps its "team" and "ai" ticks.
