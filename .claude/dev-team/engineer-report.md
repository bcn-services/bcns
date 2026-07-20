# Engineer Report
**Task:** Add `packages/app-core/` (`@bcns/app-core`) — pricing/billing math, subscription access decisions, BYOK Anthropic client factory.
**Branch:** dev-team/model-migration-run
**Date:** 2026-07-19

## Design Decisions
- Source-only workspace package (no build step) mirroring `packages/ui` exactly: `version 0.0.0`, `private`, `type:module`, `exports {".":"./src/index.ts"}` — consumers compile raw `.ts`.
- tsconfig `extends @bcns/config/tsconfig/base.json` + `noEmit:true` (base lacks it, unlike react-library/nextjs) since this is typecheck-only.
- Money as integer cents throughout; every rate/threshold lives once in `pricing.ts` (`INCLUDED_SEATS`, `PER_SEAT_CENTS`, `PRICING`) — functions read from it, no duplicated magic numbers.
- `decideAccess` is an exhaustive `switch` with NO `default` — a future `SubStatus` becomes a compile error, not silent fall-through.
- `createAnthropicClient` takes a DI seam (`deps.ClientCtor`), never reads `process.env`; throws `MissingApiKeyError` on missing/empty/whitespace key (trim-then-check). Default model tagged on client via non-enumerable `defaultModel`.
- `DEFAULT_MODEL = "claude-haiku-4-5"` (exact current cheap model; not `claude-3-5-haiku-*`).
- `index.ts` uses extensionless re-exports (tsc/Bundler resolution); tests import `../src/x.ts` with extension (run under `tsx`).
- Tests: delucas `tsx` pattern — `.mjs` + `node:assert/strict`, hand-rolled `test()`, explicit `&&` chain (no bare glob). `@anthropic-ai/sdk ^0.39.0` to match delucas/lockfile.

## Files Changed
- `packages/app-core/package.json` — new pkg manifest, tsx test chain, SDK dep.
- `packages/app-core/tsconfig.json` — extends base + `noEmit:true`.
- `packages/app-core/eslint.config.mjs` — re-exports `@bcns/config/eslint/base`.
- `packages/app-core/src/pricing.ts` — cents constants, `PRICING`, `formatUsd`, `monthlyCharge`, `setupFeeCents`, seat guard.
- `packages/app-core/src/subscription.ts` — `decideAccess` (exhaustive), `decideFromEvent`, event type.
- `packages/app-core/src/anthropic.ts` — `DEFAULT_MODEL`, `MissingApiKeyError`, DI `createAnthropicClient`.
- `packages/app-core/src/index.ts` — re-exports all public symbols.
- `packages/app-core/tests/{pricing,subscription,anthropic}.test.mjs` — 24 unit tests.
- `pnpm-lock.yaml` — links `@bcns/app-core` via `corepack pnpm install`.

## Deferred / Out of Scope
- No real network/integration test against Anthropic (DI mock only, by design); QA may add more.
- `defaultModel` stored via `Object.defineProperty` (SDK type has no such field) — runtime tag, not a typed property.

## Flags for Reviewer
- `createAnthropicClient` is the only external-boundary constructor; no retry/timeout hardening here (caller's concern).
- `formatUsd` rounds to whole dollars — fine for current whole-dollar prices; would lose cents on sub-dollar amounts.

## Test script used
`tsx tests/pricing.test.mjs && tsx tests/subscription.test.mjs && tsx tests/anthropic.test.mjs`
