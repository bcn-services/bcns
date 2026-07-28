# Dev-team memory log

## Standing notes

**Repo layout / commands**
- Turbo root `pnpm lint` / `pnpm typecheck` are BROKEN ("cannot find binary path") — run per-package from `apps/web`.
- **Run the web suite with `corepack pnpm test` from the repo root** (Turbo: builds first, then tests — `turbo.json` `test` task is `dependsOn: ["build"]`, `cache: false`). `corepack pnpm --filter @nseluga/web test` runs it without building. Both exit non-zero on failure (verified by probe injection). Expect **12 files / 52 tests / 0 fail / 0 skip** with a build present; without a build, 51 pass + 1 skip and b3 reports 3 skipped sections — that is the correct clean-tree result, not a regression.
- Underlying command is still `cd apps/web && node --experimental-strip-types --test __tests__/*.mjs`; the `--experimental-strip-types` flag is REQUIRED (tests import `lib/content.ts` directly). Node 22.14. Deps via `corepack pnpm install`. Do NOT add `"type": "module"` to `apps/web/package.json` despite Node's warning — it breaks the CJS `postcss.config.js`/`tailwind.config.js` the Next build needs.
- `templates/*` IS in the pnpm-workspace glob (installable member) alongside `apps/*` and `packages/*`.
- Packages are `@nseluga/*` (ui, config, app-core) — older notes said `@bcns/*`; the scope was renamed.
- DeLuca's app was extracted out of this repo to `~/bcns-client-delucas`. L2 Detailz lives in `~/bcns-client-l2detailz`.

**Test suite (all 12 files GREEN as of 2026-07-27 — the stale-test backlog below is CLEARED)**
- The registry has NO `problemSolution`, NO `deliveryModels`, NO `aboutFounder` — removed/restructured in B2/B3, intentional. Successors: `siteContent.about` + `about.founders[]` (array; each has `name, roleLine, photo, bio, credentials`). Never re-add the old keys to make a test pass.
- `pastWork.items` and `reviews.items` are intentionally EMPTY; each section renders a `holdingState` instead. Tests assert "non-empty items OR populated holdingState", so they keep passing when a later item seeds `items`.
- `b3-copy-wiring` and `w3-hosting-explanation` assert against `.next/server/app/*.html`. They skip LOUDLY (stderr `⚠️` + `# SKIP`) when the build is absent — that is why root `pnpm test` depends on `build`.
- Built-HTML literal checks in `b3` run through `stripTags()` first: the layout-loop wraps accent words in inline `<span>`s, so a raw `includes()` on markup breaks even when the copy is correct. Use the same treatment for any new built-HTML copy assertion.
- Registry-wide invariant is now "no string field ships empty" (was "every string is a `[SLOT: ...]` or step number" — obsolete once real copy landed in B3).

**Content conventions**
- `apps/web/lib/content.ts` is the single source of truth for copy; `apps/web/CONTENT.md` is its 1:1 mirror — `w4-content-mirror.test.mjs` gates it.
- APPEND new `faq.items` (never insert) so index-based assertions in `b3` stay green.
- Scope em-dash / copy greps to `content.ts` source or `git diff` — rendered HTML carries pre-existing em-dashes from `site.ts` OG metadata.
- En-dash (`–`) in shell grep silently mismatches; use Python for exact-string checks with Unicode range chars.
- `apps/web/scripts/readability-check.py` exists for copy passes (FK grade).
- `problem-solution.tsx` and `delivery-models.tsx` return `null` — kept but inert.

**Process**
- dt-* agents write `*-report.md` to the working tree but usually do NOT commit it. The orchestrator must `git add .claude/dev-team/` with the outcome commit, and must never `git checkout` a report file.
- Any agent that starts a dev server must background it with a bounded poll and always kill it.
- Every IPC/handler that accepts a key/value pair needs an explicit ALLOWED_KEYS allowlist — recurring gap across every prior build item here.
- Built-HTML Python string checks against `.next/server/app/*.html` are the right un-mocked behavioral gate for content changes.
- Parallel-group branches conflict only on `.claude/dev-team/*-report.md` (add/add) — resolve `--theirs`, not a real overlap.

## Recent runs

## 2026-07-19 — dev-team-auto — A1 @nseluga/app-core package
- **Outcome:** DONE — 1 build + Opus review + 1 Opus fix pass (full track, flag:money, branch dev-team/model-migration-run, commit 99b0b94)
- **What happened:** flag:money → 2 parallel Opus design sketches, both converged on cents-as-integer. Built packages/app-core (pricing/subscription/anthropic), 54 tests green. Review: 1 Important (PRICING not deep-frozen) + 2 Minor.
- **What worked:** New package = copy `packages/ui` shape exactly. Tests via `tsx` with an explicit `&&` chain in the `test` script (bare glob mis-expands). DI seam for the Anthropic client makes it fully mockable.
- **What failed:** PRICING was compile-time-Readonly only — runtime mutable shared constant.
- **Remember next run:** app-core exports PRICING, INCLUDED_SEATS, PER_SEAT_CENTS, formatUsd, monthlyCharge, setupFeeCents, decideAccess, decideFromEvent, createAnthropicClient, DEFAULT_MODEL. Site pricing still hardcodes strings in content.ts.

