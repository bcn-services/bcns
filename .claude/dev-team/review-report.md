VERDICT: APPROVED
Branch: worktree-past-work-case-studies
Date: 2026-07-27
Files Reviewed: 5 (apps/web/__tests__/{b3-copy-wiring,b2-registry-rework}.test.mjs, apps/web/CONTENT.md, STANDARDS.md, apps/web/lib/content.ts cross-check)
Critical: 0
Important: 0
Minor: 0

## Resolved findings (confirmed)
- IMPORTANT 1 (CONTENT.md drift) — RESOLVED: screenshots container row added at CONTENT.md:950; table now has 91 `|`-rows (89 excl. header/separator), matches "Total registry fields: 89" at line 1009; arithmetic (82+7, 7 names enumerated) reconciles; no other stale count found in file (grep for lingering 80/87 turned up only unrelated "≤80 chars" style guidance).
- IMPORTANT 2 (hand-synced allowlist) — RESOLVED, deviation verified correct: fixer replaced whole-string `/^\[INPUT: .+\]$/` (my original prescription) with the substring `/\[INPUT:[^\]]+\]/g` regex shared with the HTML-extraction side. Confirmed against content.ts:439,449 — `about.founders[1].bio` and `.credentials[0]` embed the INPUT token mid-string followed by trailing real prose/text; a whole-string walk would never have added these tokens to REGISTRY_INPUT_TOKENS, and since they render on /about, section [3] would false-fail on legitimate content. The deviation is necessary and correct, not a weakening — the HTML side already extracted substrings pre-fix, so registry-side strictness is unchanged, and the actual anti-fabrication gate for delucas/l2detailz narrative fields (whole-string regex) lives untouched in past-work-case-studies.test.mjs.
- Walk correctness — collectTokens recurses via `Object.values` (covers arrays and nested objects, e.g. founders[].credentials[]), guarded by `typeof node==="object"` with the `node &&` null-check; non-empty-set assertion at b3:130-134 catches total derivation failure. No coverage gap found.
- Entity-decode order — `&amp;` decoded last is correct: decoding lt/gt/quot/apostrophe entities first cannot spuriously match `&amp;...` substrings (the inserted `amp;` breaks the pattern), so no double-decode corruption; fixer's own probe test (apostrophe token) plus my own trace through an `&`+`'` combined case confirm round-trip fidelity. No token in content.ts today contains `&` inside an `[INPUT: ...]` bracket, so this is defense-in-depth, not exercised by real content — not a gap.
- Shared `/g/` regex statefulness — INPUT_TOKEN_RE is only ever used via `.match()` (b3:63,148), never `.test()`/`.exec()`; confirmed by grep. `String.prototype.match` resets lastIndex to 0 both before and after a global match per spec, so sharing the object across `collectTokens` and the per-route HTML loop is safe.
- MINOR 1 (b2 items.length) — RESOLVED: `pastWork.items.length === 2` added at b2-registry-rework.test.mjs:196-199, mutation-provable per fix-report.
- MINOR 2 (b3 outcome coverage) — RESOLVED: delucas/l2detailz outcome placeholder assertions added at b3-copy-wiring.test.mjs:278-284, alongside the existing title assertions.
- STANDARDS.md — RESOLVED: rewritten INPUT-convention bullet ("those two surfaces only") and new Content Registry Testing bullets accurately reflect the derived-allowlist implementation; diff confirms only the two prescribed hunks changed, no unrelated edits. No stale rule survives.

## Governing constraint
No regression: content.ts narrative fields (title/problem/approach/outcome) on both delucas and l2detailz remain literal `[INPUT: ...]` strings, byte-identical to CONTENT.md's Needs-Nate table (14/14 tokens match). content.ts itself was untouched by this fix pass (fix-report's byte-identity claim confirmed via git status — only CONTENT.md, the two test files, and STANDARDS.md changed).

## STANDARDS.md Updates
None (re-review — see fixer's own STANDARDS.md edits, confirmed accurate above).
