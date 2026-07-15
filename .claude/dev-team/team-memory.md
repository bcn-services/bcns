# Dev-team memory log

## 2026-07-15 — dev-team-auto — C1 Voice + content pass
- **Outcome:** DONE — 2 attempts (light track, branch worktree-agent-afb098493a86a56c1, commit 419a05f)
- **What happened:** Rewrote content.ts for voice/copy pass. Engineer missed the second `$` inside en-dash price ranges ("$2,000–5,000" instead of "$2,000–$5,000"). QA caught it on first pass. Bug Fixer patched in one step. QA re-gate PASS. FK readability grade 4.4 (threshold 8.0). Readability check script committed at apps/web/scripts/readability-check.py.
- **What worked:** Light track correct — copy-only change, single file. QA grep for exact price strings (using Python to avoid shell en-dash encoding issues) reliably caught the format bug.
- **What failed:** Engineer forgot the second dollar sign inside the en-dash range on both build tiers. grep on the orchestrator side silently failed to match due to en-dash encoding; QA used Python to catch it correctly.
- **Remember next run:** En-dash (`–`) encoding in shell grep can silently mismatch — use Python or `python3 -c "import subprocess; ..."` for exact-string checks involving Unicode range characters. The readability script is now at apps/web/scripts/readability-check.py for future copy passes.

## 2026-07-14 — dev-team-auto — B4 CONTENT.md + trackers updated
- **Outcome:** DONE — 1 attempt (light track, branch feat/b1-multi-page-routing, commit e6642bc)
- **What happened:** Rewrote CONTENT.md 1:1 with new registry (77 fields). QA PASS first attempt, 49 assertions.
- **What worked:** Cross-check count (77 fields ↔ 77 CONTENT.md entries) is a reliable completeness signal.
- **What failed:** nothing notable.
- **Remember next run:** Section 1 complete. layout-loop runs Section 2 (per-page visual passes). The worktree branch `feat/b1-multi-page-routing` is now merged into `experimental-v2`.

## 2026-07-14 — dev-team-auto — B3 Wire the drafted copy
- **Outcome:** DONE — 1 attempt (light track, branch feat/b1-multi-page-routing, commit 08f533e)
- **What happened:** Replaced all [SLOT:] values in content.ts with verbatim appendix copy. Engineer also stubbed problem-solution.tsx and delivery-models.tsx to return null (they imported removed registry fields). QA PASS on first attempt, 88 assertions.
- **What worked:** Light track with static analysis QA (read content.ts + build output) — no server needed.
- **What failed:** nothing notable.
- **Remember next run:** problem-solution.tsx and delivery-models.tsx now return null — kept in repo but inert. pageMeta fields are still [INPUT:] slots (no appendix entries). ctaHref fields in holding state wired to `/#contact` — fine for now.

## 2026-07-14 — dev-team-auto — B2 Registry rework: nav cards, two-founder about, pricing shape, /work holding state
- **Outcome:** DONE — 1 attempt (full track, branch feat/b1-multi-page-routing, commit e6fc921)
- **What happened:** Reworked content.ts registry: added NavCardsContent (4-item), replaced aboutFounder with AboutContent (2-founder tuple + whyBcns), added HoldingState+ctaHref to pastWork/reviews, 3-tier pricing. Review caught 2 Important issues (fragile STRUCTURAL_KEYS exclusion in test, hardcoded href in holding-state CTAs). Fix agent resolved both. Re-QA PASS.
- **What worked:** Keeping engineer export name unchanged (`AboutFounder`) prevented B1 test regressions. Path-suffix exclusion pattern (`path.endsWith('.href')`) is the right fix for structural URL fields in SLOT validators.
- **What failed:** Engineer hardcoded `"/#contact"` in holding-state CTAs instead of putting it in the registry — review caught it.
- **Remember next run:** B3 wires the copy appendix verbatim into content.ts — expect zero [SLOT:] remaining after. The content-registry test (188 assertions) will catch any missed SLOT replacements. ctaHref slots in pastWork.holdingState and reviews.holdingState still need real URLs in B3 (they're `[SLOT:]` now).

## 2026-07-14 — dev-team-auto — B1 Multi-page routing + thin home
- **Outcome:** DONE — 1 attempt (full track, branch feat/b1-multi-page-routing, commit c8ebab4)
- **What happened:** Converted single-page app to 5-page site. Engineer created 4 new route pages + NavCards component, updated nav to page links, fixed href anchors. QA PASS on first attempt. Review found 2 Important issues (missing /about card in NavCards, no fetch timeout in contact-form). Fix agent resolved both. Re-QA PASS.
- **What worked:** dt-analyze map correctly identified all anchor-link breakage risks (logo #top, #contact, #examples) before the engineer touched them — all pre-empted. Full-track with analyze pays off on structural rewrites.
- **What failed:** Review caught that nav-cards had only 3 cards, missing /about — engineer didn't add it despite it being in the PLAN.md decisions. Always verify nav-cards match the full nav spec.
- **Remember next run:** NavCards must mirror all 4 siteConfig.nav routes. contact-form.tsx fetch never had a timeout — already fixed in c8ebab4. B2 reworks content.ts registry shape significantly; expect type errors across all components that read the current registry.
