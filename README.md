# bcns

Monorepo for **bcns** — a software studio that builds custom software for
local small businesses. This repo currently contains the marketing website; it's
scaffolded so client apps and shared code can be added later without rework.

---

## What's in here

```
bcns/
├─ apps/
│  └─ web/            # The landing website (Next.js App Router + TS + Tailwind)
├─ packages/
│  ├─ ui/             # Shared React component library (@bcns/ui)
│  └─ config/         # Shared tsconfig / ESLint / Tailwind / Prettier (@bcns/config)
├─ templates/         # Reserved for future app starters (not a workspace yet)
├─ package.json       # Root scripts + workspace dev dependencies
├─ pnpm-workspace.yaml
├─ turbo.json         # Turborepo task pipeline
├─ vercel.json        # Vercel deploy config
├─ .nvmrc             # Node version (22)
```

### Tech stack

- **pnpm workspaces + [Turborepo](https://turbo.build/)** — monorepo tooling.
- **[Next.js](https://nextjs.org/) 14 (App Router) + TypeScript (strict)** — the site.
- **[Tailwind CSS](https://tailwindcss.com/)** with dark-mode-ready HSL theme tokens.
- **shadcn/ui-style components** + **[Lucide](https://lucide.dev/) icons**, with
  shared primitives living in `@bcns/ui`.
- **ESLint (flat config) + Prettier**, shared from `@bcns/config` and
  runnable from the repo root via Turbo.

---

## Prerequisites

- **Node.js ≥ 18.18** (this repo is pinned to **Node 22** via `.nvmrc`).
- **pnpm 9** — enable it with Corepack:

  ```bash
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
  ```

---

## Install

```bash
pnpm install
```

## Develop

```bash
pnpm dev
```

Runs the landing site at **http://localhost:3000**. (Turbo runs the `dev` task;
only `apps/web` has one.)

## Build

```bash
pnpm build
```

## Lint / format / typecheck

```bash
pnpm lint          # ESLint across all packages (via Turbo)
pnpm typecheck     # tsc --noEmit across all packages
pnpm format        # Prettier write
pnpm format:check  # Prettier check (CI-friendly)
```

---

## Environment variables

The contact form needs no backend or database — it POSTs to a form service.
Copy the example file and fill in **one** provider:

```bash
cp apps/web/.env.example apps/web/.env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CONTACT_ENDPOINT` | Form endpoint (Web3Forms or Formspree). If unset, the form still validates and shows success in dev, but nothing is delivered. |
| `NEXT_PUBLIC_CONTACT_ACCESS_KEY` | Web3Forms access key (leave unset for Formspree). |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for canonical + OpenGraph metadata. |

`.env.local` is gitignored. **Never commit secrets** — only `.env.example`
(placeholders) is tracked.

---

## Deploy (Vercel free tier)

The only recurring cost is a domain — no databases or paid services.

**One-command deploy** (from the repo root, after `npm i -g vercel`):

```bash
vercel        # first run links/creates the project
vercel --prod # ship to production
```

`vercel.json` sets the framework, install/build commands, and output directory
so the monorepo builds correctly. In the Vercel dashboard, add the environment
variables above under **Project → Settings → Environment Variables**.

> If Vercel doesn't auto-detect the app, set **Root Directory = `apps/web`** in
> project settings and it will use Next.js defaults.

### Cloudflare Pages (alternative)

Also compatible with Cloudflare Pages via
[`@cloudflare/next-on-pages`](https://github.com/cloudflare/next-on-pages):
set the build command to `npx @cloudflare/next-on-pages` and output directory to
`.vercel/output/static`. (Not installed by default to keep the dependency list
lean.)

---

## Adding a client app later

1. Create `apps/<client-name>/` (it's auto-picked-up by the workspace glob).
2. Depend on the shared packages: `"@bcns/ui": "workspace:*"` and
   `"@bcns/config": "workspace:*"`.
3. Extend the shared configs (see how `apps/web` wires up `tsconfig`, `eslint`,
   `tailwind`, and `prettier`).
