# bcns

Platform monorepo for **bcns** — a software studio that builds custom software
for local small businesses. One repo holds the marketing site, the Connect hub,
the MCP server, the client apps, the shared packages, the data platform
(Supabase migrations, Edge Functions, connector worker) and the droplet
scripts. Plan, chunks and verification gates:
[`docs/architecture/platform-v1.md`](docs/architecture/platform-v1.md). The
earlier one-repo-per-client model in
[`docs/architecture/hosted-web-model.md`](docs/architecture/hosted-web-model.md)
is superseded.

---

## What's in here

```
bcns/
├─ apps/
│  ├─ web/            # Marketing site (Next.js App Router + TS + Tailwind), deployed on Vercel
│  ├─ connect/        # Hub: connect.bcn-services.com (sign-in, sources + health, team, access)
│  ├─ mcp/            # MCP server: mcp.bcn-services.com (plain Node, not Next)
│  ├─ sb/             # SB Command Center, the first Deluxe client app
│  └─ _template/      # Stamp for the next Deluxe app (scripts/new-app.sh <slug> <port>)
├─ packages/
│  ├─ ui/             # Shared React component library (@bcn-services/ui)
│  ├─ config/         # Shared tsconfig / ESLint / Tailwind / Prettier (@bcn-services/config)
│  ├─ app-core/       # @bcn-services/app-core: pricing & seat-billing math, subscription-state (provision/suspend), BYOK Anthropic client + AI opt-in gate, health probe, webhook hygiene, storage interface
│  ├─ data-client/    # @bcn-services/data-client: typed access to the platform's api.*_v1 views and RPCs
│  └─ tenant/         # @bcn-services/tenant: session-cookie helpers, membership middleware, EXPECTED_CLIENT_ID pin
├─ platform/          # Former bcns-data: supabase/ (migrations, Edge Functions), worker/, scripts/, test/, docs/
├─ infra/             # Shared droplet as code: bootstrap, onboard-client.sh, systemd unit, backups, ports.txt
├─ docs/architecture/ # ADRs and chunk plans
├─ scripts/           # new-app.sh (stamps apps/<slug> from apps/_template)
├─ .github/workflows/ # deploy-app.yml, deploy-worker.yml, platform-ci.yml
├─ package.json       # Root scripts + workspace dev dependencies (packageManager pnpm@9.15.0)
├─ pnpm-workspace.yaml
├─ turbo.json         # Turborepo task pipeline
├─ .nvmrc             # Node version (22)
```

### Tech stack

- **pnpm workspaces + [Turborepo](https://turbo.build/)** — monorepo tooling.
- **[Next.js](https://nextjs.org/) 14 (App Router) + TypeScript (strict)** — the site.
- **[Tailwind CSS](https://tailwindcss.com/)** with dark-mode-ready HSL theme tokens.
- **shadcn/ui-style components** + **[Lucide](https://lucide.dev/) icons**, with
  shared primitives living in `@bcn-services/ui`.
- **ESLint (flat config) + Prettier**, shared from `@bcn-services/config` and
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

The root pins `pnpm@9.15.0`. On a machine with pnpm 11, bare `pnpm lint` / `pnpm typecheck` work (pnpm 11 switches versions itself); `corepack pnpm lint` fails there because turbo's child process runs the PATH pnpm 11 under corepack. See `CLAUDE.md` -> Commands.

## Develop

```bash
pnpm dev
```

Turbo runs every app's `dev` task; the marketing site is pinned to
**http://localhost:3000**. To run just one app: `pnpm --filter @bcn-services/<name> dev`.
Do not run `pnpm build` while `pnpm dev` is up (it corrupts the dev server).

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

This is a pnpm monorepo, so the deploy hinges on one project setting:

**Project → Settings → Build & Deployment → Root Directory = `apps/web`**

**Platform-v1 (2026-09-15):** the repo is a workspace with the hub, MCP server and client apps (`apps/connect`, `apps/mcp`, `apps/sb`), `platform/` and `packages/{data-client,tenant}`; only `apps/web` goes to Vercel (the rest deploy to the droplet via `deploy-app.yml`). Vercel keeps Root Directory = `apps/web` and uses two settings so unrelated pushes neither build nor break the site: Build Command `turbo run build --filter=@bcn-services/web...` (the package name — `web` or the old `@nseluga/web` make turbo exit 1) and Ignored Build Step `git diff --quiet HEAD^ HEAD -- :/apps/web :/packages/ui :/packages/config :/packages/app-core :/package.json :/pnpm-lock.yaml`. `apps/web/__tests__/isolation.test.mjs` asserts the site imports nothing from `apps/*`, `platform/` or `packages/{data-client,tenant}`.

Leave everything else on auto-detect. Vercel reads the Next.js preset from
`apps/web`, and because "Include files outside the Root Directory" is on by
default, it still installs from the workspace root (`pnpm-lock.yaml`,
`pnpm-workspace.yaml`) so `@bcn-services/ui` and `@bcn-services/config` resolve.

There is deliberately **no `vercel.json`**. A root-level one is ignored once the
Root Directory is a subdirectory, and overriding `outputDirectory` to
`apps/web/.next` fights the Next.js preset instead of helping it — that
combination is what broke the first deploy.

Then add the environment variables above under **Project → Settings →
Environment Variables** (`NEXT_PUBLIC_SITE_URL` matters most — left unset it
emits localhost canonical/OG URLs and a localhost sitemap). Pushes to `main`
deploy to production via the GitHub integration.

### Cloudflare Pages (alternative)

Also compatible with Cloudflare Pages via
[`@cloudflare/next-on-pages`](https://github.com/cloudflare/next-on-pages):
set the build command to `npx @cloudflare/next-on-pages` and output directory to
`.vercel/output/static`. (Not installed by default to keep the dependency list
lean.)

---

## Adding a client app

Client apps live in this repo as `apps/<slug>`. From the root:

```bash
./scripts/new-app.sh <slug> <port>   # stamps apps/_template, writes CLIENT.md, registers the port in infra/ports.txt
```

(or the `/new-client-app` Claude Code skill). Then add the slug to
`.github/workflows/deploy-app.yml` (both `on.push.paths` and
`strategy.matrix.slug`) and onboard the droplet with `infra/onboard-client.sh`.
Apps consume the shared packages as `workspace:*` and read data through
`@bcn-services/data-client` as the signed-in user. Legacy one-off builds
(Technology Associates, l2detailz, DeLuca's) keep their own repos. See
[`docs/architecture/platform-v1.md`](docs/architecture/platform-v1.md).
