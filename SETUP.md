# bcns — Platform & Client Repo Setup

All repos live under **github.com/nseluga** (personal account, no org). **Private by default.**

## Repo topology

- **bcns** — the platform repo (this one): marketing site (`apps/web`), shared
  packages (`packages/*`), and the template source (`templates/hosted-web/`). No
  client apps live here.
- **bcns-app-template** — standalone GitHub *Template Repository*, generated from
  `templates/hosted-web/`. "Use this template" spins up a client repo.
- **bcns-client-<slug>** — one repo per client business, generated from the template.
  Current: `bcns-client-delucas` (DeLuca's — extracted from this monorepo).

## Naming convention

- Platform: `bcns`
- Template: `bcns-app-template`
- Client apps: `bcns-client-<slug>`, where `<slug>` is the kebab-case business name.
  - Coventry Hills → `bcns-client-coventry-hills`
  - DeLuca's → `bcns-client-delucas`
- Rationale: with everything on a personal account (no org namespace), the `bcns-`
  prefix clusters and sorts the studio's repos together on the profile.

## Shared packages (@nseluga/*)

`@nseluga/app-core`, `@nseluga/ui`, `@nseluga/config` live here and publish **privately** to
GitHub Packages (`npm.pkg.github.com`) under `nseluga`. Clients never receive them —
apps are hosted on our VPS, so only machines we control ever install them.

> **⚠️ TEMPORARY SCOPE — migrate to a `bcns` org later.** GitHub Packages requires the
> npm scope to match the owning account, so on a personal account the packages must be
> `@nseluga/*`. The name `bcns` is available as a GitHub org. Once the business admin is
> set up and it's no longer just Nate, create the free **`bcns` org** and rename
> `@nseluga/*` → `@bcns/*` (global find/replace across this repo + the template + every
> client repo, then republish). The `@bcns` brand already lives in all repo names
> (`bcns`, `bcns-app-template`, `bcns-client-*`); only the npm scope is on the temporary
> `@nseluga` name, and it's invisible to clients.

**Propagation:** improve a package → `pnpm publish` a new version → bump the range /
`npm update @nseluga/app-core` in each client repo. No copy-paste.

**Publishing (from this repo, on a machine we control):**

1. One-time: give the `gh` token package scopes — `gh auth refresh -s read:packages,write:packages`.
2. Bump the package `version`, then publish. `pnpm publish` reads each package's
   `publishConfig.registry` and rewrites `workspace:*` deps to real versions.

**Installing in an environment we control (laptop / Coolify build box).** Add to the
consuming repo's `.npmrc`:

```
@nseluga:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` = a **classic** PAT with `read:packages` (publishing also needs
`write:packages`). **Important:** the `gh` CLI OAuth token (`gho_…`) can *publish* but
returns **403 on downloads** from GitHub Packages — installs require a classic PAT with
`read:packages`. Never commit the token — supply it via env.

**Packages ship as TypeScript** (no build step). Client Next apps must transpile them:

```js
// next.config.mjs
transpilePackages: ['@nseluga/app-core', '@nseluga/ui', '@nseluga/config']
```

## Spinning up a new client (e.g. Coventry Hills)

1. github.com/nseluga/bcns-app-template → **Use this template** → name
   `bcns-client-<slug>`, **Private**.
2. Clone, add `.npmrc` (above), `pnpm install`.
3. Configure env: Clerk (auth), Stripe (billing), Neon (Postgres), optional Anthropic
   BYOK key. See the template `README.md` / `DEPLOY.md`.
4. Deploy to Coolify on the Hetzner VPS; front with Cloudflare.

## Exception — DeLuca's (`bcns-client-delucas`)

DeLuca's follows the **one-repo-per-client + shared-packages** convention but is a
legacy **desktop (Electron) app**, not a hosted web app. So it:

- is **not** generated from `bcns-app-template` (no Next.js/hosted-web scaffold),
- is **not** deployed to our Coolify/Hetzner VPS and carries no monthly-hosting line
  (self-hosted / client-run, "build once"),
- still gets its own repo (`bcns-client-delucas`) and consumes `@nseluga/*` by version.

**Status: extracted (2026-07-20).** `apps/delucas` was moved out to
[`bcns-client-delucas`](https://github.com/nseluga/bcns-client-delucas) with full
history (`git subtree split`); `@nseluga/*` deps repointed from `workspace:*` to
published versions; Vite/electron-vite aliases repointed at the installed package.
Verified standalone: typecheck + unit tests + `electron-vite build` all pass.
