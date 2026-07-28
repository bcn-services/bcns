---
# QA Report (SCOPED RE-GATE)
**Task:** Confirm 4 fix-pass findings on PLAN item 2 (past-work case studies)
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27
**Gate mode:** tests+behavioral

## VERDICT: PASS

## Criteria Checked
- b3 [3] executes against real built HTML, not skipped — `corepack pnpm test` (Turbo build) — `# tests 62 # pass 62 # fail 0 # skipped 0` — PASS
- b3 non-empty-set guard is non-vacuous — mutated walk to collect nothing (backup/restore via cp+shasum) — guard FAILed (`derived 0 token(s)`) + cascaded 16 more FAILs; restored, shasum OK — PASS
- b3 self-maintaining derivation, incl. apostrophe token — added `[INPUT: probe's token]` to `pastWork.description`, full rebuild — PASSed as registry-defined with zero test edits (`work.html: "[INPUT: probe's token]" is registry-defined`); restored, shasum OK matches fixer's `69c1be83…075a` — PASS
- b3 new `outcome` placeholder assertions non-vacuous — same rebuild, mutated `delucas.outcome` → `v2` — `FAIL: work.html contains delucas outcome placeholder` (exactly 1 real fail, `l2detailz` unaffected); restored, shasum OK — PASS
- b2 `items.length === 2` non-vacuous — dropped `l2detailz` entry, backup/restore — `FAIL: pastWork.items is seeded with the 2 case-study entries — got 1`; restored, shasum OK — PASS
- CONTENT.md `screenshots` container row present + arithmetic correct — independent Python recount of cross-check table (`## Cross-check` → `Total registry fields:`) — 89 data rows, matches prose's "Total registry fields: 89" exactly — PASS
- `w4-content-mirror.test.mjs` still passes — confirmed in full-suite run (its 19 `CONTENT.md documents pricing value...` subtests all `ok`) — PASS
- CONTENT.md 1:1 mirror of content.ts for pastWork narrative fields — read both files directly, all 8 `[INPUT: ...]` tokens byte-identical across files — PASS
- STANDARDS.md :33 describes "two surfaces" (content.ts, CONTENT.md), :47 describes runtime derivation + substring regex + entity-decode — read against actual b3 code — accurate, matches implementation — PASS (see Minor note)
- No regression, full suite green — `corepack pnpm test` run twice (pre- and post-mutation-restore) — both `# tests 62 # pass 62 # fail 0 # skipped 0`; `typecheck` clean — PASS
- Governing constraint: no fabricated client copy — read `content.ts` pastWork block + CONTENT.md Needs-Nate table directly — all `title`/`problem`/`approach`/`outcome` on both `delucas`/`l2detailz` are literal `[INPUT: ...]` strings in both files — PASS

## Minor note (non-blocking)
STANDARDS.md:47 lists decoded entities as `&#x27;, &amp;, &quot;, &lt;, &gt;` but the actual `decodeEntities()` (b3-copy-wiring.test.mjs:73-80) also handles `&#39;` — the list is incomplete (5 of 6 entities named). Does not misdescribe behavior (the rule "decode entities first" is correct) and no test depends on the prose being exhaustive. Not blocking.

## Tests Added
- None — this is a scoped re-gate confirming the fixer's own test/doc changes via mutation testing, not new test authorship.

## Not Verifiable
none
