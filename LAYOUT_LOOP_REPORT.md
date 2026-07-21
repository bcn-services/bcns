# Layout Loop Report — Phase 0 foundation (2026-07-20, Bold+precision PLAN)

**Branch:** `layout-loop-2026-07-20` (worktree `.claude/worktrees/layout-loop-night`)
**Brand:** bcns · **Craft:** `~/os/knowledge/library/design-language/craft.md`
**Direction:** "Bold, executed with precision" (from `PLAN.md`)
**Scope this run:** Phase 0 shared foundation only. **Stopped at the `⚠️ AUTONOMOUS
RUN — STOP HERE` marker** — no real marketing page (`/`, `/services`, `/pricing`,
`/about`, `/work`) was touched. **I did not merge.** Review the foundation, then the
per-page loops run after your sign-off.

## What landed (5 commits, one per Phase 0 item)

| # | Commit | What it wires |
|---|--------|---------------|
| 1 | `9ebe88d` | **Fraunces** italic loaded via `next/font/google` as `--font-serif-accent`; `font-serif-accent` family + `drift`/`shimmer` keyframes/animations added to the shared Tailwind preset |
| 2 | `ebf3e31` | **`Reveal`** (`apps/web/components/reveal.tsx`) — one-shot `IntersectionObserver` adds `animate-fade-up` on enter; `delay` prop for stagger, `as` for element type; under `prefers-reduced-motion` it skips the observer and renders the final state immediately |
| 3 | `c8aff09` | **Shared hover utilities** in `globals.css` `@layer components`: `.hover-lift`, `.link-slide` (group), `.icon-brighten` (group), plus `.shimmer-surface` gradient |
| 4 | `f67de20` | **`SectionHeading`** gains opt-in `accent` (serif-italic segment) + `size="display"`; defaults unchanged so existing callers are untouched |
| 5 | `765df7f` | **`/style-lab`** throwaway preview route to verify the foundation in isolation (not in nav; deleted in Phase F) |

## Verification (rendered pixels, not the diff)

Screenshots taken at `/style-lab`, 1440px wide, dark (default) theme:

- **Serif accent** — headline "Bold, executed with *precision*" renders the single
  word *precision* in Fraunces italic, `text-primary` pastel-blue, at display scale.
  Exactly one accent word; the rest is the bold sans display face. ✅ (craft: accent
  as attention-pointer; precision: one accent only)
- **Reveal + stagger** — cards were caught mid-stagger on load (Card 1 fading in,
  2 & 3 still pending) and settled to full opacity aligned on a shared 3-col
  baseline. One-shot reveal + delay stagger both confirmed. ✅
- **Hover utilities** — hovering Card 1: icon tile turns pastel-blue on a brightened
  bg (`icon-brighten`), card lifts (`hover-lift`). ✅ (zoomed screenshot)
- **SignatureMotif** — orbiting pastel-blue nodes + concentric rings render/animate. ✅
- **Shimmer** — three `shimmer-surface` cards render the gradient with `animate-shimmer`. ✅

## Objective gates

- **Contrast** — pastel-blue #7CB3FF and near-white ink on #15131F charcoal both pass
  WCAG AA comfortably. ✅
- **Overflow / overlap / clipping** — none on `/style-lab`; cards aligned to grid. ✅
- **Typecheck / lint** — `tsc --noEmit` clean on `apps/web` and `packages/ui`; eslint 0
  errors on changed `.tsx` (2 non-issue warnings: css not linted as JS, ui pkg uses its
  own config). The only prior tsc errors were a stale `.next` cache for the
  already-deleted style-lab — cleared. ✅
- **Reduced motion** — *code-verified* (not devtools-emulated): the pre-existing global
  `prefers-reduced-motion` rule zeroes all animation/transition durations, and `Reveal`
  guards on `matchMedia` to render the final state. ⚠️ Emulated pass not run.
- **Mobile breakpoint** — *structurally verified*: grids are `sm:grid-cols-3` (single
  column < 640px) and the heading is `text-4xl sm:text-5xl md:text-6xl`; no fixed
  widths. ⚠️ The resize tool did not re-render the viewport at 390px, so live mobile
  pixels weren't captured — worth an eyeball before the page loops.

## Flagged decisions (decide-and-log)

- **Rebuilt `/style-lab`.** The prior run deleted it; the STOP marker explicitly asks you
  to review "fonts loading, Reveal working, motif placement, reduced-motion," and the
  skill requires verifying against rendered pixels. A throwaway preview route (dev
  scaffold, not a real page) is the surface for that. Phase F already plans to delete it.
  *Alternative:* leave the foundation code-only and defer all visual proof to page loop 1
  — rejected because it leaves the checkpoint unreviewable.
