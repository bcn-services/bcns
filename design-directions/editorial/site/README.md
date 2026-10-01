# bcns site draft: shared foundation (throwaway)

Served at `http://127.0.0.1:8765/site/<page>.html`. Copy `_template.html` for a new page, keep its `<head>`
(fonts link, theme snippet, `assets/site.css`), the two slots, and the script order (`assets/site.js` first, page script after).
Light/dark come from `[data-theme]` on `<html>` (key `bcns-site-theme`). Use `class="btn-primary"` / `"btn-outline"` (add `btn-sm` for small),
`.eyebrow`, `.h-xl` / `.h-lg` (light headlines, one `<b class="em">`), `.lede`, `.gut`, `.section`, `.card`, `.hair`, `.cta-band`, `.hero-split` + `.hero-art`.
Tool colors are tokens: `--shopify --square --quickbooks --calendar --gmail` (also `bcns.tools`). Nothing under 12px; no text on skewed cube faces.

## Page map (relative links only)
index.html (home) · services.html · services-connect.html · services-deluxe.html · services-ai.html ·
work.html · pricing.html · about.html · connect-login.html · connect-sources.html · connect-data.html · connect-team.html · connect-access.html.
Contact = `index.html#contact`. Hub pages (`connect-*`) use a hub header, not the site header.

## bcns API (window.bcns)
Header/footer are injected into `<div data-site-header></div>` / `<div data-site-footer></div>`; the current page's nav item gets `aria-current="page"`.

**`pinStage(sectionEl, nSteps, onStep(stepIndex, progress, frameEl)) -> {refresh(), pinned()}`**
Sticky scroll-progress stage. At >=1024px (and no reduced motion) the section gets `.pinned`: the panel pins over a `nSteps * 100vh` track, `onStep` fires when the step or
progress changes (progress = 0..1 inside that step, `frameEl` = `.stage-dia`). Otherwise the section gets `.stacked` and `onStep(i, 1, figEl)` fires once per step for its static
`.stage-fig` frame (and again if that frame resizes). Always draw into `frameEl`. Caps and rail are generated from the `.stage-step` copy.
```js
bcns.pinStage(document.getElementById("how"), 3, function (i, p, frame) { frame.dataset.step = i; /* build/move pieces; CSS transitions do the motion */ });
```

**`flowDots(svgEl, pathEl, color, {n=6, r=3, period=3.6}) -> {destroy(), refresh()}`**
Dots loop along `pathEl` (appended beside it, so they share its coordinates). Paused off-screen, static under reduced motion.
```js
bcns.flowDots(svg, svg.querySelector("path"), bcns.tools.shopify, { n: 5 });
```

**`buildCube(containerEl, {cards=true, forceOpen, autoOpen=true, onToggle(open)}) -> {open(), close(), toggle(), isOpen(), el}`**
The logo cube. Rests as the logo, turns face-on to numerals + icons; hover/focus opens, click/tap pins, Esc closes, `?open=1` forces open, reduced motion renders open.
Touch auto-opens once at ~50% in view and the hint reads "Tap to open". `cards:false` shows the cubes alone. Pillar copy lives in `bcns.pillars`.
```js
bcns.buildCube(document.getElementById("cube"), { cards: true });
```

Also exposed: `logoSvg(cls)`, `setTheme("light"|"dark")`, `tools`, `pillars`.
