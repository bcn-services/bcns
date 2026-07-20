---
type: workflow-app
delivery: hosted-web
name: "@nseluga/hosted-web-template"
status: template
---

# hosted-web template

A runnable **Next.js 14 (App Router, TypeScript strict)** starter for the
standard hosted client app. It depends on the shared workspace packages
`@nseluga/ui`, `@nseluga/config`, and `@nseluga/app-core` via `workspace:*`, and ships
with the wiring points a real client build needs — env-driven config, an opt-in
AI module, and a Stripe subscription webhook — as safe, keyless stubs.

## Quick start

```bash
# From the repo root (installs + links workspace deps):
corepack pnpm install

# Build / dev / test this template:
corepack pnpm --filter @nseluga/hosted-web-template build
corepack pnpm --filter @nseluga/hosted-web-template dev     # serves on :3100
corepack pnpm --filter @nseluga/hosted-web-template test
```

The app builds and serves an HTTP 200 home page with **no environment variables
set** and the AI feature flag **off**. Nothing reads `process.env` at import or
build time — config is read lazily inside request handlers (`lib/env.ts`), so
missing keys degrade gracefully instead of crashing.

## Environment variables

Copy `.env.example` → `.env.local` and fill in real values. `.env.example` is
committed with **placeholders only — no real secrets**. See `lib/env.ts` for
the single accessor; documented vars: `DATABASE_URL` (Neon), Clerk
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), Stripe
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), and the per-app
`ANTHROPIC_API_KEY` plus its `AI_ENABLED` flag.

## Opt-in AI module (`lib/ai.ts`)

AI is **genuinely opt-in**. `maybeGetAiClient` checks `AI_ENABLED` first and
returns `null` before `@nseluga/app-core`'s `createAnthropicClient` is ever
referenced. The client is constructed only when the flag is on **and** a key is
present. The client's Anthropic key is read from env, never from source. See
`tests/ai-optin.test.mjs` for the import-boundary proof of non-invocation.

## Stripe subscription webhook (`app/api/stripe/webhook/route.ts`)

The route parses/validates an incoming event and routes the provision/suspend
decision through `@nseluga/app-core`'s pure `decideFromEvent`/`decideAccess`.
Signature verification is a documented **stub** (no Stripe SDK bundled); real
deployments must call `stripe.webhooks.constructEvent` with
`STRIPE_WEBHOOK_SECRET` before trusting the payload. The decision logic lives in
`lib/webhook.ts` so it is unit-tested independently (`tests/webhook.test.mjs`).

## Extracting to its own repo (Needs-Nate)

This template is a **workspace member** of the bcns monorepo only so its
`workspace:*` deps resolve locally (the root `pnpm-workspace.yaml` globs
`templates/*` for exactly this reason). When you promote it to a standalone
client repo, replace each `workspace:*` dependency with a versioned registry
dep — `@nseluga/ui`, `@nseluga/config`, and `@nseluga/app-core` become published
`@nseluga/*` packages pulled from the registry. Nothing else in the app assumes it
lives inside the monorepo.

## Deploy

See `DEPLOY.md` — Coolify + Cloudflare + Neon + Clerk, built from the
multi-stage `Dockerfile`.
