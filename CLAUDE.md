# CLAUDE.md — bcns

Project-level guidance for Claude Code agents working in this repo.

## What this repo is

bcns is a software studio that builds custom software for local small businesses. This monorepo is the bcns **platform repo** — it holds the marketing site, the shared packages, and the droplet provisioning scripts. Client apps do **not** live here; each gets its own repo (see [Adding a client app later](#adding-a-client-app-later) and `docs/architecture/hosted-web-model.md`). Contents:
- `apps/web/` — the marketing/landing website (Next.js 14 App Router + TypeScript + Tailwind)
- `packages/ui/` — shared React component library (`@nseluga/ui`)
- `packages/config/` — shared tsconfig, ESLint, Tailwind, Prettier config (`@nseluga/config`)
- `packages/app-core/` — shared application core (`@nseluga/app-core`): pricing & seat-billing math, subscription-state (provision/suspend) logic, and a BYOK Anthropic client
- `infra/` — provisioning-as-code for the shared DigitalOcean droplet that hosts **client** apps (bootstrap, per-client onboarding, systemd unit, nightly backups). Nothing here touches `apps/web`.
- `docs/architecture/` — ADRs. `hosted-web-model.md` is the hosted-web business/delivery decision.
- `templates/` — placeholder for future app starters; **empty today**. The former `templates/hosted-web/` starter was deleted once its logic moved into `app-core@0.2.0`.

## Commands

```bash
pnpm install          # install all deps (from repo root)
pnpm dev              # dev server at http://localhost:3000
pnpm build            # production build (all packages via Turbo)
pnpm lint             # ESLint across all packages
pnpm typecheck        # tsc --noEmit across all packages
pnpm test             # test suites across all packages

# Opt-in static export -> apps/web/out/ (plain files, nginx-servable, no Node).
# Not the default: the default build is what Vercel runs.
pnpm --filter @nseluga/web export
pnpm format           # Prettier write
pnpm format:check     # Prettier check (CI-safe)
```

All commands run from the repo root via Turborepo. There is no need to `cd` into `apps/web/`.

## Architecture

**Monorepo tooling:** pnpm workspaces + Turborepo. Task pipeline in `turbo.json`. Any new directory under `apps/` or `packages/` is auto-picked up by the workspace glob.

**Web app (`apps/web/`):** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS with HSL token theme (light + dark). Page entry is `app/page.tsx`; layout in `app/layout.tsx`. All site-wide constants (name, domain, email, nav items, tagline, description) live in `apps/web/lib/site.ts` — update that file, not individual components.

**Component structure (`apps/web/components/`):**
- `hero.tsx`, `how-it-works.tsx`, `use-cases.tsx`, `pricing.tsx`, `faq.tsx`, `past-work.tsx`, `reviews.tsx`, `about-founder.tsx`, `contact-section.tsx` — one file per page section, each reading its copy from `lib/content.ts`
- `site-header.tsx`, `site-footer.tsx` — layout chrome
- `contact-form.tsx` — form with Web3Forms / Formspree backend (env var `NEXT_PUBLIC_CONTACT_ENDPOINT`)
- `ui/` — primitive shadcn-style components (input, label, textarea)
- `theme-provider.tsx`, `theme-toggle.tsx` — dark mode via next-themes

**Shared UI (`packages/ui/`):** Shared React primitives used by `apps/web` and any future client apps. Import as `@nseluga/ui`. Add to this package when a component will be reused across apps.

**Shared config (`packages/config/`):** All ESLint, tsconfig base, Tailwind preset, Prettier config. `apps/web` extends these — do not duplicate config in app-level files.

## Environment variables

Copy `.env.example` → `.env.local` in `apps/web/`. Never commit `.env.local`.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CONTACT_ENDPOINT` | Form POST endpoint (Web3Forms or Formspree) |
| `NEXT_PUBLIC_CONTACT_ACCESS_KEY` | Web3Forms access key (omit for Formspree) |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for canonical / OG metadata |

## Coding conventions

- TypeScript strict mode everywhere — no `any`, no type assertions without comment.
- Tailwind only — no CSS modules, no inline styles. Use HSL token classes (`bg-background`, `text-foreground`, etc.) from the theme, not raw color classes.
- Server Components by default in `app/`; add `"use client"` only when state or browser APIs are needed.
- Shared primitives go in `packages/ui/`, not inline in `apps/web/components/ui/`.
- `lib/content.ts` is the single source of truth for all marketing copy — keep it that way. `lib/site.ts` holds only name / domain / email / nav. `CONTENT.md` is the field-by-field companion to `content.ts` and must be updated alongside it.
- Fonts are self-hosted via `next/font/local` from `apps/web/app/fonts/`. Do **not** switch back to `next/font/google`: it fetches over the network at build time with no timeout in production, so an unreachable Google CDN fails `next build` in CI. To add or update a face, follow `apps/web/app/fonts/README.md`.

## Adding a client app later

Client apps are **not** added to this monorepo. Each new client business gets **its own repo**. See `docs/architecture/hosted-web-model.md` for the decision and rationale.

1. Create the new repo and wire it against the shared packages by hand. **There is no starter template today** — `templates/hosted-web/` was deleted once its logic moved into `app-core@0.2.0`, and its replacement (a standalone GitHub Template Repository) does not exist yet.
2. Consume the shared packages **by version** (as normal dependencies, not `workspace:*`): `@nseluga/ui`, `@nseluga/config`, and `@nseluga/app-core`.
3. Propagate shared improvements by publishing a new package version and bumping it in each client repo — no copy-paste, no hand-editing per app.

`apps/` in this monorepo holds only the platform repo's own app — the marketing site (`apps/web`). DeLuca's was extracted to its own repo (`bcns-client-delucas`).

## Deploy

Vercel free tier. The one required project setting is **Root Directory = `apps/web`** — everything else stays on auto-detect, and there is intentionally no `vercel.json` (see README → Deploy). Set the three env vars in the Vercel dashboard. No database, no paid services beyond a domain.
