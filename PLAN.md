brand: nate-personal
launch: pnpm --filter @bcns/web dev
url: http://localhost:3000

> **Run from the Claude Code terminal, not cowork.** Use Claude-in-Chrome for all viewing and
> screenshots: load its tools via ToolSearch, open a new tab, navigate to each page URL, and use the
> computer tool to screenshot before and after every change. The loop depends on actually seeing the
> rendered page — never skip the screenshot step or trust the diff alone.

> **Goal of this pass.** The site's structure and copy are final and good, and the aesthetic
> direction is right. What's missing is richness: the pages read as generic because the space is
> filled only with words and small icons. Keep the current aesthetic and the current structure
> (simple landing page, separate tabs for each topic) — do not redesign. Add detail, visual
> interest, a human feel, and natural motion so each page looks professionally crafted instead of
> templated.

> **Reference sites — study both before starting; here is exactly what to take from each:**
> - **ozoneproject.com** — the *human, alive* quality. Expressive large type, real personality,
>   ambient background motion, and layered scroll animation. Take from it: things move and feel
>   placed by a person, not auto-laid-out. This is the "human feel and natural animation" the site
>   is missing.
> - **openx.com** — the *professional polish*. Purposeful, varied sections, refined gradients and
>   depth, confident and trustworthy. Take from it: every section looks intentional, and sections
>   differ from one another instead of repeating one card pattern down the page.
> - **The synthesis to aim for:** OpenX's polish plus Ozone's warmth and motion. Less generic, more
>   to look at beyond words and icons, with flow between sections. Match this level of quality, not
>   their specific brands — the palette and voice stay `nate-personal`.

> **Cross-page craft (apply on every page):**
> - Replace empty space with visual substance — gradients, texture, illustrated accents, layered
>   depth — not just more whitespace.
> - Give every card or feature block a visual artifact beyond a small icon: an illustrated glyph, a
>   gradient badge, a patterned header, or a small graphic.
> - Add motion with restraint: scroll-triggered entrances (fade-up, stagger), meaningful hover
>   states, and at least one ambient animation in each hero or feature area.
> - Make sections feel connected — deliberate transitions and rhythm so the page flows top to bottom.
> - Presentation only. Never edit copy, data, props, logic, or routing. `[INPUT: …]` strings are
>   content placeholders — style them as normal text, never change them.

- page: /
  notes: Hero reads flat — give it depth with an ambient animated element (gradient orb, mesh, or motion graphic) behind it, and stagger the proof-point badges in on load. The three nav cards are the primary interaction: give each a visual beyond the arrow (gradient fill, illustrated pattern, or a distinct motif) so the trio feels crafted. The contact section is a plain form on white — add a warm accent (background wash, stripe, or illustrated element).
  status: not started

- page: /services
  notes: The four use-case cards are icon-only — give each a richer visual (illustrated glyph, gradient + icon, or a patterned card header) and stagger them in on scroll. The how-it-works steps need a visual connector (animated line, arc, or weighted numbered badge) and a staggered entrance, so the process reads as a flow rather than three stacked blocks.
  status: not started

- page: /pricing
  notes: The three cards need texture to tell tiers apart before the price is read — subtle gradient fills, an accent border treatment, or a patterned header band. The AI consulting card should look genuinely distinct from the two build tiers (different background, accent, or shape — not just a label). Add a hover lift or glow to all cards. FAQ items should animate open and closed.
  status: not started

- page: /about
  notes: The founder cards look unfinished without photos — add a placeholder visual treatment (gradient avatar backdrop, styled initials, or an illustrated portrait frame) so the layout reads as designed, not awaiting content. Frame the whyBcns paragraph as a highlight (pull-quote, accent border, or background block) rather than body copy. Add a subtle decorative element (grid, dot pattern, or soft shape) behind the two columns for depth.
  status: not started

- page: /work
  notes: Both holding-state panels need character so they read as intentional, not empty — give each an illustrated or ambient graphic (a build/construction motif for past work, a speech-bubble or star motif for reviews). Make the CTA button on each panel prominent. A subtle pulse or shimmer can signal the panels are live and waiting for the first client.
  status: not started
