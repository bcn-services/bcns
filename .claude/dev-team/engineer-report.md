# Engineer Report
**Task:** PLAN.md A4 — update repo docs (CLAUDE.md, README.md) to the per-client-repo model
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Docs-only change; no architecture/API/data work. Aligned CLAUDE.md + README.md to the A3 ADR (`docs/architecture/hosted-web-model.md`).
- Framed the monorepo as the **platform repo** (marketing site + DeLuca's + shared packages + template source); client apps live in their own repos.
- New client apps: generated from `templates/hosted-web/`, consuming `@bcns/ui`/`@bcns/config`/`@bcns/app-core` **by version** (not `workspace:*`); propagate via version bump.
- Left the generic "auto-picked up by workspace glob" line in CLAUDE.md Architecture (line 29) — it describes platform apps/packages tooling, not client-app placement, so still accurate.

## Files Changed
- `CLAUDE.md` — rewrote "What this repo is" (platform-repo framing, added `apps/delucas`, `packages/app-core`, `templates/hosted-web`) and replaced "Adding a client app later" monorepo steps with per-client-repo-from-template steps; both point at the ADR.
- `README.md` — rewrote intro (platform framing + ADR link), file tree (added delucas/app-core/hosted-web, "platform-owned apps only"), and "Adding a client app later" section (per-client repo + ADR link).

## Grep for stale phrasing (acceptance #3)
Ran (docs, excluding node_modules + `.claude/dev-team/`):
`grep -rni "Create \`apps/<client|auto-picked-up by the workspace glob|Reserved for future app starters|reserved for future client app" --include="*.md"`
→ **0 matches** (exit 1). No doc still asserts the monorepo-only client model. (`.claude/dev-team/team-memory.md` / `analyze-report.md` mention the old phrasing only as historical notes; not instructions, not modified.)

## Build check (acceptance #4)
`corepack pnpm --filter web build` → **succeeds** (all routes prerendered).

## Deferred / Out of Scope
- Did not touch CLAUDE.md commands/conventions/env-var sections or the generic monorepo-tooling line (per task constraint).

## Flags for Reviewer
- None — docs-only. Verify the ADR relative links resolve from repo root.
