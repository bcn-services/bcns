---
type: workflow-app
delivery: hosted-web
name: "@bcn-services/sb"
status: active
---

# sb — hosted client app

**SB Command Center**: one dashboard over SB's Shopify, Meta Ads, Monday.com
and Google Meet data (plus Drive-sourced library files and QuickBooks budget
rows), read from the shared bcns platform (`DATA_SOURCE=shared`), with a
content library and a Daily Financial Report (no AI in v1). See
[`CLIENT.md`](CLIENT.md) for the brief and config decisions.

Lives in the bcns monorepo as `apps/sb` (workspace package `@bcn-services/sb`),
stamped from `apps/_template`. A **Next.js 14 (App Router, TypeScript strict)**
app on the shared DigitalOcean droplet. It depends on `@bcn-services/ui`,
`@bcn-services/config`, `@bcn-services/app-core`, `@bcn-services/data-client` and
`@bcn-services/tenant` as `workspace:*`. Data is read only through
`lib/data.ts` (`@bcn-services/data-client`) as the signed-in user; the app has
no migrations and no `supabase/` directory (the platform owns the schema).
Template wiring points (env-driven config, `/api/health`, webhook hygiene
seams, storage adapter interface, RLS test scaffold, opt-in AI module) are
safe, keyless stubs.

## Quick start

From the monorepo root (the root pins `pnpm@9.15.0`; see root `CLAUDE.md`):

```bash
pnpm install
pnpm --filter @bcn-services/sb dev     # next dev, default port 3000 locally
pnpm --filter @bcn-services/sb test    # tsx --test over the hard-coded file list in package.json
pnpm --filter @bcn-services/sb build   # tsx scripts/check-env.ts && next build
```

The deployed instance is `bcns-app@sb` on **port 3101** (`infra/ports.txt`),
with `PORT` set in `/srv/sb/env`. A new test file runs only after it is added to
the `test` list in `package.json`.

The app builds and serves an HTTP 200 home page with **no environment variables
set** and the AI feature flag **off**. Nothing reads `process.env` at import or
build time — config is read lazily inside request handlers (`lib/env.ts`), so
missing keys degrade gracefully instead of crashing.

## Environment variables

Copy `.env.example` → `.env.local` and fill in real values. `.env.example` is
committed with **placeholders only — no real secrets**. See `lib/env.ts` for
the single accessor. In shared mode (`DATA_SOURCE=shared`) the live vars are
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EXPECTED_CLIENT_ID`
(tenant pin), and `HEALTH_EMAIL`/`HEALTH_PASSWORD` (the smoke user `/api/health`
signs in as). `SUPABASE_SERVICE_ROLE_KEY` must be **unset** in shared mode:
`scripts/check-env.ts` fails the build if it is present. `DATABASE_URL`,
`AGENT_*`, `ANTHROPIC_API_KEY`, `AI_ENABLED` and `AI_MONTHLY_BUDGET_USD` exist in
`.env.example` but are unused in v1 (own-project mode, agent and AI are off).

## What the template ships (the template contract)

The template is a **pure skeleton**: wiring, env, tests, and docs. The shared
logic behind these seams lives in `@bcn-services/app-core` — the `lib/` files are
thin re-exports/bindings, so a platform fix reaches every client via a version
bump, not a per-repo edit. `TEMPLATE.md` is the manifest of everything that
changes when this becomes a client repo.

- **`lib/env.ts`** — lazy config accessor; the keyless-run guarantee. (The one
  lib file with real code here — env access is app wiring, not shared logic.)
- **`app/api/health`** (+ `lib/health.ts` → app-core) — real DB-connectivity
  probe for UptimeRobot: 200 when connected or unconfigured, 503 when a
  configured DB fails its ping. Pure evaluation, unit-tested in app-core.
- **`lib/webhooks.ts`** (→ app-core) — generic inbound-webhook hygiene: a
  fail-closed signature-verifier seam and an idempotent processing pipeline.
  **No provider-specific webhook routes ship in the template** — which
  processor / SMS / accounting webhooks a client needs is a per-client
  decision, and BCNS's own fee billing is handled centrally, never in-app.
- **`lib/storage.ts`** — this app's adapter seam over app-core's
  `StorageAdapter` interface. Platform default is Supabase Storage; a
  client-specific backend (e.g. self-hosted Nextcloud via WebDAV) implements
  the same interface so it never hardens into the template. Files are keyed to
  canonical business ids; private content via signed URLs.
- **`tests/rls-forbidden-read.test.mjs`** — the standing scaffold for
  RLS-policy tests: forbidden reads must fail, from commit one. Skips until
  Supabase env exists; client builds extend it per protected table/role.
- **`lib/ai.ts`** (→ app-core) — opt-in AI module (below).

## Opt-in AI module (`lib/ai.ts`)

AI is **genuinely opt-in**. `maybeGetAiClient` binds this app's env config to
app-core's `maybeCreateAnthropicClient`, which checks `AI_ENABLED` first and
returns `null` before the client factory is ever referenced. The client is constructed only when the flag is on **and** a key is
present. The client's Anthropic key is read from env, never from source. See
`tests/ai-optin.test.mjs` for the import-boundary proof of non-invocation.

## Deploy

Pushes to `main` touching `apps/sb/**` (or `packages/**`, root package/lock) run
`.github/workflows/deploy-app.yml`, which builds, ships to
`/srv/sb/releases/<sha>`, restarts `bcns-app@sb` and health-checks
`/api/health` (the same push also deploys connect and mcp). Droplet setup:
`infra/onboard-client.sh`. `DEPLOY.md` here is the older per-repo runbook and
is partly stale (it still describes the per-repo workflow, `SUPABASE_DB_URL`, `CLIENT_SLUG` and own-project mode).
