---
# Engineer Report
**Task:** PLAN.md item 3 — Add `apps/web/app/work/[slug]/page.tsx`, a dynamic route rendering one case study from `siteContent.pastWork.items`.
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27

## Design Decisions
- Single `getCaseStudy(slug)` lookup helper colocated in `page.tsx`, used by `generateStaticParams`, `generateMetadata`, and the page body — prevents lister/guard drift between the three exports (named recurring defect family in this repo).
- `generateStaticParams` returns exactly `{ slug }` per registry item; `dynamicParams` left at its Next.js default (true) so an unknown slug 404s via `notFound()` rather than being blocked at the router level.
- New `PastWorkContent.caseStudy: CaseStudyLabels` registry object (`problemLabel`/`approachLabel`/`outcomeLabel`) — keeps the three section labels out of the component per the content-registry rule, mirrored 1:1 into `CONTENT.md`.
- Reused `SectionAtmosphere variant="work"` and `Reveal` rather than adding a new atmosphere variant or motion vocabulary — same visual family as `/work`.
- `generateMetadata` sources `title`/`description` from the found item (`item.title` / `item.outcome`); falls back to `pageMeta.work.title` only (no description) when the slug is unknown, so the fallback stays benign and the page body still 404s.
- Skipped a dedicated back-link (and its CONTENT.md label): `SiteHeader`'s nav already has a persistent "Work" link, so return navigation exists without a new content field — lazier alternative per the task's own "only if you render a back link" carve-out.

## Files Changed
- `apps/web/app/work/[slug]/page.tsx` — new file: Server Component with `getCaseStudy`, `generateStaticParams`, `generateMetadata`, and the page body rendering problem/approach/outcome under registry-sourced labels.
- `apps/web/lib/content.ts` — added `CaseStudyLabels` interface, `caseStudy` field on `PastWorkContent`, and the three label strings in the registry.
- `apps/web/CONTENT.md` — new `### caseStudy` subsection under Past Work, 3 new Cross-check rows, new Page-map row for `/work/[slug]`, updated `items[n].slug` note (no longer "future" detail route), re-derived "Total registry fields" 89 → 92 via a throwaway Node script counting Cross-check table rows (not hand-incremented), updated Last-updated line.

## Deferred / Out of Scope
- Card-to-detail-page linking (`past-work.tsx` `<Link>` wrapping) is PLAN item 4 — not touched here.
- Screenshot rendering is PLAN item 8 — `screenshots` array is untouched and unrendered; empty array causes no crash (nothing on this page reads it).

## Flags for Reviewer
- `siteContent.pastWork.items.find()` is O(n) over a 2-item array — fine at this scale, would want a `Map` if the registry ever grows to dozens of case studies.
- No external calls or retries on this page — pure static registry read, no hardening needed.

## Verification
- `corepack pnpm --filter @nseluga/web typecheck` — clean.
- `corepack pnpm --filter @nseluga/web build` — route line: `● /work/[slug]` with `├ /work/delucas` and `└ /work/l2detailz` (SSG, not `ƒ`). Both `.next/server/app/work/{delucas,l2detailz}.html` exist on disk.
- `corepack pnpm --filter @nseluga/web test` — 62/62 node:test pass, 0 fail, 0 skip; all script-style files (`b2`/`b3` etc.) report "Results: N passed, 0 failed" with no SKIP lines (build was present).
- Live server on port 3411 (3000 was occupied by an unrelated pre-existing process, left untouched): `/work/delucas` → 200, `/work/l2detailz` → 200, `/work/nope` → 404 with real Next 404 body (9554 bytes, not an empty shell). Server killed after verification, port confirmed free.
- 5 curl timings against `/work/delucas`: 0.0033, 0.0034, 0.0040, 0.0062, 0.0064s — median 0.0040s, well under the 1s bar.
- Built HTML spot check (delucas): contains `[INPUT: delucas problem/approach/outcome]` verbatim plus all three registry labels ("The problem"/"Our approach"/"The outcome"); `<title>` is `[INPUT: delucas case study title] · bcns` (layout template suffix applied automatically); meta description is `[INPUT: delucas outcome]`.
