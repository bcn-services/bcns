# CLAUDE.md — bcns client app

## What this repo is

A **bcns hosted-web client app**: `apps/sb` in the bcns monorepo (`@bcn-services/sb`),
stamped from `apps/_template`. Next.js 14 (App Router, TS strict) on the shared
DigitalOcean droplet as systemd unit `bcns-app@sb` (port 3101, `infra/ports.txt`) ·
data from the shared bcns platform Supabase project via `@bcn-services/data-client`
(no per-client project) · Anthropic API off in v1. Platform authority:
`~/os/knowledge/library/bcns/hosting-reference.md` in the operator's `~/os`.

## Where things stand — check these before building

- **`CLIENT.md`** — the business brief and config decisions (storage backend,
  AI feature, webhook providers). If a decision there is marked "Undecided",
  stop and ask before building code that assumes an answer.
- **`TEMPLATE.md`** — the manifest of every customization point the template
  ships. When a `CLIENT.md` decision gets made, it lands at the file/seam
  `TEMPLATE.md` names for that decision (e.g. storage backend →
  `lib/storage.ts`).
- **`DEPLOY.md`** — older per-repo deploy runbook (partly stale: own-project mode, per-repo
  workflow secrets/vars). Current path: root `.github/workflows/deploy-app.yml` + `infra/`.
  Infra provisioning is manual.
- **`STANDARDS.md`** — does not exist yet in a fresh stamp. Once real code
  patterns emerge (a repo seam, a locked architectural choice, a gotcha worth
  not re-learning), create it and record only what's particular to this
  codebase — the global dev-team standards cover the rest.

## Repo layout

Same shape as the template: `app/` (routes: `/`, `/library`, `/financials`, `/login`,
`/api/health`), `lib/` (one file per domain; thin bindings into
`@bcn-services/app-core`, which is a `workspace:*` dependency), `tests/`
(`pnpm --filter @bcn-services/sb test`, a hard-coded file list in `package.json`;
add new test files there; `tests/rls-forbidden-read.test.mjs` is the standing RLS
scaffold). There is no `supabase/` directory: the platform owns the schema.

## Contract to preserve

The app must build and serve with **no environment variables set** and AI
**off** (`lib/env.ts` reads config lazily — never at import/build time). Don't
add code that reads `process.env` outside that seam or that assumes a
`CLIENT.md` config decision has already been made.

**Shared-platform mode** (`DATA_SOURCE=shared`, `platform/DESIGN.md` §8): all data
comes through `lib/data.ts` (`@bcn-services/data-client`: `api.*_v1` views, RPC writes)
as the signed-in user. No migrations, no direct DB access, and never a
service-role key (`scripts/check-env.ts` fails the build if one is set).