- **`Reveal` starts `opacity-0` only after mount.** No-JS / reduced-motion users get the
  final state immediately; motion users get the fade. Chose content-always-visible over a
  CSS-only reveal that could hide content if JS fails.

## Next (after your sign-off)

Per-page loops in queue order — `/` → `/services` → `/pricing` → `/about` → `/work` —
each applying this foundation (accent word, Reveal/stagger, hover utilities, motif,
shimmer) per the `PLAN.md` page notes. All five page items are still `not started`.

---

# Layout Loop Report — bcns marketing site (2026-07-20 run)

**Branch:** `layout-loop-2026-07-20` (worktree `.claude/worktrees/layout-loop-night`)
**Base:** `main` @ a5edbdc (which already includes the prior visual-richness pass)
**Run date:** 2026-07-20 (overnight)
**Brand:** bcns · **Craft:** `~/os/knowledge/library/design-language/craft.md`
**Queue:** Home → About → Services → Pricing → Work
**Changes:** 3 commits across 2 pages. **You review + merge — I did not merge.**

> Context: the prior layout-loop run polished Home/Services/About/Pricing and
> **merged to main**, so tonight's baseline already carried that work. Re-running
> found those four largely converged; the real opportunity was `/work` (the prior
> run intentionally skipped it) plus one alignment fix on Services. I made changes
> only where I could name a concrete craft/brand gap — no churn on converged pages.
> (The previous run's report is preserved in git history on `main`.)

---

## Summary table

| Page | Passes | Changes | Stopping condition |
|------|--------|---------|--------------------|
| Home | 0 | none | Converged — no nameable flaw vs craft+brand |
| About | 0 | none | Converged — remaining weaknesses are copy gaps (out of edit fence) |
| Services | 1 | card body alignment | Converged after fix |
| Pricing | 0 | none | Converged — one candidate left as a logged taste fork |
| Work | 2 | width constraint + twin unification | Diminishing returns after 2 passes |

---

## Page: `/` (home)

**Baseline = final (no change).** Fresh-eye diagnosis found the page resolved by the
prior merged pass: dominant centered headline (P1), single pastel-blue accent on the
primary CTA (P11 / brand accent rule), grid texture + radial glow carrying character
(P7), uniform nav cards with icon header zones (P4), a strong split contact section
(form card lifted off the field — figure/ground), and contact details correctly in
the footer (P10).

Candidate flaws I tested and rejected: muted subtext contrast (~6.6:1, passes AA);
low-contrast secondary CTA (intentional so the primary dominates — P1); large grid
band above the hero eyebrow (atmospheric, grid "puts the void to use" — P3, not slack).

**Stopping condition:** converged — could not name a concrete gap that wasn't already
resolved. No manufactured changes (anti-oscillation).

## Page: `/about`

**Baseline = final (no change).** Two matched-height founder cards (P8 paired sizing),
split-focus composition, blue role labels as the accent, centered statement card with
correct figure/ground, footer contact placement correct.

**Not fixed (out of scope):** Brandon's card shows `[INPUT: ...]` placeholders. These
are **copy gaps** (flagged in the brand file's "known gaps"), not visual gaps — the
edit fence forbids touching copy, so they remain for you to fill. No visual invention.

**Stopping condition:** converged; the only weaknesses are content, not layout.

## Page: `/services`

### Change — Pass 1: align use-case card body text (commit `7d50971`)
**Gap (P8, alignment / paired sizing):** the four use-case card titles wrap to
different line counts ("Scheduling & booking systems" and "Inventory & back-office
automation" = 2 lines; "Dashboards & reporting" and "AI consulting" = 1 line), so the
body paragraphs started at **different vertical positions** across the row — a ragged
internal rhythm.

**Fix:** added `lg:min-h-[2.75rem]` to the `CardTitle` so every title reserves two
lines of space at the 4-column breakpoint. Presentation-only.

**Evidence (verified in-pixel):** after the change, all four body paragraphs start on a
shared baseline (~y207 at the 4-col layout), regardless of title length. The Process
section below (3 numbered steps with arrow connectors) was already clean and aligned.

**Stopping condition:** converged after one fix; no further nameable flaw.

## Page: `/pricing`

**Baseline = final (no change).** Three matched-height cards; the middle "Advanced
build" carries a blue top-border tier accent (prior pass) as a subtle featured signal;
the AI day-rate card is differentiated with a chip header (P4 — zoning justified because
the day rate is a genuinely different pricing model). Prices use weight, not the accent,
keeping the single blue accent disciplined (P11). Reuses the shared contact section below.

**Flagged taste fork (decide-and-log):** I considered strengthening the featured card's
dominance beyond the thin top border (e.g. a full primary ring / elevation). I **left it
as-is** because the copy does not label any tier "most popular," and inflating a tier the
content doesn't call featured would misrepresent the offer. Flag if you'd prefer a
stronger featured treatment — that's a content+design decision I didn't want to make for you.

**Stopping condition:** converged.

## Page: `/work`  ← primary target (untouched by the prior run)

`/work` = `PastWork` (empty holding state) + `Reviews` (empty holding state) + footer.
Both sections are empty by design (no case studies / testimonials yet — brand "known gaps").

### Change — Pass 1: constrain empty-state cards to `max-w-3xl` (commit `3b4bfab`)
**Gap (P3, slack space):** both holding cards spanned the **full container width
(~1300px)** while their content (icon, heading, body, CTA) was a narrow centered column —
so each read as an oversized void with content floating in it, and the page composition
felt empty and unintentional.

**Fix:** constrained both wrappers to a centered `max-w-3xl` (`mx-auto max-w-3xl`).
**Evidence:** content now fills a sensible ~768px frame; the horizontal slack is gone
and the composition reads as intentional (verified in-pixel on both cards).

### Change — Pass 2: unify Reviews empty-state with Past Work (commit `fb5769b`)
**Gap (P4 uniform repeated modules / P8 structural discipline):** the two holding cards
are the same visual role but were styled inconsistently — Past Work had a `size-16`
square glowing icon tile, `text-2xl` bold title, and an ambient radial glow; Reviews had
a smaller `size-12` circle tile, `text-xl` semibold title, and no glow.

**Fix:** matched Reviews to the richer Past Work treatment (square glowing tile, larger
icon, `text-2xl` bold title, ambient glow), keeping its section-appropriate card
background so figure/ground still separates it from the `bg-secondary` section.
**Evidence:** the two cards now read as twins differing only by icon + copy (verified
in-pixel); the added glow also gives Reviews more character (P7).

**Stopping condition:** diminishing returns after 2 passes. Remaining candidate (minor
vertical slack within each card) is marginal and now proportional to the narrower width;
no strong concrete flaw left. The duplicate "Book a free consult" CTA on both cards is
**copy** (out of the edit fence) — flag if you want one card to use different CTA text.

---

## Rubric self-assessment (changed pages)

| Goal | Services | Work |
|------|----------|------|
| **Uniquely styled to Nate** | ✅ brand tokens only; blue accent disciplined | ✅ glowing tiles + radial glow + brand tokens; not generic |
| **Intuitive** | ✅ card scan-line now consistent | ✅ one heading + one CTA per card; clear |
| **Simple** | ✅ alignment tidied, nothing added | ✅ tighter frames, consistent twins, less void |
| **Aesthetically pleasing** | ✅ shared body baseline (P8) | ✅ intentional composition, matched modules (P4/P8) |

## Objective gates

- **Contrast (WCAG AA):** ✅ near-white / muted-foreground on the charcoal-purple field
  passes AA (home muted subtext measured ~6.6:1); no new text colors introduced.
- **Overflow / overlap / clipping:** ✅ none — verified in-pixel on every changed view.
- **Mobile breakpoint:** ⚠️ **not pixel-verified.** The Chrome extension's `resize_window`
  reports success but the captured viewport stays desktop-width (same limitation the prior
  run hit). Mitigation: my only additions are `max-w-3xl mx-auto` (on a 390px screen the
  768px max simply yields "fill available width" — no overflow) and `lg:min-h-[…]` (applies
  only at `lg`, zero mobile effect). Both are **mobile-safe by construction**; existing
  `sm:`/`lg:` responsive classes are untouched. Worth a quick real-device glance before merge.

## Correctness / lane check

- `pnpm --filter web lint` → clean.
- Diff is **presentation-only** across all 3 files (className / purely-visual wrapper
  changes; a content-grep of the diff returned zero copy/prop/data/logic lines). Rendered
  text and shown values are provably unchanged.

## Failures

None. Dev server ran cleanly for the whole session; no page hit graceful-failure.

## How to review & merge

```bash
cd ~/bcns
git worktree list                      # see the layout-loop-night worktree
git log main..layout-loop-2026-07-20   # the 3 commits
git diff main..layout-loop-2026-07-20  # the full diff (3 files)
# to merge after you're satisfied:
git merge layout-loop-2026-07-20
# cleanup when done:
git worktree remove .claude/worktrees/layout-loop-night
```
