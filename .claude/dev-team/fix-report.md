# Fix Report
## VERDICT: FIXED (1 finding closed in code but NOT locally demonstrable — read Finding 1)
**Branch:** worktree-past-work-case-studies
**Date:** 2026-07-27
**Findings addressed:** 3 of 3 (2 QA bugs + 1 review Important). Not committed — orchestrator commits.

## Changes Made
- `apps/web/app/work/[slug]/page.tsx:26` — QA bug 1 — added `export const dynamicParams = false;` (+ comment); `notFound()` and `getCaseStudy`'s exact-match semantics untouched.
- `apps/web/CONTENT.md:486,492,498` — QA bug 2 — appended the literal values to the three existing Purpose bullets (`Currently \`The problem\`.` / `Our approach` / `The outcome`), matching the `tiers[0].price` "Currently `…`" pattern. No new rows, so "Total registry fields: 92" stays correct.
- `packages/ui/src/section-heading.tsx:20,49,64-72` — review Important — optional `as?: "h1"|"h2"|"h3"` prop defaulting to `"h2"`; title tag now `<Heading>`.
- `apps/web/app/work/[slug]/page.tsx:57` — review Important — `<SectionHeading as="h1" …>`.
- `apps/web/app/work/[slug]/page.tsx:61,67,73` — review Important — the three section labels `<h2>` → `<h3>`.

## Verification
- `typecheck` clean. `test` — **76/76 pass, 0 fail, 0 skip** (62 pre-existing + all 14 of QA's `work-slug-page.test.mjs`); every script-style file reports `0 failed, 0 skipped`. No QA assertion was weakened.
- `build` — `● /work/[slug]` SSG with `/work/delucas` + `/work/l2detailz`; both `.html` on disk (25584B/25618B, pristine sizes). `prerender-manifest.json` confirms `fallback: false` and a `routes` map containing only the 2 canonical paths — i.e. `dynamicParams = false` took effect.
- Prerendered `delucas.html` heading order: `h1 [INPUT: delucas case study title]` → `h3 The problem` → `h3 Our approach` → `h3 The outcome`. **Exactly 1 `<h1>`** on both slugs.
- `as` prop is a verified no-op: zero existing `SectionHeading` callers pass `as` (all 9 other call sites grepped; every `as=` in the repo is on `Reveal`), and rebuilt `/`, `/work`, `/pricing`, `/services`, `/about` still render their SectionHeading titles as `h2`. Chose the prop over a literal `<h1>` — visual system stays single-sourced in `packages/ui`.
- Live `next build && next start` on :3521/:3522 (:3000 untouched): `/work/delucas` 200, `/work/l2detailz` 200, `/work/nope` 404. Servers killed, ports confirmed free, no orphans.

## Deviations / must-read
- **`/work/DeLucas` and `/work/L2DETAILZ` still return 200 locally and still corrupt the prerendered `.html`.** The prescribed fix is applied and correct; this residue is provably the macOS case-insensitive-filesystem artifact, not a code defect. Discriminating experiment on one clean build: `/work/NoPe` → **404**, `/work/DeLucasX` → **404** (mixed case, no colliding file — hashes OK afterward); `/work/DeLucas` → **200** + corruption (mixed case, colliding file). `fs.existsSync(".next/server/app/work/DeLucas.html")` → `true`, `NoPe.html` → `false`. Chain: Next's file-system incremental cache `readFile`s the cache-key path before the router's `fallback:false` check; on APFS that read resolves to `delucas.html` (200), and the write-back to `DeLucas.html` overwrites it. On Vercel/Linux that read is ENOENT → cache miss → `fallback:false` → 404, exactly like `/work/NoPe`. Per orchestrator instruction I did not design around the filesystem and did **not** make slug matching case-insensitive.
- Consequence: QA's "case variants 404 + hashes unchanged" criterion **cannot be demonstrated on this machine**. It is satisfied by the manifest and by the non-colliding controls. Re-gate it on Linux/CI if the orchestrator wants a live green.

## Disputed
- None of the three findings. One incidental correction: the review's rationale says "every other single-topic page in this repo gives its primary heading an explicit h1" — `/work`, `/pricing`, `/services`, `/about` in fact have **no** `h1` (verified in built HTML). The finding itself stands and is applied; the new `as` prop makes those pages a one-word fix each, but they are outside this item's scope and I left them alone.

## Deferred
- None.