## 2026-07-19 — dev-team-auto — A2 templates/hosted-web scaffold
- **Outcome:** DONE — 1 build + Opus security review + 1 Opus fix pass (full track, flag:security, branch dev-team/model-migration-run, commit 3a11c62)
- **What happened:** Scaffolded `@nseluga/hosted-web-template` (Next.js App Router, TS strict), added `templates/*` to the workspace glob. QA ran a live smoke on a real dev server at :3100. Security review caught the Stripe webhook FAILING OPEN even with the secret set; fixer made it fail-closed.
- **What worked:** Live smoke on the real server is the right gate for a route item. Template test runner must be `tsx --test` — raw node ESM can't follow app-core's extensionless re-exports.
- **What failed:** Engineer built the webhook stub fail-OPEN in a clonable template. Also a QA agent died mid-run (FailedToOpenSocket) leaving stale reports.
- **Remember next run:** Real Stripe sig verification is still Needs-Nate before prod.

## 2026-07-19 — dev-team-auto — A3 hosted-web ADR
- **Outcome:** DONE — 1 build attempt, QA PASS (light track, no review, commit 3cac7b5)
- **What happened:** Authored `docs/architecture/hosted-web-model.md` from the PLAN decisions table.
- **What worked:** For a docs ADR, a committed node string-presence check (`docs/architecture/__tests__/hosted-web-model.check.mjs`) is a cleaner, more durable gate than a prose read.
- **What failed:** nothing.
- **Remember next run:** The ADR has a `__tests__/` content-check beside it.

## 2026-07-19 — dev-team-auto — A4 repo docs to per-client-repo model
- **Outcome:** DONE — 1 build + QA FAIL + 1 fix pass (light track, no review, commit 49d72eb)
- **What happened:** Reframed CLAUDE.md + README.md to the per-client-repo model. QA FAILED on accuracy — both docs described app-core as "auth, DB, AI, billing", which it is not.
- **What worked:** Adding an explicit ACCURACY criterion to QA ("does the doc's description match what was actually built?") caught a plausible-but-false claim a presence-only grep would have passed.
- **What failed:** Engineer invented capabilities (auth, DB) that don't exist — the "assert what should be true, not what is" family.
- **Remember next run:** Do this on any doc item describing code built earlier in the same run.

## 2026-07-20 — layout-loop — v3 full visual run
- **Outcome:** DONE — merged to main 2026-07-20.
- **What happened:** Fraunces serif accent wired globally, `components/reveal.tsx` (single IntersectionObserver + reduced-motion no-op), `drift`/`shimmer` keyframes in the Tailwind preset, shared hover-lift/glow utilities, `SectionHeading` opt-in serif accent; per-page loops for `/`, `/services`, `/pricing`, `/about`, `/work`.
- **What worked:** A shared Phase-0 foundation before the per-page loops kept one motion vocabulary across all five pages.
- **What failed:** nothing notable.
- **Remember next run:** Any new page MUST reuse `Reveal`, the shared hover-lift/glow utilities, and `SectionHeading` — do not invent a second motion vocabulary or rebuild `signature-motif.tsx`. Brand: one accent hue, pastel-blue `#7CB3FF` on charcoal-purple `#15131F`, no photography. See `LAYOUT_LOOP_REPORT.md`.

## 2026-07-27 21:30 — dev-team-auto — Wire a runnable `test` script for the marketing site
- **Outcome:** DONE — 1 build + 1 QA pass, no fix cycle (light track, branch worktree-past-work-case-studies, commit 80b9448)
- **What happened:** Added `test` to `apps/web/package.json` + root `package.json` and a `test` task to `turbo.json` (`dependsOn: ["build"]`, `cache: false`). Real work was triaging 6 stale test files: re-pointed `aboutFounder` → `about`/`about.founders[]`, dropped `problemSolution`/`deliveryModels`, converted 5 "is a SLOT placeholder" asserts to non-empty-string, replaced `items >= 1` with "items OR holdingState", stripped HTML tags before built-HTML literal checks, and made both build-dependent files skip loudly. 12/12 green.
- **What worked:** Orchestrator adjudicating the baseline FIRST (running every file individually, before and after a build) — the handed-down premise "5 files are stale on problemSolution/deliveryModels" was wrong for 4 of the 5. Only `content-registry` matched it; `a2-*` died on `aboutFounder`, `b2` on filled-in SLOT slots, `b3` purely on the missing build plus one span-wrapped headline. Building first collapsed 10 of 16 failures. **Probe injection** proved all 12 files execute: `node --test`'s TAP names only script-style files, so w1–w4 (real `node:test`) are invisible in output — appending a throwing `test()` to each and confirming `tests 52 → 56, fail 4` is the only honest proof the glob ran them.
- **What failed:** QA ran `git checkout -- apps/web/__tests__/b3-copy-wiring.test.mjs` to revert its own deliberate mutation and destroyed the engineer's uncommitted fix to that file — the exact trap already written in these standing notes. It reconstructed the file by hand; I diffed the reconstruction against the engineer's original (still in my context) and it was faithful, but that was luck, not process. Engineer also left `SLOT_RE.test(v) || STEP_RE.test(v) || v.trim().length > 0` — the first two clauses dead — plus a stale "not a SLOT or step number" failure message; I collapsed both.
- **Remember next run:** Gate the suite with `corepack pnpm test` from the root (see Standing notes for expected counts). When weakening an assertion, ALWAYS mutation-test it — blank the guarded field, confirm the test still fails, restore; the "items OR holdingState" rewrite was the one at real risk of being satisfiable by both being empty (it isn't). Tell every agent to use `cp` backups for temporary mutations, never `git checkout --`, and to verify restores with `shasum -c`.
