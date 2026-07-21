brand: bcns
launch: pnpm --filter web dev
url: http://localhost:3000

> **Run from the Claude Code terminal, not cowork.** Use Claude-in-Chrome for all viewing
> and screenshots: load its tools via ToolSearch, open a tab, navigate to each page URL, and
> screenshot before and after every change. The loop depends on actually seeing rendered
> pixels — never skip the screenshot step or trust the diff alone. Work on this branch
> (`layout-loop-2026-07-20`); never edit or merge to `main`.

> **Direction — "Bold, executed with precision."** Push the styling and motion to the Bold
> end (big confident display type, a serif-italic accent word, the branded signature motif,
> strong-but-purposeful animation) — but hold every change to the discipline of the
> Restrained option: one accent only, tight alignment to the grid, generous whitespace, no
> clutter, no second accent hue, nothing gaudy. Marketable and alive, not busy. When a Bold
> move and a precision rule conflict, precision wins — dial the Bold move back until it reads
> as intentional, not loud.

> **Reference — l2details.com.** Borrow its *techniques*, not its skin: cinematic dark field,
> two-tone headline (one italic accent word), editorial rule-line eyebrows, a signature
> animated emblem, heavy scroll-reveal, big stat/number treatment. bcns keeps its OWN brand —
> pastel-blue (#7CB3FF) on charcoal-purple (#15131F), sans base, **no photography** (brand
> rule). No serif body, no gold, no car imagery. Craft governs discipline; brand governs
> color/type.

> **Already landed on this branch — do NOT redo:**
> - Distinct background pattern per tab (home = grid, services = blue dot matrix,
>   about = diagonal hairlines, pricing = concentric rings, work = crosshatch) via
>   `components/section-atmosphere.tsx`. Keep; only extend if a page rework needs it.
> - Empty-state cards on /work constrained to `max-w-3xl`; use-case card bodies aligned;
>   /work holding-state titles set to the site `text-xl font-semibold` convention.
> - `components/signature-motif.tsx` (orbiting-nodes emblem) exists and is proven in the
>   style lab. Reuse it; do not rebuild.

> **Guardrails (every page):**
> - Presentation only. Never edit copy, data, props, logic, or routing. `[INPUT: …]` strings
>   are content placeholders — style as normal text, never change or invent them.
> - `siteContent` / `site.ts` are the source of truth for copy — never edit through them.
> - Respect `prefers-reduced-motion`: all motion must no-op cleanly (the global reduce-motion
>   rule already zeroes transitions; JS-driven reveals must check the media query and render
>   the final state immediately).
> - Objective gates before any page is "done": text contrast ≥ WCAG AA; no overflow / overlap
>   / clipping; layout holds at mobile AND desktop; motion degrades gracefully.
> - One change per pass, screenshot before/after, commit each pass with the change-log line.

---

## Phase 0 — Shared foundation (build FIRST, before the per-page loops)

These are prerequisites the page items depend on. Land them, screenshot the style-lab or a
representative page to confirm, then commit before starting page loops.

- Wire the serif accent font globally: add `Fraunces` (italic) via `next/font/google` in
  `app/layout.tsx` as `--font-serif-accent`; expose a `font-serif-accent` family in the
  Tailwind preset (`packages/config/tailwind/index.ts`). Used for exactly ONE accent word per
  headline, always in `text-primary`, never for body or more than one word.
- Build `components/reveal.tsx` — a `"use client"` wrapper using a single IntersectionObserver
  that adds the `animate-fade-up` on enter and unobserves. Props: `delay` (ms) for stagger,
  `as` for element type. Under `prefers-reduced-motion`, skip the observer and render final
  state. This powers scroll-reveal + staggered entrance everywhere.
- Add motion keyframes to the preset: `drift` (slow translate/scale loop for ambient glows)
  and `shimmer` (for placeholder cards). `spin` / `ping` / `pulse` already exist.
- Standardize hover utilities as shared classes/variants: card hover-lift
  (`-translate-y-0.5` + shadow bump), link/arrow slide (`group-hover:translate-x-1`),
  icon-tile brighten. Apply consistently, not ad hoc per component.
- Extend `SectionHeading` (`packages/ui/src/section-heading.tsx`) to optionally render a
  serif-italic accent segment and larger display sizes, without breaking existing callers
  (accent is opt-in; default unchanged).

---

## Per-page loops

- page: /
  notes: Hero — raise the headline to bold display scale and set ONE word as the serif-italic
    blue accent (precision: only one). Place `SignatureMotif` subtly in a hero corner behind
    content (low opacity, does not fight the headline). Stagger the proof-point row and the
    four nav cards in on load/scroll via `Reveal`. Nav-card hover: top-border accent sweep +
    lift + icon brighten (reuse the shared hover utilities). Reveal the split contact section.
    Keep the existing grid+glow hero atmosphere. Discipline check: still one accent, headline
    dominant, whitespace intact.
  status: done

- page: /services
  notes: THE PROCESS (how-it-works) is the priority — rebuild it from three stacked blocks into
    a connected flow: numbered node badges on a running connector line (horizontal on desktop,
    vertical on mobile) that draws/fills in as the section scrolls into view, with steps
    revealing in sequence (stagger). Use-case cards: staggered reveal + hover lift; keep the
    aligned body baseline already fixed. Serif-italic accent word in the section title.
    Precision: the connector must land on a shared axis and the node badges align to it exactly.
  status: done

- page: /pricing
  notes: FAQ — convert the flat two-column card grid into an accordion (expand/collapse with an
    animated height + chevron rotate; one or multi open is fine). Pricing cards: strengthen the
    featured "Advanced build" tier with a precise treatment (accent ring or elevated surface —
    not a new hue) so it reads as featured before the price; keep the AI day-rate card's chip
    differentiation. Hover glow/lift on all three cards. Reveal + stagger the row.
  status: done

- page: /about
  notes: Founder cards — reveal + hover lift; keep matched heights. Frame the whyBcns statement
    ("Small businesses get two bad options…") as a deliberate pull-quote (accent border or
    lifted block with a large opening mark), not plain centered body. Serif-italic accent word
    in "The people behind bcns". `[INPUT: …]` credentials stay as-is, styled as normal text.
    Keep the diagonal-hairline atmosphere.
  status: done

- page: /work
  notes: Give the two holding panels character so they read as intentional, not empty: add an
    ambient/branded graphic per panel (the `SignatureMotif` or a build/reviews motif) and a
    subtle shimmer so they signal "live, awaiting first client." Reviews empty state can become
    2–3 placeholder quote cards with a shimmer sweep rather than one box. Make each panel CTA
    prominent (primary weight). Reveal on scroll. Keep the crosshatch atmosphere and the
    max-w-3xl framing.
  status: done

---

## Phase F — Finalize (after all pages pass)

- Delete the throwaway `app/style-lab/page.tsx` preview route and `components/signature-motif.tsx`
  ONLY if the motif ended up unused (it should be used — keep it if any page adopted it).
- Re-run `pnpm --filter web lint` and `typecheck`; confirm the diff is presentation-only
  (no copy/data/prop/logic/routing changes).
- Verify `prefers-reduced-motion` (emulate in devtools) removes all motion cleanly.
- Update `LAYOUT_LOOP_REPORT.md` with baseline/final per page, the chosen direction
  (Bold + precision), animations shipped, and any flagged taste forks. Do NOT merge — leave
  for morning sign-off, then Nate merges.
