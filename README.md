# bcns

Platform monorepo for **bcns** — a software studio that builds custom software
for local small businesses. This repo holds the marketing site, DeLuca's, the
shared packages, and the client-app template source. **Client apps do not live
here** — each client business gets its own repo generated from
`templates/hosted-web/`, consuming the shared packages by version. See
[`docs/architecture/hosted-web-model.md`](docs/architecture/hosted-web-model.md)
for the delivery model and rationale.

---

## What's in here

```
bcns/
├─ apps/              # Platform-owned apps only (not client apps)
│  ├─ web/            # The landing website (Next.js App Router + TS + Tailwind)
│  └─ delucas/        # DeLuca's, a platform-owned app
├─ packages/
│  ├─ ui/             # Shared React component library (@nseluga/ui)
│  ├─ config/         # Shared tsconfig / ESLint / Tailwind / Prettier (@nseluga/config)
│  └─ app-core/       # @nseluga/app-core: pricing & seat-billing math, subscription-state (provision/suspend), BYOK Anthropic client
├─ templates/
│  └─ hosted-web/     # Starter for spinning up a new client repo (@nseluga/hosted-web-template)
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
  shared primitives living in `@nseluga/ui`.
- **ESLint (flat config) + Prettier**, shared from `@nseluga/config` and
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

Client apps are **not** added to this monorepo. Each new client business gets
**its own repo**, generated from `templates/hosted-web/`. See
[`docs/architecture/hosted-web-model.md`](docs/architecture/hosted-web-model.md)
for the full delivery model and rationale.

1. Generate a new repo from `templates/hosted-web/`
   (`@nseluga/hosted-web-template`) — pre-wired to the hosting stack and shared
   packages.
2. Consume the shared packages **by version** (normal dependencies, not
   `workspace:*`): `@nseluga/ui`, `@nseluga/config`, and `@nseluga/app-core`.
3. Propagate shared improvements by publishing a new package version and bumping
   it in each client repo — no copy-paste per app.

`apps/` in this repo holds only the platform's own apps (`apps/web`,
`apps/delucas`).
