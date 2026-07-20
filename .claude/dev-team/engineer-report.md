# Engineer Report
**Task:** A2 — Scaffold `templates/hosted-web/` hosted-app starter wired to `@bcns/app-core`.
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19
**Commit:** c348e04

## Design Decisions
- New package `@bcns/hosted-web-template` (`private:true`) at `templates/hosted-web/`, Next.js App Router + TS strict.
- Added `templates/*` to `pnpm-workspace.yaml` so `workspace:*` deps (`@bcns/ui`, `@bcns/config`, `@bcns/app-core`) resolve and `pnpm --filter` works. Documented that on extract-to-own-repo these become versioned `@bcns/*` registry deps (Needs-Nate).
- Test runner: **`tsx --test`** (added `tsx ^4.23.1` devDep) — raw Node ESM can't follow `@bcns/app-core`'s extensionless re-exports; tsx does bundler-style resolution.
- AI opt-in via env `AI_ENABLED`; separate `lib/ai.ts` imports app-core `createAnthropicClient`, only invoked when flag on.
- Webhook `app/api/stripe/webhook/route.ts` maps event → app-core `decideFromEvent` (provision/suspend). Signature-verification is a documented stub (no real Stripe SDK call); the decision routes through A1 pure logic.

## Files Changed
- `pnpm-workspace.yaml` — added `templates/*` glob
- `templates/hosted-web/package.json` — new pkg, workspace deps, `tsx --test` scripts
- `templates/hosted-web/lib/{env,ai,webhook}.ts` — env-driven config (safe defaults when keys absent), opt-in AI, webhook decision helper
- `templates/hosted-web/app/api/stripe/webhook/route.ts` — webhook route
- `templates/hosted-web/app/{layout,page}.tsx` — minimal page
- `templates/hosted-web/tests/{ai-optin,webhook}.test.mjs` — opt-in boundary + webhook→suspend tests
- `templates/hosted-web/.env.example` — DATABASE_URL, Clerk, Stripe, ANTHROPIC_API_KEY placeholders (no real secrets)
- `templates/hosted-web/{README.md,Dockerfile,DEPLOY.md}` — taxonomy frontmatter, multi-stage build, Coolify/Cloudflare/Neon/Clerk deploy notes

## Commands
- Build: `corepack pnpm --filter @bcns/hosted-web-template build`
- Dev (port 3100): `corepack pnpm --filter @bcns/hosted-web-template dev`
- Test: `corepack pnpm --filter @bcns/hosted-web-template test`

## Notes
- Engineer self-verified: build OK; dev `/` → HTTP 200 with AI off + no keys; webhook `past_due`→`{"decision":"suspend"}`; no real secrets committed; web build + app-core tests still green.
- This report was reconstructed after the original working-tree report was lost (not committed with c348e04).
