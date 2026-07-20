# bcns website — Visual pass 3

brand: nate-personal
launch: pnpm --filter @bcns/web dev
url: http://localhost:3000

> **Running from Claude Code terminal.** Use Claude-in-Chrome (`/claude-in-chrome` skill) for all
> browser viewing and screenshots — load tools via ToolSearch, create a new tab, navigate to the URL,
> and use the computer tool to screenshot after each change. Do not rely on cowork computer use.
>
> **Direction:** Two prior passes established structure and hierarchy. This pass adds visual depth,
> human warmth, and motion. The site currently reads as generic — too much whitespace filled only
> with words and icons. Same structure stays. Quality bar: ozoneproject.com (ambient animation,
> layered depth) and openx.com (professional polish, section variety, trust signals).
>
> **Cross-page principles:**
> - Replace blank space with visual interest: gradient meshes, texture, illustrated accents, or layered depth.
> - Add motion: scroll-triggered entrance animations (fade-up, stagger), hover states with substance,
>   at least one ambient animation per hero or feature section.
> - Human feel: warm, tactile, placed — not auto-laid-out. Elements should feel designed.
> - More than icons: every card or feature block needs a visual artifact beyond a small icon —
>   illustrated glyph, gradient badge, mini visual, or patterned background patch.
> - Presentation only — never edit copy, data, props, logic, or routing.

- page: /
  notes: Hero needs depth — add an ambient animated element (gradient orb, mesh, or motion graphic) so the background has visual weight instead of flat color. Proof-point badges should stagger in on load. Nav cards need a visual beyond an arrow — gradient fill, illustrated pattern, or mini motif per card so the trio feels crafted. Contact section needs a warm accent (background wash, stripe, or illustrated element) to break the plain white form-box feel.
  status: not started

- page: /services
  notes: Use-case cards need a visual beyond a small icon — illustrated glyph, gradient + icon combo, or patterned card header per card. Cards should stagger in on scroll. How-it-works steps need a visual connector (animated line, arc, or weighted numbered badge) and staggered entrance per step.
  status: not started

- page: /pricing
  notes: Pricing cards need more texture — subtle gradient fills, brand-accent border treatment, or a patterned header band to distinguish tiers visually before the user reads the price. AI consulting card must look distinct from the two build tiers (different background, accent, or shape — not just a different label). Add hover lift or glow on all cards. FAQ accordion items should animate open/close.
  status: not started

- page: /about
  notes: Founder cards are sparse without photos — add a placeholder visual treatment (gradient avatar backdrop, styled initials, or illustrated portrait frame) so the layout feels designed rather than awaiting content. The whyBcns paragraph needs visual framing — pull-quote treatment, accent border, or background block. Add a subtle decorative element (grid, dot pattern, or soft shape) behind the layout to give it depth.
  status: not started

- page: /work
  notes: Both holding-state panels need more visual character — add an illustrated or ambient graphic per panel (construction motif for past work, speech-bubble or star motif for reviews) so they read as intentional rather than empty. CTA button on each panel should be prominent. Consider a subtle animated pulse or shimmer to signal the panels are live and waiting.
  status: not started
