---
# Engineer Report
**Task:** Link each Past Work card to its detail page (`/work/<slug>`) — PLAN item 4
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-28

## Design Decisions
- Wrapper `<div>` per grid cell holds the card `<Link>` and, as a sibling, the optional external `<a>` — avoids nested anchors while keeping one click target for navigation (prescribed shape, no alternative considered).
- Card `<Link>` carries `rounded-xl` + `ring-offset-background` + the repo's standard `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` pattern (matches `app/work/[slug]/page.tsx:70`) — reused, not invented.
- `hover-lift` + `group` moved onto `<Card>` (Link is `block`, not the hover target) to match `use-cases.tsx`'s established convention — no new motion vocabulary.
- No dependency, schema, or content.ts changes — task is presentational only; accessible name comes from existing `CardTitle` text inside the Link.

## Files Changed
- `apps/web/components/past-work.tsx` — items-map branch only: each card now wrapped in `<Link href="/work/${slug}">`; external `link` anchor moved to a sibling `<a>` outside the Link; holding-state branch untouched (verified via `git diff`, zero lines touched).
- `apps/web/__tests__/past-work-card-links.test.mjs` — new file: recursive `.next/server/app` walker (excludes `.claude/`) + `<a>`/`</a>` token-order nesting scanner, vacuous-pass guards, per-slug href check, source-level focus-ring check. All expected values derived from `siteContent` at runtime.

## Deferred / Out of Scope
- Did not touch `section-atmosphere.tsx` — audited it, both decorative layers already carry `pointer-events-none` (see Flags below). No fix needed.
- Did not add a `Reveal` wrapper to the items branch — it wasn't there before my change either; out of scope for a link-wiring task.

## Flags for Reviewer
- `section-atmosphere.tsx` verified clean: `glowByVariant` divs and the pattern div are all `aria-hidden` + `pointer-events-none` — nothing can steal clicks from the new card `<Link>`. No change made here.
- Focus-ring contrast computed via WCAG relative-luminance formula (script-verified, not eyeballed): dark `#7CB3FF` vs `#201D30` = **7.62:1**; light `hsl(214 72% 44%)` (≈`#1F65C1`) vs `#FFFFFF` = **5.69:1**. Both clear the ≥3:1 non-text AA bar with margin; no offset-ring workaround needed.
- Nested-anchor scanner mutation-tested twice: (1) blanked the Link's `focus-visible:ring-` classes — test failed as expected, reverted, `shasum -c` clean; (2) set `link:` on `delucas`, rebuilt, confirmed the real code passes with the external `<a>` as a sibling — then physically nested the `<a>` back inside the Card/Link (the old bug shape) and reconfirmed the scanner fails loudly (`not ok 3`). Restored both `content.ts` and `past-work.tsx` from `/tmp` backups, `shasum -c` clean, rebuilt clean. Never used `git checkout --`.
- Card `<Link>` is `block flex-1` inside a `flex h-full flex-col` wrapper — relies on CSS Grid's default `align-items: stretch` to give the wrapper (and thus the Link) a full-row height; no explicit grid-row height styling exists elsewhere in this codebase, consistent with the prescribed shape.

## Verification
1. `corepack pnpm --filter @nseluga/web typecheck` — **PASS**, no errors.
2. `corepack pnpm build` (repo root, clean `.next`) — **PASS**; `● SSG /work/[slug]` still prerenders exactly `/work/delucas` and `/work/l2detailz`.
3. `corepack pnpm --filter @nseluga/web test` — **82 pass / 0 fail / 0 skip** (baseline 77 + 5 new tests in `past-work-card-links.test.mjs`, all accounted for).
