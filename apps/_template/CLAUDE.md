# CLAUDE.md — bcns Deluxe client app

## What this repo is

A **bcns Deluxe client app**, stamped from `apps/_template` by
`scripts/new-app.sh <slug> <port>` (the `/new-client-app` skill). Lives at
`apps/<slug>` in the `bcn-services/bcns` monorepo. Next.js 14 (App Router, TS
strict) on the shared DigitalOcean droplet, one systemd unit per app ·
shared Supabase platform project (Postgres/auth/storage), never a per-app one
· Cloudflare front · Anthropic API as an **enhancement layer only** (app must
work with it off). Platform authority: `docs/architecture/platform-v1.md`
and `platform/DESIGN.md` at the repo root.

## Where things stand — check these before building

- **`CLIENT.md`** — the business brief and config decisions (storage backend,
  AI feature, webhook providers). If a decision there is marked "Undecided",
  stop and ask before building code that assumes an answer.
- **`TEMPLATE.md`** — the manifest of every customization point the template
  ships and what `scripts/new-app.sh` stamps automatically.
- **`DEPLOY.md`** — deploy mechanics (droplet, systemd, Supabase, Cloudflare,
  UptimeRobot). Infra provisioning (`infra/onboard-client.sh`) is manual.
- **`STANDARDS.md`** — does not exist yet in a fresh stamp. Once real code
  patterns emerge, create it and record only what's particular to this app —
  the repo root's dev-team standards cover the rest.

## Repo layout

Same shape as the template: `app/` (routes), `lib/` (one folder per domain,
thin bindings into `@bcn-services/app-core` and `@bcn-services/tenant` —
shared logic lives there and reaches every app via a workspace change, not a
per-app edit), `tests/` (`pnpm test`; `tests/rls-forbidden-read.test.mjs` is
the standing R39 scaffold). No `supabase/migrations/` — the platform
(`platform/`) owns the schema.

## Contract to preserve

The app must build and serve with **no environment variables set** and AI
**off** (`lib/env.ts` reads config lazily — never at import/build time). Don't
add code that reads `process.env` outside that seam or that assumes a
`CLIENT.md` config decision has already been made.

Shared-platform mode is the only mode: all data comes through `lib/data.ts`
(`@bcn-services/data-client`: `api.*_v1` views, RPC writes) as the signed-in
user, tenant-pinned by `@bcn-services/tenant`'s middleware. No migrations, no
direct DB access, and never a service-role key
(`scripts/check-env.ts` fails the build if one is set).
