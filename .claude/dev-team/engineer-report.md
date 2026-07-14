---
# Engineer Report
**Task:** A1 — Content-model data layer for bcns web app
**Branch:** worktree-experimental-overnight-first-draft
**Date:** 2026-07-13

## Design Decisions
- Added `apps/web/lib/content.ts` as the single export (`siteContent`) with one typed interface per section — clean module boundary, callers import one symbol
- Section interfaces use flat scalar fields + fixed-length tuple arrays (e.g. `[string, string, string]`) to enforce count parity with component icon arrays at the type level
- Icons stay in component files as parallel `const` arrays indexed by position; accessed with non-null assertion (`icons[index]!`) because tuple lengths are statically matched
- All copy fields set to `[SLOT: section/field-name]` placeholder strings — no marketing copy in the registry
- Step numbers (`"01"`, `"02"`, `"03"`) kept as neutral structural defaults, not SLOT placeholders — they are ordinal structure, not copy
- `siteConfig` in `site.ts` unchanged — name/domain/email remain single-source there; contact highlight-3-description becomes a SLOT (no runtime email interpolation in registry)
- No new library dependencies introduced

## Files Changed
- `apps/web/lib/content.ts` — new file; exports `SiteContent` + six section interfaces + `siteContent` registry with SLOT placeholders
- `apps/web/components/hero.tsx` — imports `siteContent.hero`; removed local `proofPoints` array and hardcoded badge/h1/p/CTA strings
- `apps/web/components/problem-solution.tsx` — imports `siteContent.problemSolution`; removed local `problems` array; icons mapped by index
- `apps/web/components/how-it-works.tsx` — imports `siteContent.howItWorks`; removed local `steps` array; icons mapped by index
- `apps/web/components/delivery-models.tsx` — imports `siteContent.deliveryModels`; removed local `models` array; icons mapped by index
- `apps/web/components/use-cases.tsx` — imports `siteContent.useCases`; removed local `useCases` array; icons mapped by index
- `apps/web/components/contact-section.tsx` — imports `siteContent.contactSection`; removed local `highlights` array + `siteConfig.email` interpolation; icons mapped by index

## Done-When Criteria
- [x] `pnpm lint` green
- [x] `pnpm typecheck` green
- [x] `pnpm build` green
- [x] All 6 sections render from `siteContent` (no hardcoded marketing sentences in component bodies)
- [x] Every content field is a `[SLOT: …]` placeholder or neutral structural default (step numbers)
- [x] No visual/styling changes — zero className or JSX structure edits

## Deferred / Out of Scope
- `site-header.tsx` CTA "Book a free consult" and `site-footer.tsx` legalLinks array not in task scope — left as-is
- `siteConfig.tagline` / `siteConfig.description` (used in layout.tsx metadata) not moved to content registry — out of scope per task spec

## Flags for Reviewer
- Icon index lookup uses `!` assertion — safe because tuple lengths match, but future maintainers adding items must keep icon arrays in sync
---
