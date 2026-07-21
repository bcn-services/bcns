# Layout Loop Report — FULL RUN (2026-07-20, Bold+precision PLAN)

**Branch:** `layout-loop-2026-07-20` (worktree `.claude/worktrees/layout-loop-night`)
**Brand:** bcns · **Craft:** `~/os/knowledge/library/design-language/craft.md`
**Direction:** "Bold, executed with precision" (from `PLAN.md`) — pushed harder toward
**Bold** on your live instruction: *"exaggerate the animations more and add more
animations… it is too impersonal and boring right now."*
**Scope:** Phase 0 foundation → amplified motion → all 5 page loops → Phase F finalize.
**I did NOT merge.** Review the diff + running app, then merge yourself.

> **Note on the STOP marker:** the PLAN had a `⚠️ STOP HERE` checkpoint after Phase 0.
> I paused there and reported; you then said *"continue with your run,"* which I took as
> sign-off to proceed through the page loops. That's why the whole run is on one branch.

## Summary table

| Page / phase | Result | Stopping condition |
|---|---|---|
| Phase 0 foundation | Fraunces accent font, `Reveal`, motion keyframes, hover utilities, `SectionHeading` accent | Converged (verified on style-lab) |
| Motion amplification | Bigger `fade-up`, springy `pop`/`fade-left`/`fade-right`, stronger hover lift+scale+glow, `glow-pulse` CTA | Per your "more/bolder" instruction |
| **/** (home) | Serif accent word *already*, staggered pop entrance, drifting motif, amplified nav-card hovers, split contact reveal | Converged |
| **/services** | THE PROCESS rebuilt as node-badge flow with scroll-fill connector + sequenced reveals; use-case cards pop + hover-lift; accent *shaped* | Converged |
| **/pricing** | FAQ → animated accordion; featured Advanced tier (accent ring + elevation); tier pop-reveal + hover-lift; accent *monthly*/*questions* | Converged |
| **/about** | Founder cards pop-reveal + hover-lift; whyBcns → deliberate pull-quote (serif mark + accent border); accent *people* | Converged |
| **/work** | Holding panels given character: drifting motif + shimmer on Past Work; 3 shimmer testimonial skeletons for Reviews; glow-pulse CTAs; reveal | Converged |
| Phase F | style-lab removed; typecheck/lint clean; presentation-only diff confirmed | Done |

## Animations shipped (the "make it alive" ask)

- **Scroll pop-ups** — `Reveal` wrapper (one-shot IntersectionObserver) with a springy
  `pop` variant (scale-overshoot via `cubic-bezier(0.34,1.56,0.64,1)`) + staggered delays
  on every card row / list / section. `fade-left`/`fade-right` used for the split contact.
- **Signature connector draw** — `/services` process line fills left→right (desktop) /
  top→down (mobile) on scroll-in, with node badges popping in in sequence.
- **Hover richness** — cards lift (`-translate-y-1.5`) + scale + accent-glow shadow +
  border tint; icon tiles pop/scale + brighten; nav cards add a top accent-sweep; CTAs
  carry an idle `glow-pulse` that intensifies on hover.
- **Ambient life** — `drift` on the low-opacity SignatureMotif (hero + work panel);
  `shimmer` sweep on the work holding panel and the review skeleton cards.
- **Serif accent word** — one Fraunces italic accent word per section headline (*already,
  shaped, monthly, questions, people, precision*), always `text-primary`.
- **Accordion** — `/pricing` FAQ expand/collapse via `grid-rows 0fr→1fr` + chevron rotate.

## Objective gates

- **Contrast** — pastel-blue #7CB3FF and near-white ink on #15131F charcoal pass WCAG AA;
  accent words, glowing CTAs, and the pull-quote all verified legible at final opacity. ✅
- **Overflow / overlap / clipping** — none observed on any page at 1440px. ✅
- **Typecheck / lint** — `tsc --noEmit` clean; eslint 0 errors on all changed `.tsx`
  (one non-issue warning: `packages/ui` file uses its own config). ✅
- **Presentation-only** — diff touches only styling components, `globals.css`, the Tailwind
  preset, `SectionHeading` (ui), and the new `Reveal`. **No `content.ts`, `site.ts`,
  `/lib/`, props/logic, or real route files changed.** Accent words are styled spans over
  the exact same strings — rendered copy is byte-identical. `[INPUT: …]` placeholders on
  /about left as plain text. ✅
- **Reduced motion** — *code-verified* (not devtools-emulated): the global
  `prefers-reduced-motion` rule zeroes all animation/transition durations; `Reveal`,
  `HowItWorks`, and the FAQ all guard on `matchMedia`/CSS-transition so content renders in
  its final state with no motion. ⚠️ Please spot-check with the devtools emulation.
- **Mobile breakpoint** — *structurally verified*: every grid collapses (`sm:`/`lg:` cols
  → 1), the process connector switches to a vertical rail, headings use responsive sizes,
  no fixed widths. ⚠️ The browser resize tool would not re-render the 390px viewport, so
  live mobile pixels weren't captured — **worth a real mobile eyeball before merge.**

## Flagged decisions (decide-and-log)

- **Pushed past the Bold/precision balance toward Bold**, per your live instruction. Held
  the precision guardrails that still fit: one accent hue only, one serif accent word per
  headline, connector nodes aligned exactly to the axis, consistent easing. If any single
  effect reads as too much (candidates: the `glow-pulse` on CTAs, the shimmer on the work
  panel), it's a one-line dial-back — say which and I'll tune it.
- **`glow-pulse` is an infinite idle loop.** It draws the eye to CTAs continuously. Some
  find always-on motion busy; flag if you'd rather it only pulse on hover.
- **Process connector fills once on entry** (not scroll-position-linked). Cleaner and
  jank-free; the alternative (scrubbing fill with scroll) was rejected as fussy.
- **`Reveal` renders final state if JS/motion is off** — content is never hidden behind an
  animation that might not run.

## Not done / out of fence

- Copy gaps remain (founder photos, Brandon's real credentials replacing `[INPUT: …]`,
  first past-work entry, real testimonials) — these are content, not layout, and are out
  of the edit fence. The work-page shimmer skeletons are intentional placeholders for them.
- No live mobile screenshots (tool limitation, above).

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
