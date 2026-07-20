# Engineer Report
**Task:** PLAN.md A3 — Architecture decision record for the hosted-web business & delivery model
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Docs-only item: no code/architecture change. Authored a single ADR at `docs/architecture/hosted-web-model.md` in standard Context / Decision / Consequences form.
- Sourced every fact from PLAN.md "Decisions locked (2026-07-18)" table; no invented figures.

## Sections Documented
- **Pricing & seat model** — setup $1,000/$3,000 + recurring $149/$349, 15 seats then $20/seat/mo, with rationale.
- **BYOK-AI** — clients attach own Anthropic key, billed by Anthropic, opt-in, default Haiku, key encrypted, never in repo.
- **Hosting stack** — Coolify/Hetzner + Cloudflare + Neon + Clerk + Stripe; operating cost ~$25-75/mo (~10 clients), revisit past ~$150-200/mo; risk/mitigation table (single-VPS blast radius, DDoS, lock-in, secrets).
- **Repo model** — one repo per client, with explicit note it reverses old Part II "monorepo, separate repos rejected" and why.
- **Shared-package + template propagation** — `@bcns/ui`/`@bcns/config`/`@bcns/app-core` + `templates/hosted-web/` starter; version-bump propagation.
- Explicit references to `@bcns/app-core` and `templates/hosted-web/` (relative links, verified paths).

## Files Changed
- `docs/architecture/hosted-web-model.md` — new ADR (only file added).
- `.claude/dev-team/engineer-report.md` — this report.

## Verification
- `corepack pnpm --filter web build` succeeds (docs-only change, confirmed green).
- Valid Markdown; references to both artifacts resolve to real paths.

## Deferred / Out of Scope
- No changes to `apps/web` content or any other `.claude/dev-team/*.md`.

## Flags for Reviewer
- None (documentation only, no runtime/hot-path code).
