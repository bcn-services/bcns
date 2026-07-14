# AGENTS.md — bcns

Project-level guidance for Claude Code agents working in this repo.

## What this repo is

bcns is a software studio that builds custom software for local small businesses. This monorepo contains:
- `apps/web/` — the marketing/landing website (Next.js 14 App Router + TypeScript + Tailwind)
- `packages/ui/` — shared React component library (`@bcns/ui`)
- `packages/config/` — shared tsconfig, ESLint, Tailwind, Prettier config (`@bcns/config`)
- `templates/` — reserved for future client app starters (not a workspace package yet)

## Commands

```bash
pnpm install          # install all deps (from repo root)
pnpm dev              # dev server at http://localhost:3000
pnpm build            # production build (all packages via Turbo)
pnpm lint             # ESLint across all packages
pnpm typecheck        # tsc --noEmit across all packages
pnpm format           # Prettier write
pnpm format:check     # Prettier check (CI-safe)
```

All commands run from the repo root via Turborepo. There is no need to `cd` into `apps/web/`.

## Architecture

**Monorepo tooling:** pnpm workspaces + Turborepo. Task pipeline in `turbo.json`. Any new directory under `apps/` or `packages/` is auto-picked up by the workspace glob.

**Web app (`apps/web/`):** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS with HSL token theme (light + dark). Page entry is `app/page.tsx`; layout in `app/layout.tsx`. All site-wide constants (name, domain, email, nav items, tagline, description) live in `apps/web/lib/site.ts` — update that file, not individual components.

**Component structure (`apps/web/components/`):**
- `hero.tsx`, `problem-solution.tsx`, `how-it-works.tsx`, `delivery-models.tsx`, `use-cases.tsx`, `contact-section.tsx` — one file per landing page section
- `site-header.tsx`, `site-footer.tsx` — layout chrome
- `contact-form.tsx` — form with Web3Forms / Formspree backend (env var `NEXT_PUBLIC_CONTACT_ENDPOINT`)
- `ui/` — primitive shadcn-style components (input, label, textarea)
- `theme-provider.tsx`, `theme-toggle.tsx` — dark mode via next-themes

**Shared UI (`packages/ui/`):** Shared React primitives used by `apps/web` and any future client apps. Import as `@bcns/ui`. Add to this package when a component will be reused across apps.

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
- `site.ts` is the single source of truth for all marketing copy — keep it that way.

## Adding a client app later

1. Create `apps/<client-name>/` (auto-picked up by workspace glob).
2. Depend on shared packages: `"@bcns/ui": "workspace:*"` and `"@bcns/config": "workspace:*"`.
3. Extend shared configs as `apps/web` does (tsconfig, eslint, tailwind, prettier).
4. Add the new app's `dev` script to `turbo.json` pipeline if needed.

## Deploy

Vercel free tier via `vercel.json`. Set the three env vars in the Vercel dashboard. No database, no paid services beyond a domain.
