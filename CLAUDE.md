# CLAUDE.md — bcns

Project-level guidance for Claude Code agents working in this repo.

## What this repo is

bcns is a software studio that builds custom software for local small businesses. This monorepo is the whole platform (one-repo decision 2026-09-15; plan and gates in `docs/architecture/platform-v1.md`):
- `apps/web/` — marketing site (Next.js 14 App Router + TS + Tailwind), deployed on Vercel. Must never import from `apps/*`, `platform/` or `packages/{data-client,tenant}` (`apps/web/__tests__/isolation.test.mjs`).
- `apps/connect/` — the hub, `connect.bcn-services.com` (sign-in, sources + health, team, access). Six connector sources: Shopify, Meta, Monday, Meet, Drive, QuickBooks (`lib/sources.ts`).
- `apps/mcp/` — MCP server, `mcp.bcn-services.com`. Plain Node process, not Next; never holds a service-role key.
- `apps/sb/` — SB Command Center, the first Deluxe client app.
- `apps/_template/` + `scripts/new-app.sh <slug> <port>` — stamp for the next Deluxe app. `mcp`, `connect`, `sb`, `web`, `_template` are reserved slugs.
- `packages/ui`, `config`, `app-core`, `data-client`, `tenant` — shared, all `@bcn-services/*`, consumed as `workspace:*`. `tenant` = session-cookie helpers + membership middleware + `EXPECTED_CLIENT_ID` pin.
- `platform/` — the former `bcns-data`: `supabase/` (migrations, Edge Functions), `worker/` (Cloud Run connector job), `scripts/` (onboard, add-member, add-source), `test/`, `docs/`. Workspace package `@bcn-services/platform`.
- `infra/` — droplet-as-code: bootstrap, `onboard-client.sh`, `bcns-app@.service`, backups, `ports.txt` (slug→port registry: l2detailz 3100, sb 3101, connect 3102, mcp 3103, ta 3104).
- `docs/architecture/` — ADRs and chunk plans. `hosted-web-model.md` is superseded by `platform-v1.md`.
- `templates/` — unused (README only); app starters live in `apps/_template`. Legacy one-off client builds (Technology Associates, l2detailz, DeLuca's) keep their own repos.

## Commands

Run from the repo root; Turborepo fans out. Root pins `pnpm@9.15.0` (`packageManager`).

```bash
pnpm install
pnpm dev              # turbo dev: every app with a dev script (web is pinned to :3000)
pnpm build            # turbo build, all packages
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # turbo test, then test:docs, test:infra, test:new-app
pnpm format:check     # Prettier (pnpm format writes)
pnpm --filter @bcn-services/web export   # opt-in static export -> apps/web/out/
```

**pnpm version.** Machine with pnpm 11 on PATH (verified 2026-09-30, pnpm 11.15.1): bare `pnpm lint` and `pnpm typecheck` from the root pass, because pnpm 11 self-switches to 9.15.0 from `packageManager`. `corepack pnpm lint` and `corepack pnpm typecheck` FAIL there: turbo's child `pnpm run` is the PATH pnpm 11, which refuses under corepack ("configured to use 9.15.0 ... Your current pnpm is v11"). Use the form that passes on your machine; CI uses `pnpm/action-setup`.

**`pnpm build` clobbers a running `pnpm dev`** (routes 500 on a missing vendor chunk, Tailwind arbitrary classes stop applying). Stop dev before building.

**Supabase CLI: always `--workdir platform`** (`supabase db push`, `migration list`, `functions deploy`). Without it the CLI reports "Remote migration versions not found"; never run `migration repair` for that.

## Test gotchas

- `platform` tests (vitest): the DB-backed files skip, with a printed message, when the local stack at `127.0.0.1:54322` (or `DATABASE_URL`) is unreachable. A green local run without `supabase start` did not run them. CI starts the stack and never skips.
- `apps/connect` tests import `@bcn-services/tenant` from `packages/tenant/dist`; build it first (`pnpm --filter @bcn-services/tenant build`). Under turbo, `test` depends on `build`, so `pnpm test` does it for you.
- App `test` scripts are hard-coded file lists (`tsx --test tests/a.test.mjs ...`) in `apps/{connect,sb,_template}/package.json`. A new test file does nothing until it is added to that list. `apps/mcp` runs `tsc && node --test tests/*.test.mjs`; `apps/web` runs `__tests__/*.mjs`.
- `apps/web`: `__tests__/a2-fix-verification.test.mjs` was red on main when the `apps` CI job was written, so that job excludes `@bcn-services/web` from test (`platform-ci.yml`).

## What a merge to `main` deploys

Read the workflow before assuming; paths below are the `on.push.paths` filters as of 2026-09-30.

- `deploy-app.yml`: a push touching `apps/sb/**`, `apps/connect/**`, `apps/mcp/**`, `packages/**`, root `package.json`, `pnpm-lock.yaml` or the workflow itself deploys **all of sb, connect and mcp** (matrix `["sb","connect","mcp"]`; each builds, rsyncs to the droplet, restarts `bcns-app@<slug>`, health-checks `/api/health`, rolls back on failure). A docs-only edit under `apps/sb/` or `apps/connect/` still matches and restarts them. `workflow_dispatch` with `slug` redeploys one.
- `deploy-worker.yml`: `platform/worker/**`, `platform/package.json`, root `package.json`, `pnpm-lock.yaml` or the workflow itself -> builds the worker image and updates the Cloud Run Job `bcns-data-worker`.
- `platform-ci.yml`: tests, not a deploy. Push to main on `platform/**`, `packages/data-client/**`, root package/lock; on PRs also `apps/**` and `packages/**`. Job `test` = local Supabase stack + platform typecheck/test + worker image build; job `apps` = turbo lint/typecheck/test over `apps/*`.
- Marketing (Vercel): Ignored Build Step skips builds unless `apps/web`, `packages/ui`, `config`, `app-core`, root package/lock changed (README -> Deploy).
- Migrations, Edge Functions, DNS and dashboard settings never deploy from a merge; they are Nate-run steps.

## Architecture

**Monorepo tooling:** pnpm workspaces + Turborepo. Task pipeline in `turbo.json`. `pnpm-workspace.yaml` globs `apps/*`, `packages/*` and `platform`.

**Web app (`apps/web/`):** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS with HSL token theme (light + dark). Page entry is `app/page.tsx`; layout in `app/layout.tsx`. All site-wide constants (name, domain, email, nav items, tagline, description) live in `apps/web/lib/site.ts` — update that file, not individual components.

**Shared UI (`packages/ui/`):** Shared React primitives used by `apps/web` and any future client apps. Import as `@bcn-services/ui`. Add to this package when a component will be reused across apps.

**Shared config (`packages/config/`):** All ESLint, tsconfig base, Tailwind preset, Prettier config. `apps/web` extends these — do not duplicate config in app-level files.

## Environment variables (apps/web)

Copy `.env.example` → `.env.local` in `apps/web/`. Never commit `.env.local`.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CONTACT_ENDPOINT` | Form POST endpoint (Web3Forms or Formspree) |
| `NEXT_PUBLIC_CONTACT_ACCESS_KEY` | Web3Forms access key (omit for Formspree) |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for canonical / OG metadata |

## Coding conventions

Tailwind, `content.ts`, `site.ts` and font rules below are `apps/web` (connect also uses Tailwind). `apps/sb` and `apps/_template` use plain CSS (`globals.css`), no Tailwind; `apps/mcp` has no UI.

- TypeScript strict mode everywhere — no `any`, no type assertions without comment.
- `apps/web`: Tailwind only — no CSS modules, no inline styles. Use HSL token classes (`bg-background`, `text-foreground`, etc.) from the theme, not raw color classes.
- Server Components by default in `app/`; add `"use client"` only when state or browser APIs are needed.
- Shared primitives go in `packages/ui/`, not inline in `apps/web/components/ui/`.
- `lib/content.ts` is the single source of truth for all marketing copy — keep it that way. `lib/site.ts` holds only name / domain / email / nav. `CONTENT.md` is the field-by-field companion to `content.ts` and must be updated alongside it.
- Fonts are self-hosted via `next/font/local` from `apps/web/app/fonts/`. Do **not** switch back to `next/font/google`: it fetches over the network at build time with no timeout in production, so an unreachable Google CDN fails `next build` in CI. To add or update a face, follow `apps/web/app/fonts/README.md`.

## Adding a client app

Run `scripts/new-app.sh <slug> <port>` from the root (the `/new-client-app` skill does this): it stamps `apps/_template` to `apps/<slug>`, writes `CLIENT.md`, and registers the port in `infra/ports.txt`. Then add the slug to `deploy-app.yml` in both `on.push.paths` and `strategy.matrix.slug` (a push deploys nothing for it until you do), and onboard the droplet with `infra/onboard-client.sh`. Apps consume shared packages as `workspace:*` and read all data through `@bcn-services/data-client` as the signed-in user; no migrations and no service-role key in an app (each app's `scripts/check-env.ts`, e.g. `apps/sb/scripts/check-env.ts`, fails the build).

## Deploy (marketing site, Vercel)

Vercel free tier. Required project settings: **Root Directory = `apps/web`**, Build Command `turbo run build --filter=@bcn-services/web...`, and the Ignored Build Step from README → Deploy (platform-v1). Everything else stays on auto-detect, and there is intentionally no `vercel.json` (see README → Deploy). Set the three env vars in the Vercel dashboard. No database, no paid services beyond a domain, for the marketing site only (the platform runs Supabase, Cloud Run and a droplet).
