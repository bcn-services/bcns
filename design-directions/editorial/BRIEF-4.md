# PROTOTYPE round 4 — the whole site as a linked static draft (throwaway)
Read BRIEF-2.md (tokens, tool colors, dots) and BRIEF-3.md (pillar copy, cube rules, header) first.
This file wins on conflicts. Everything lives in design-directions/editorial/site/ and is
served at http://127.0.0.1:8765/site/<page>.html.

## Approved sources to port from (same folder, one level up)
- H2.html: the home stage method (take tools in, redistribute), flowing dots, progress rail.
- I.html: the CSS-3D cube that turns to face you and shows the 3 pillars (/services + any cube).
- L.html: the hub look (login, Sources cards with tool dots and state chips).

## Nate's round-3 notes (apply everywhere)
- A cube must APPEAR inside its stage (scale/fade in place). It never slides in from
  outside the animation box or travels down the page.
- Tools start SCRAMBLED (jumbled, overlapping, slightly rotated cards and stray dots) and then
  organize into place.
- Heroes are split: text left, an opening animation right. Not centered.
- Keep the building blocks (the cubes) inside the animations.

## Shared foundation (site/assets/, built first; pages must use it, not re-invent it)
- site.css: tokens light/dark (via [data-theme] on <html>), type, buttons, cards, hairlines, eyebrow.
- site.js: injects header + footer into <div data-site-header></div> / <div data-site-footer></div>,
  theme toggle (localStorage), Services ▾ menu, and exports on window.bcns:
  pinStage(section, nSteps, onStep), flowDots(...), buildCube(...). Read site/README.md for the API.
- Page skeleton: copy site/_template.html.

## Page map (relative links only)
index.html (= Home A) · home-a.html · home-b.html · home-c.html · services.html ·
services-connect.html · services-deluxe.html · services-ai.html · work.html · pricing.html ·
about.html · connect-login.html · connect-sources.html · connect-data.html · connect-team.html ·
connect-access.html. Contact = index.html#contact. Hub pages use a hub header, not the site header.

## Rules
Real copy from apps/web/lib/content.ts. No text on skewed cube faces; nothing <12px. Phones
(<1024px) stack every pinned stage into static frames; reduced motion = static. No sideways
scroll at 390. Light + dark must both look intentional.

## Render check (required)
node /Users/nateseluga/.claude/jobs/078b87c8/tmp/shoot.mjs http://127.0.0.1:8765/site/<page>.html /Users/nateseluga/.claude/jobs/078b87c8/tmp/s/<page> 390,768,1440 0,0.2,0.4,0.6 light
(+ dark once at 1440). Cube pages also: O=/Users/nateseluga/.claude/jobs/078b87c8/tmp/s node /Users/nateseluga/.claude/jobs/078b87c8/tmp/touch.mjs site/<page>
(prints whether tap opens). Read the PNGs, fix, re-shoot.
