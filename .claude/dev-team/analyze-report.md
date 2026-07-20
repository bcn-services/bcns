# Analysis Report
**Task:** Map monorepo workspace-package conventions so A1 can add `packages/app-core/` (`@bcns/app-core`) and A2 can scaffold `templates/hosted-web/`.
**Date:** 2026-07-19

## Relevant Files
- `pnpm-workspace.yaml` — globs ONLY `apps/*` + `packages/*`. `templates/*` NOT in graph (confirmed by templates/README). A1 pkg auto-picked-up; A2 template is NOT a workspace member.
- `package.json` (root) — `packageManager: pnpm@9.15.0`, `engines.node >=18.18.0`; scripts all `turbo run *` (BROKEN here per baseline — use per-package `corepack pnpm`). devDeps: prettier, turbo, typescript ^5.6.3. No root test script.
- `turbo.json` — tasks: build (`dependsOn ["^build"]`, outputs `dist/**` + `.next/**`), dev, start, lint (`^build`), typecheck (`^build`), clean. **No `test` task** — package `test` scripts run via `pnpm --filter`, not turbo.
- `packages/config/package.json` — `@bcns/config`, `type: module`, exports map (below). NO build/lint/test scripts (source-only JS/JSON consumed directly). Base A1 extends.
- `packages/config/tsconfig/{base,react-library,nextjs}.json` — base: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `esModuleInterop`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `isolatedModules`, `declaration: true`; base does NOT set `noEmit`. react-library/nextjs add `noEmit: true`.
- `packages/ui/package.json` + `tsconfig.json` — closest template for a source-only TS package (below). NO build step; consumed as raw `.ts` via exports.
- `apps/delucas/` — has `@anthropic-ai/sdk ^0.39.0` (lock: 0.39.0) AND the test recipe A1 needs: `tsx` ^4.23.1 for `.mjs` tests importing `.ts`.
- `apps/delucas/tests/*.test.mjs` — pure-Node test pattern to copy (node:assert/strict, hand-rolled `test()`, run via `tsx tests/foo.test.mjs`).
- `templates/README.md` — states templates are intentionally OUT of the install graph until promoted to `apps/`.

## Data Flow
- Packages are **source-only, not built**: `@bcns/config` and `@bcns/ui` expose raw `.ts`/`.js` via `exports`; consumers (web, delucas) compile them through their own bundler/tsc. No `dist/` for config/ui. `@bcns/app-core` should follow: export `./src/index.ts` directly, no build step.
- Consumption: dependents list `"@bcns/config": "workspace:*"` (devDep) + `"@bcns/ui": "workspace:*"` (dep); tsconfig `extends "@bcns/config/tsconfig/<preset>.json"`; eslint `import { base } from "@bcns/config/eslint/base"`.

## Patterns to Follow (GROUND TRUTH — copy exactly)
- **`@bcns/app-core` package.json** (model on ui, drop React): name `@bcns/app-core`, `version 0.0.0`, `private true`, `type module`, `exports { ".": "./src/index.ts" }`, scripts `{lint:"eslint .", typecheck:"tsc --noEmit", test:<tsx chain>, clean:"rm -rf .turbo node_modules"}`, deps `{"@anthropic-ai/sdk":"^0.39.0"}`, devDeps `{"@bcns/config":"workspace:*","tsx":"^4.23.1","typescript":"^5.6.3","eslint":"^9.15.0","@types/node":"^22.9.0"}`.
- **`@bcns/app-core` tsconfig.json** (ui's, swap preset to base + add noEmit since no JSX): `{"extends":"@bcns/config/tsconfig/base.json","compilerOptions":{"baseUrl":".","noEmit":true},"include":["src/**/*.ts"],"exclude":["node_modules","dist"]}`. base.json does NOT set noEmit — MUST add it for typecheck-only pkg.
- **eslint.config.mjs** (copy ui's verbatim): `import { base } from "@bcns/config/eslint/base";` newline `export default base;`
- **`@bcns/config` exports** (extend via `"./tsconfig/base.json"`; eslint via `"./eslint/base"`): tsconfig entries map `"./tsconfig/base.json": "./tsconfig/base.json"`.
- Every pkg: `version 0.0.0`, `private: true`, `type: module`.

## Test conventions
- **No package uses vitest/jest** (neither installed; no vitest in `node_modules/.bin`). Two patterns exist: (1) web app `node --experimental-strip-types --test __tests__/*.mjs` (Node built-in runner, imports `.ts`); (2) delucas `tsx tests/*.test.mjs` with `node:assert/strict` + hand-rolled `test()`, NO runner.
- **For pure-TS `@bcns/app-core`, use the delucas `tsx` pattern** — `tsx` already a workspace dep (^4.23.1, in lock), runs `.mjs` importing `../src/x.ts` with zero config, non-zero exit on failure. Do NOT add vitest. `pnpm --filter @bcns/app-core test` runs the chain.
- **`test` script MUST be an explicit `&&` chain like delucas** (`tsx tests/a.test.mjs && tsx tests/b.test.mjs`) — bare glob `tsx tests/*.test.mjs` runs only the first file / mis-expands under zsh. Web-style `node --experimental-strip-types --test tests/*.mjs` also works with zero deps if A1 prefers no `tsx` dep.
- Mock `@anthropic-ai/sdk` via dependency injection / passed-in client — delucas tests are pure, no network.

## Likely Changes
- A1: create `packages/app-core/{package.json,tsconfig.json,eslint.config.mjs,src/index.ts,tests/*.test.mjs}`; run `corepack pnpm install` at root to link + register `@bcns/app-core`.
- A2: create `templates/hosted-web/` — NOT a workspace pkg (glob excludes templates). Stays out of install graph by design.

## Risks
- **`templates/*` deliberately outside workspace glob** — A2's `templates/hosted-web/package.json` won't be installed/linked; `workspace:*` deps inside won't resolve unless glob extended. Confirm A2 intent (clone-starter vs. live member); default is clone-starter (leave glob alone).
- Root turbo scripts BROKEN (baseline): verify A1 with `corepack pnpm --filter @bcns/app-core test|typecheck|lint`, never root `pnpm test`.
- base.json sets `declaration: true` + no `noEmit`; app-core tsconfig MUST override `noEmit: true` (react-library/nextjs presets do; base does not).
- `@anthropic-ai/sdk` pinned `^0.39.0` in delucas — match exactly for lockfile consistency.
- `tsx` glob expansion quirk — use explicit `&&` test chain (see Test conventions).
