---
# UI Report
**Task:** Polish the case-study screenshot block on `/work/[slug]`
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28

## VERDICT: DONE

## Changes Made
- `apps/web/app/work/[slug]/page.tsx` — wrapped each screenshot's `<Image>` in the existing `Card` component (`bg-card border border-border shadow`, `p-2 sm:p-3`, image gets `rounded-lg` inside) — gives light PNGs a real mat/frame against the charcoal-purple dark background instead of a bare 1px border, and reads equally intentional in light theme.
- `apps/web/app/work/[slug]/page.tsx` — added `delay={index * 120}` to each figure's `Reveal`, matching the stagger convention used by `nav-cards.tsx`/`pricing.tsx`/`reviews.tsx` — the two l2detailz figures now visibly cascade in instead of popping simultaneously (verified live: figure 2 carries `animation-delay:120ms`, figure 1 none).
- `apps/web/app/work/[slug]/page.tsx` — centered the figcaption (`text-center`) so it reads as a caption tied to the image above rather than a continuation of the left-aligned Problem/Approach/Outcome body copy; kept `text-sm text-muted-foreground` (the site's one established secondary-text size/color, used identically by `CardDescription` and reviews' role/company line) — no new type scale introduced.
- Vertical rhythm (`mt-14` above the block, `space-y-10` between figures) checked live in both themes and left unchanged — it already reads correctly against the divide-y block above.

## Backend Flags
none

## Deferred
- No heading/label added above the screenshots block (e.g. "Screenshots") — would need a new `content.ts`/`CONTENT.md` field, out of scope per task constraints; flagging in case the orchestrator wants it queued as a follow-up content item.
- `Reveal`'s opacity-0-until-JS behavior (no-JS users see nothing) is pre-existing and site-wide — not touched, per task instructions.

## Verification
- `cd apps/web && npx tsc --noEmit` → clean, exit 0.
- `corepack pnpm test` (repo root) → **89 pass / 0 fail / 0 skip**.
- `corepack pnpm --filter @nseluga/web build` → 0 lines matching `warn|Warning|Image|sharp` (grep exit 1 = no match); build succeeded, `/work/[slug]` marked `● SSG` for both `delucas`/`l2detailz`.
- `loading="lazy"` count in prerendered HTML: l2detailz.html = **2**, delucas.html = **1**; `eager`/`fetchpriority="high"` = **0**.
- Live check via `next start -p 3001` (killed by PID via `lsof -ti tcp:3001`, port confirmed free after): viewed `/work/l2detailz` and `/work/delucas` in Claude-in-Chrome in both dark and light theme. Card-matted screenshots read as intentional framed elements in both themes; stagger visibly caught mid-animation on l2detailz's second figure in a screenshot. `document.documentElement.scrollWidth === clientWidth` (1470=1470) on both pages, both themes — no horizontal overflow.
- Correction to task brief: not all three screenshots are light-on-dark — l2detailz's two shots are themselves dark UI (site is black/gold), delucas's one is light. The Card-mat treatment holds up well for both cases, confirmed visually.

## Files Changed
- `apps/web/app/work/[slug]/page.tsx`
