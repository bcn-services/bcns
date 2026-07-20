# Layout Loop Report — bcns visual richness pass

**Branch:** `layout-loop-bcns`  
**Run date:** 2026-07-20  
**Brand:** bcns  
**Pages covered:** `/`, `/services`, `/about`, `/pricing`, `/work`  
**Total passes:** 9 (across 4 pages; /work intentionally skipped)

---

## Page: `/` (home)

### Baseline
Hero section with dark grid texture and radial glow (subtle, 20% opacity). Four nav cards below with plain arrow links — no visual differentiation between destinations. Contact section on the raw dark field with no treatment distinguishing it as an action zone.

### Changes

**Pass 1 — Nav cards: distinct icon + gradient header per destination**  
Added `Wrench / FolderOpen / Tag / Users` icons (size-8) per card inside a `from-primary/10` gradient header zone (h-20). Each card now has a visual anchor specific to its destination. Icons transition from `text-primary/60` to `text-primary` on hover, reinforcing the existing border-t-primary hover interaction.

**Pass 2 — Hero: deepen ambient glow for atmospheric depth**  
Increased the central radial gradient from 20% → 28% opacity and added a second off-center glow (75% / 20% position, 10% opacity). The hero atmosphere is now visibly blue-purple above the headline, turning the empty header zone into branded depth rather than a flat void.

**Pass 3 — Contact section: subtle ambient glow to zone the CTA area**  
Added a centered radial gradient (`primary/0.14`) behind the contact section. Effect is intentionally subtle — the dark field resists visible tinting without becoming intrusive. Mainly signals "action zone" without overpowering the form card.

### Stopping condition
Diminishing returns — Pass 3's glow change is marginal on the dark field. The two structural improvements (icons + hero glow) are solid; the contact section glow is a fine signal but not transformative.

### Rubric
| Goal | Result |
|------|--------|
| Uniquely styled | ✅ Hero glow + grid + nav card icons differentiate clearly from baseline |
| Intuitive | ✅ Primary CTA is dominant; nav cards have distinct per-destination icons |
| Simple | ✅ Clean structure, no visual noise added |
| Aesthetically pleasing | ✅ Hero has atmosphere; nav cards have character |

