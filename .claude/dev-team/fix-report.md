---
# Fix Report
**Date:** 2026-07-27
**Findings addressed:** 4 of 4 (0 QA failures — QA verdict was PASS + 4 review findings: 2 Important, 2 Minor)

## Changes Made
- apps/web/CONTENT.md:950 — added the missing `pastWork.items[n].screenshots` container row to the cross-check table — review Important
- apps/web/CONTENT.md:1009 — field-count arithmetic re-derived from the file: `87 (80 + 7)` → `89` (82 rows at HEAD + 7 new names, now all 7 enumerated incl. `screenshots`); counting method stated inline — review Important
- apps/web/__tests__/b3-copy-wiring.test.mjs:52-79 — hand-listed `APPENDIX_INPUT_TOKENS` deleted; `REGISTRY_INPUT_TOKENS` now derived by recursive walk of `siteContent` extracting `/\[INPUT:[^\]]+\]/g` — review Important
- apps/web/__tests__/b3-copy-wiring.test.mjs:73-79 — added `decodeEntities()` (`&#x27; &#39; &quot; &lt; &gt; &amp;`, `&amp;` last) applied to each HTML-extracted token before the Set lookup — review Important
- apps/web/__tests__/b3-copy-wiring.test.mjs:129-134 — added `REGISTRY_INPUT_TOKENS.size > 0` guard so a broken walk can't silently vacuum the section — review Important
- apps/web/__tests__/b2-registry-rework.test.mjs:194-199 — added `pastWork.items.length === 2` above the unconditional `holdingState.title` assertion, plus a pointer comment to `past-work-case-studies.test.mjs` — review Minor
- apps/web/__tests__/b3-copy-wiring.test.mjs:274-283 — added `delucas`/`l2detailz` `outcome` placeholder assertions to the built work.html spot-check alongside `title` — review Minor
- STANDARDS.md:33,47 — retired the "three byte-identical surfaces" and "`APPENDIX_INPUT_TOKENS` hand-sync hazard" bullets (both stale the moment the allowlist became derived); replaced with the derivation + entity-decode rule — downstream-surface sweep, not a listed finding

## Extraction is substring, not whole-string (deviation from the review's literal wording)
- Review prescribed `/^\[INPUT: .+\]$/` whole-string matching; `content.ts:447,449` embed tokens mid-string (`about.founders[1].bio`, `credentials[0]`), so a whole-string walk would have missed 2 tokens that DO render on /about and section [3] would have false-failed. Used the same `/\[INPUT:[^\]]+\]/g` regex as the HTML side — symmetric by construction.

## Field-count method and number
- Counted with python over `CONTENT.md`: lines between `## Cross-check` and `Total registry fields:` starting with `|`, excluding the header and `|---` separator rows. HEAD = 82 rows (prose claimed 80 — already off by 2 before this pass); working tree pre-fix = 88 (prose claimed 87); post-fix = **89**, and the prose now says 89. Prose and table reconcile exactly.

## Verification
- `corepack pnpm test` (repo root, Turbo builds first) — 3/3 tasks green, `# pass 62 # fail 0 # skipped 0`; b3 46 passed / 0 skipped (+3 assertions), b2 78 passed (+1). TAP total stayed 62 by construction: b2/b3 are script-style files that keep their own counters and are not node:test subtests.
- `corepack pnpm --filter @nseluga/web typecheck` — clean.
- **Probe proof (derived allowlist):** injected `[INPUT: temporary probe token]` + `[INPUT: probe's apostrophe token]` into `pastWork.description` (renders on /work), full root `pnpm test` with build → section [3] **PASS** on both, incl. the apostrophe one arriving as `[INPUT: probe&#x27;s apostrophe token]` in raw HTML (verified by grep on `.next/server/app/work.html`). Under the old hand-listed allowlist both would have FAILed. Probe removed, rebuilt, re-run → green.
- **Mutation proof (b2 Minor 1):** removed the `l2detailz` entry from `content.ts` → `FAIL: pastWork.items is seeded with the 2 case-study entries — got 1`. The assertion is not satisfiable regardless of the code.
- **Mutation proof (b3 Minor 2):** `delucas.outcome` → `[INPUT: delucas outcome v2]`, full build+test → `FAIL: work.html contains delucas outcome placeholder` (l2detailz still PASS). Same run: section [3] **PASSed** on the never-before-seen `[INPUT: delucas outcome v2]` token with zero test edits — second independent confirmation the derivation self-maintains.
- All mutations via `cp` to `/tmp/content.ts.bak` + restore + `shasum -a 256 -c` OK (`69c1be83…075a`); no `git checkout`/`stash`/`reset` used anywhere. `apps/web/lib/content.ts` is byte-identical to its pre-session state — no source change was needed.

## Disputed
- None.

## Deferred
- None.
