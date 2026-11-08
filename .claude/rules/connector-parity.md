---
paths:
  - "platform/worker/src/connectors/**"
  - "platform/supabase/migrations/**"
  - "apps/connect/lib/data-*.ts"
  - "apps/connect/lib/sources.ts"
  - "apps/sb/lib/**"
  - "apps/mcp/src/policy.ts"
---

# Connector parity

Adding or changing a connector, or how a synced number is computed or shown, needs a parity check: our figure equals the source platform's own report for the same account, date range, timezone, currency and filters. dt-qa runs it (its "Data parity pass"); an inline session runs the same steps. Why: Shopify review 2.1.4 failed on hub stats ≠ Shopify Analytics, and #222 passed tests and code review while still wrong. #224's dev-store check caught it.

- **Test accounts:** Shopify dev store bcns-data-dev = tenant `cdb45e4f` (prod). Never the shopify-review tenant. Other sources: ask Nate which sandbox account to use; don't guess.
- **Our side:** read-only SELECT via `mcp__supabase-bcns__execute_sql` (project `cnsxbglhredokjbvudfd`) on the `api` view the UI reads (`daily_summary_v1`, `campaign_daily_v1`, …), after a real sync. Check every consumer that shows it: `apps/connect/lib/data-stats.ts`, `apps/sb/lib/{overview,financials}.ts`, MCP `apps/mcp/src/policy.ts`, weekly digest (`platform/worker/src/health.ts`).
- **Their side:** the platform's report screen in Nate's signed-in browser (read only), or numbers Nate gives. Never call a provider API with a tenant token.
- **Definitions** (ours vs platform, per stat): `docs/architecture/connector-metrics-audit-2026-11-07.md`.
- **Pin the day:** `platform/test/shopify-total-sales.db.test.ts` "matches the bcns-data-dev day" is the pattern: the checked day's rows → view → the report's numbers.
- **Gates:** required before a marketplace submission (`docs/architecture/w6a-shopify-submission.md`) and before a client's source goes live (`platform/DESIGN.md` §9). Put the stat | ours | platform | report screen + filters table in the PR body.