**Objective gates:** Text contrast ✅ WCAG AA (near-white on dark field). No overflow/clipping ✅. Mobile breakpoints unverified in-pixel (resize tool couldn't change viewport), but responsive Tailwind classes are standard and unchanged.

---

## Page: `/services`

### Baseline
Four use-case cards with small icon-in-box (size-10 wrapper, size-5 icon). Category label top-right. No visual differentiation between cards. How-it-works section had three steps with no visual connector — read as independent blocks.

### Changes

**Pass 4 — Use-case cards: large icon in gradient header zone**  
Replaced the small `size-10/size-5` icon-in-box with a `h-20 from-accent/60` gradient header zone containing a `size-9` centered icon. Tag label moved to absolute top-right of the header zone. Consistent with nav-card icon pattern on home page.

**Pass 5 — How-it-works: arrow connectors between steps**  
Restructured the 3-column step grid from `md:grid-cols-3` to `md:grid-cols-[1fr_auto_1fr_auto_1fr]`, inserting `ArrowRight` (text-border, size-5) connectors between steps. Hidden on mobile. The process now reads as a directed flow.

**Pass 6 — Use-case cards: per-card gradient direction differentiation**  
Varied gradient directions across the four cards (br/bl/tr/b) to create subtle visual differentiation. The AI consulting card uses `from-primary/18` for a blue header instead of purple, with `text-primary/70` icon — distinguishing it from the three service cards.

### Stopping condition
Diminishing returns — gradient direction variations are subtle at card width. Cards differ by icon shape, category label, and AI card's blue tint. Further differentiation would push into individual-card bespoke styling.

### Rubric
| Goal | Result |
|------|--------|
| Uniquely styled | ✅ Cards have gradient headers + per-card icon; AI card visually distinct |
| Intuitive | ✅ Process has clear flow direction; categories are legible |
| Simple | ✅ Clean grid structure unchanged |
| Aesthetically pleasing | ✅ Cards have visual character; process reads as a journey |

**Objective gates:** Contrast ✅. No overflow ✅. Mobile: grid collapses to sm:grid-cols-2 which is standard; process connector divs hidden at mobile breakpoint ✅.

### Flagged decisions
- Gradient direction differentiation (Pass 6): chose subtle visual variety over identical cards, though the difference is modest. Alternative: per-card border-t-2 at varying primary opacities. Flag if you want stronger differentiation.

---

## Page: `/about`

### Baseline
Two founder cards with just name and role — no photo/avatar visual. Brandon's card had `[INPUT: ...]` placeholder credentials. whyBcns paragraph was plain centered muted text at the bottom.

### Changes

**Pass 7 — Founder cards: gradient initials avatar placeholder**  
Added a `size-14 rounded-xl` badge with gradient backdrop (`from-primary/25 to-accent/60`) showing styled initials ("NS" / "BC") beside each founder's name and role. The cards now read as designed rather than awaiting content.

**Pass 8 — whyBcns: framed as pull-quote blockquote block**  
Changed the plain centered muted paragraph to a `rounded-xl blockquote` with `border-primary/20` + `bg-primary/[0.04]` background. Text promoted to `foreground/80`. Reads as a deliberate highlight rather than body copy afterthought.

### Stopping condition
Converged — both passes addressed the two named gaps in the plan. No remaining structural/visual issues.

### Rubric
| Goal | Result |
|------|--------|
| Uniquely styled | ✅ Avatar badges and blockquote are distinctive design elements |
| Intuitive | ✅ Name + role clearly anchored by avatar; mission statement visually prominent |
| Simple | ✅ Two clean cards; no decoration beyond the avatar treatment |
| Aesthetically pleasing | ✅ Cards look designed; blockquote gives the page a finishing element |

### Note
Brandon's `[INPUT: ...]` placeholder credentials are a content gap, not a design gap — not changed.

---

## Page: `/pricing`

### Baseline
Three pricing cards with equal visual weight. Standard and Advanced cards looked identical — no hierarchy cue toward the more capable tier.

### Changes

**Pass 9 — Advanced build card: blue top border visual tier accent**  
Added `border-t-2 border-t-primary/70 + bg-secondary/30` to the Advanced card (index 1). Standard stays plain, Advanced gets a blue accent, AI consulting retains its full primary accent + secondary background — three-level visual hierarchy.

### Stopping condition
Converged — one targeted change created clear tier hierarchy. Further changes would be cosmetic.

### Rubric
| Goal | Result |
|------|--------|
| Uniquely styled | ✅ Three tiers now have distinct visual treatments |
| Intuitive | ✅ Eye is drawn to Advanced → AI consulting by ascending visual weight |
| Simple | ✅ Minimal addition — one class change per card |
| Aesthetically pleasing | ✅ Consistent with site's primary border-t-primary pattern |

---

## Page: `/work`

**No changes made.** The page shows an intentional empty-state: clock icon, "Our first builds are in progress" message, and a consult CTA. This is a content gap (per brand file: "Past Work section empty — first portfolio entry pending"), not a design gap. The empty-state is well-structured and needed no styling adjustment.

---

## Summary of files changed

| File | Passes |
|------|--------|
| `apps/web/components/nav-cards.tsx` | 1 |
| `apps/web/components/hero.tsx` | 2 |
| `apps/web/components/contact-section.tsx` | 3 |
| `apps/web/components/use-cases.tsx` | 4, 6 |
| `apps/web/components/how-it-works.tsx` | 5 |
| `apps/web/components/about-founder.tsx` | 7, 8 |
| `apps/web/components/pricing.tsx` | 9 |

## To merge

Review and merge when ready — this branch does NOT merge itself:
```
git checkout main
git merge layout-loop-bcns
```
