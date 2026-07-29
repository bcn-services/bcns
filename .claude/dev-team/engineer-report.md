---
# Engineer Report
**Task:** PLAN item 8 — render each case study's `screenshots[]` on `/work/[slug]` with `next/image`
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28

## Design Decisions
- New `apps/web/lib/case-study-images.ts`: static-import map keyed by registry `src` string — orchestrator-prescribed, implemented as given. Static imports make a deleted PNG a webpack build error and an unregistered `src` a `CaseStudyImageNotFoundError` thrown during prerender (also a build failure); a plain string `src` would validate at no point in the build. Also supplies intrinsic width/height, so no dimensions are hardcoded.
- Kept the map out of `lib/content.ts` — the test suite imports that file under `node --experimental-strip-types`, which cannot import a `.png`.
- Screenshots block guarded on `item.screenshots.length > 0`, one `<Reveal as="figure">` per shot (reused the existing scroll-in, no new motion vocabulary), image `className="h-auto w-full rounded-xl border border-border"` matching `packages/ui/src/card.tsx`'s Card exactly (verified: `rounded-xl border border-border`) rather than guessing.
- `sizes="(min-width: 768px) 672px, 100vw"` — matches the `max-w-2xl` (672px) container width, Tailwind's `md` breakpoint.
- No `priority` prop → Next defaults to `loading="lazy"` (verified below).
- Added `sharp` as a direct dependency of `apps/web` — `next build` warned twice ("For production Image Optimization... 'sharp' package is strongly recommended") before this; it's next/image's own first-party optional peer, not a discretionary library pick, so no research gate applied. Warnings are gone after adding it.

## Files Changed
- `apps/web/lib/case-study-images.ts` — new: static import map + `caseStudyImage()` lookup that throws on a miss.
- `apps/web/app/work/[slug]/page.tsx` — added the screenshots block after the Problem/Approach/Outcome sections, inside the same `<Container>`.
- `apps/web/package.json` / `pnpm-lock.yaml` — added `sharp` (eliminates the only build warning; see Design Decisions).
- `apps/web/__tests__/work-slug-page.test.mjs` — replaced the obsolete "page.tsx does not read screenshots" trip-wire (its own failure message: "the empty-array safety net needs re-adding") with (1) a source-level assertion that the block is still guarded by `item.screenshots.length > 0`, since neither live registry item has an empty array to exercise the built-HTML path, and (2) a new built-HTML check that every screenshot's `alt` (checked against entity-decoded raw HTML, since `alt` is an attribute, not text — tag-stripping would erase it) and `caption` actually render.

## Deferred / Out of Scope
- Did not touch `content.ts` or `CONTENT.md` — no new fields/labels added, per the task's explicit constraint.
- Did not write real caption copy — `[INPUT: ...]` placeholders render verbatim, per PLAN item 9's gate.
- No live-browser mobile/desktop overflow screenshot: `h-auto w-full` inside the same `mx-auto max-w-2xl` container hierarchy already used (and QA-proven overflow-safe) by the Problem/Approach/Outcome block directly above it — no fixed widths, scale transforms, or negative margins introduced, so I relied on that structural equivalence rather than a `resize_window` check that prior runs found flaky in this sandbox.

## Flags for Reviewer
- `lib/case-study-images.ts` is a hand-synced mirror of `screenshots[].src` — a third sync point in this feature area (team-memory already tracks the CONTENT.md mirror and the earlier `[INPUT:` token allowlist history). Drift fails loud (build/prerender error), not silent, by design.
- `next/image`'s default `deviceSizes` produced an 8-entry srcset up to 3840w for a 672px-max display width (visible in built HTML) — not customized; flag if a reviewer wants `images.deviceSizes` trimmed in `next.config.mjs` to cut generated variants.
- No external calls / no retry-sensitive writes in this change — pure static asset pipeline.

## Verification
- `cd apps/web && npx tsc --noEmit` — clean, no output.
- `corepack pnpm --filter @nseluga/web build` — 0 lines matching `warn`/`Warning`/`Image` after adding `sharp` (2 sharp-missing warnings before). `/work/delucas` and `/work/l2detailz` both `● SSG`.
- `corepack pnpm test` (repo root) — **88 pass / 0 fail / 0 skip** (baseline was 87/0/0; +1 net from replacing 1 obsolete test with 2 new ones).
- Lazy-load count in prerendered HTML: `grep -o 'loading="lazy"' .next/server/app/work/l2detailz.html | wc -l` → **2** (matches its 2 screenshots); `delucas.html` → **1** (matches its 1 screenshot). Zero `fetchpriority="high"`/`loading="eager"` occurrences.
- `pointer-events-none` audit: `SectionAtmosphere`'s two absolutely-positioned decorative layers (glow div(s), pattern div) both already carry `pointer-events-none` — unchanged by this item. `page.tsx` itself has no other `absolute`-positioned elements.
- Median of 5 production renders of `/work/l2detailz` (`next start -p 3100`, killed by PID via `lsof -ti tcp:3100` after): 0.002382s, 0.002465s, **0.003060s (median)**, 0.003895s, 0.011277s — well under the 1s budget.
- Confirmed the optimizer pipeline end-to-end on the live server: the `/_next/image?...` URL referenced by `/work/delucas` returned `HTTP 200`, `content-type: image/png`, real bytes.
- Tree left clean — no mutation performed to prove the build-failure path (QA owns that per the task).
