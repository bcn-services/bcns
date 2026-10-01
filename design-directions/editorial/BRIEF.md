# PROTOTYPE — bcns home, 4 directions (throwaway)

Each direction = ONE self-contained HTML file (`A.html`…`D.html`) of the full bcns home page.
Inline CSS + vanilla JS only (no build). Google Fonts <link> is OK here (prototype only;
the real app will self-host). Served via `python3 -m http.server 8765` from this folder,
viewed inside `index.html`'s iframe switcher. Must work standalone too.

## Audience + copy
Small-business owners (shops, salons, contractors). Plain English, short lines, no
engineer vocabulary ("pipeline", "schema", "ETL", "sync engine" are banned).
Use real copy from `apps/web/lib/content.ts` (`hero`, `buildingBlocks`, `connect`,
`navCards`, `contactSection`) and `apps/web/lib/site.ts` (nav). Diagram step copy below
is a draft; keep it short like this.

## Page order
header (logo "bcns" wordmark + nav Services/Work/Pricing/About + "Book a free consult")
→ hero (badge, headline, subheadline, 2 CTAs) → THE DIAGRAM STORY (4 steps, below)
→ building blocks (3 offers: Connect / Deluxe builds / AI consulting) → nav index
(4 rows from navCards) → contact band → footer.

## The diagram (the point of the whole exercise)
ONE inline SVG that explains bcns Connect. It does not decorate. On desktop (≥1024px)
it sits in a sticky column and evolves as the reader scrolls through 4 step-text
blocks (IntersectionObserver or scroll progress → set `data-step` on the svg, CSS
transitions do the rest). Step labels in tracked uppercase mono: "HOW IT WORKS | 01 / 04".

  01  Your tools stay put. Shopify, Square, QuickBooks, Google Calendar, Gmail.
      You keep using them. (svg: 5 separate tool nodes, scattered, unconnected)
  02  We connect them. One connection to each, set up by us.
      (svg: lines draw from each tool into one central place)
  03  Everything in one organized place. Customers, orders, money, appointments and
      messages, sorted together and kept current. (svg: the center becomes an
      organized stack/table of those 5 rows)
  04  Ask it anything. An AI agent or an app we build for you works on top.
      (svg: a question "What did we sell last week?" → answer card
      "$4,280 from 63 orders. Up 12% on the week before.")

Rules:
- Phones (<768px) AND tablets (<1024px): no pinning. Stack the 4 steps, each with its
  own static copy of the svg frozen at that step. Must read cleanly at 390px wide.
- `prefers-reduced-motion`: same stacked/static rendering, no transitions.
- All text readable at its rendered size: no rotated/skewed labels, nothing under 12px.
- SVG text: add `svg text{fill:currentColor}` and color labels via CSS classes, never
  `fill="#000"` defaults. Use tool *names* in text; no brand logos.
- Content must never be invisible while scrolling: if you animate entrances, trigger
  them well before the element enters the viewport, or don't hide it at all.

## Global constraints
- No pure/near-black text. Darkest light-mode ink ≈ #33312c (warm) or #2f3440 (cool).
- One accent color, used sparingly.
- Include a light/dark toggle button in the header that flips a `data-theme` on <html>;
  both modes must look intentional.
- No horizontal scroll at 390px. 16px+ side gutter on phones.
- Not a velobyte clone: borrow method, not their layout or copy.
- Put a top-of-file comment: `<!-- PROTOTYPE direction X — <name> — throwaway -->`.
