# bcns — Platform Repo Plan

> This repo is the **bcns platform repo**: the marketing site (`apps/web`), the
> shared `@nseluga/*` packages, and the hosted-web template source. Client apps
> live in their **own repos** (see `SETUP.md` and
> `docs/architecture/hosted-web-model.md`).
>
> **There is no active autonomous (`dev-team-auto`) queue right now.** The build
> and migration phase is complete (see status below). When the next client is
> scoped, author a fresh executable PLAN for that work — in that client's repo,
> not here.

---

## Status — build & migration phase COMPLETE (2026-07-20)

Everything the platform needs to spin up hosted client apps is built, on GitHub,
and verified:

- **Marketing site** (`apps/web`) — multi-page Next.js site on the new
  setup-fee + monthly pricing and honest hosted framing. Builds green (13 pages).
- **Business-model migration** — merged to `main` (PR #6). The repo is the
  platform repo; the hosted-web / one-repo-per-client model is recorded in
  `docs/architecture/hosted-web-model.md`.
- **Shared packages** — `@nseluga/app-core`, `@nseluga/ui`, `@nseluga/config`
  published privately to **GitHub Packages** at `0.1.0` (PRs #7/#8). Consumed by
  version; ship raw TS (no build step) via `transpilePackages`. See `SETUP.md`.
- **Template repo** — `templates/hosted-web/` extracted to the standalone,
  private **`bcns-app-template`** GitHub *Template Repository*.
- **DeLuca's extracted** — moved out of this monorepo to its own repo,
  `bcns-client-delucas` (PR #9), with full history. Its plan, packaging, and
  handoff work now live **in that repo**, not here.

## Next phase — Coventry Hills (to be scoped; NOT an executable queue yet)

Scope this in a fresh session before any build, then author a real PLAN in the
new client repo. Outline only:

1. **Scope Coventry Hills** — features, data model, which shared packages it uses.
2. **Generate the repo** — "Use this template" on `bcns-app-template` →
   `bcns-client-coventry-hills` (Private). Install `@nseluga/*` with a classic PAT.
3. **Build** — the actual client app (out of scope for the platform repo).
4. **Provision live hosting** (Needs-Nate, first real deploy) — Hetzner + Coolify
   + Cloudflare + Neon + Clerk + Stripe. See the hosting stack in the ADR.

## Deferred / later

- **Package scope → org.** `@nseluga/*` is a temporary personal-account scope
  (GitHub Packages ties scope to owner). When it's no longer solo, create a free
  `bcns` org and rename `@nseluga/*` → `@bcns/*`. Details in `SETUP.md`.
- **Marketing site copy gaps** — founder photos, Brandon's NYU details, first
  real past-work entry.
