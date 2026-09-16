---
type: workflow-app
delivery: hosted-web
name: "@bcn-services/_template"
status: template
---

# apps/\_template — bcns Deluxe app template

A runnable **Next.js 14 (App Router, TypeScript strict)** starter for a
Deluxe client app on the bcns platform (`docs/architecture/platform-v1.md`).
Shared-platform mode only: every stamped app reads the one platform Supabase
project via `@bcn-services/data-client`, session and tenant pin via
`@bcn-services/tenant` — there is no per-client Supabase project and no
own-project mode.

Stamped into `apps/<slug>` by `scripts/new-app.sh <slug> <port>` (the
`/new-client-app` skill runs it and fills in `CLIENT.md`). See `TEMPLATE.md`
for exactly what the script changes.

## Quick start

```bash
corepack pnpm install
corepack pnpm --filter @bcn-services/_template dev     # PORT env, default 3000
corepack pnpm --filter @bcn-services/_template build
corepack pnpm --filter @bcn-services/_template test
```

The app builds and serves an HTTP 200 home page with **no environment
variables set** and the AI feature flag **off**. Nothing reads `process.env`
at import or build time — config is read lazily inside request handlers
(`lib/env.ts`), so missing keys degrade gracefully instead of crashing.

## Environment variables

Copy `.env.example` → `.env.local`. `.env.example` is committed with
**placeholders only — no real secrets**. See `lib/env.ts` for the single
accessor: Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
— the platform project), `EXPECTED_CLIENT_ID` (this app's tenant pin,
`@bcn-services/tenant`), `HEALTH_EMAIL`/`HEALTH_PASSWORD` (the smoke user
`/api/health` signs in as), `AGENT_EMAIL`/`AGENT_PASSWORD` (`pnpm agent`), and
the per-app `ANTHROPIC_API_KEY` plus its `AI_ENABLED` flag.

## What the template ships

- **`lib/env.ts`** — lazy config accessor; the keyless-run guarantee.
- **`middleware.ts`** — `@bcn-services/tenant`'s `tenantMiddleware`: refreshes
  the shared session cookie and pins this app to `EXPECTED_CLIENT_ID`. The pin
  fails closed — with the platform configured and `EXPECTED_CLIENT_ID` unset it
  denies every request rather than serving unpinned (see `DEPLOY.md`).
- **`app/api/health`** (`lib/shared-health.ts`) — signs in as the client's
  smoke user and reads its platform row; 503 rolls a bad deploy back.
- **`lib/webhooks.ts`** (→ app-core) — generic inbound-webhook hygiene seam.
  No provider-specific routes ship in the template.
- **`lib/storage.ts`** — this app's adapter seam over app-core's
  `StorageAdapter`. Platform default is Supabase Storage.
- **`tests/rls-forbidden-read.test.mjs`** — the R39 smoke: a signed-in client
  reads only its own client's rows. Skips until Supabase env exists.
- **`lib/ai.ts`** (→ app-core) — opt-in AI module (below).

## Opt-in AI module (`lib/ai.ts`)

AI is **genuinely opt-in**. `maybeGetAiClient` binds this app's env config to
app-core's `maybeCreateAnthropicClient`, which checks `AI_ENABLED` first and
returns `null` before the client factory is ever referenced. See
`tests/ai-optin.test.mjs` for the import-boundary proof of non-invocation.

## Deploy

`.github/workflows/deploy-app.yml` (slug input) ships the standalone build to
`bcns-app@<slug>` on the shared droplet. Port registry: `infra/ports.txt`.
See `DEPLOY.md`.
