# PROTOTYPE round 3 (throwaway). Read BRIEF.md, then BRIEF-2.md, then this (this wins on conflicts).

Nate's verdict on round 2: H's method ("take everything in, then redistribute it") for the
home diagram. The cube BLOCKS become a separate hoverable animation (like today's
apps/web/components/cube-stack.tsx hover, with more detail) that spins/opens to show the
three pillars of the business. Likely home of that animation: the /services overview.

## Style
Same bcns tokens, fonts and tool colors as BRIEF-2.md. Reference H.html (round-2 winner
method) and D.html (bcns header/footer). Header: logo + nav (Services ▾ / Work / Pricing /
About) + theme toggle + an OUTLINE button "Sign in to Connect"
(https://connect.bcn-services.com) + filled "Book a free consult". Services ▾ opens a small
menu: bcns Connect, Deluxe builds, AI consulting.

## The three pillars (draft copy, keep it this short)
01 Get organized — bcns Connect. Every tool you use, connected in one organized place. $200 a month. → /services/connect
02 Put it to work — Deluxe builds. An AI agent, an app or a dashboard, built on top of Connect around how you work. From $5,000 setup. → /services/deluxe
03 Learn to optimize — AI consulting. One day on your business: where AI actually helps, built with you, and your team using it. $1,000 a day. → /services/ai-consulting
Cube mapping: top cube = 03, left = 01, right = 02 (logo order matches cube-stack.tsx).

## Cube animation rules (I/J/K)
- Real CSS 3D cubes: read apps/web/components/cube-stack.tsx and port its geometry/rest pose
  (rotateX(-35.264deg) rotateY(45deg), preserve-3d, cqw sizing, TRAVEL seams) to vanilla JS/CSS.
  At rest it must look exactly like the bcns logo. Face colors top #C7DDFA, left #7EB3F7,
  right #4A86D7; soft edge stroke (#3a4458 light / none dark), subtle face shading.
- NEVER put readable text on a skewed face. Text appears only when a face is square to the
  viewer, or as flat HTML beside/below the cubes.
- Desktop: hover OR focus (keyboard: the stack is a button with aria-expanded) opens it;
  leaving closes it, unless clicked (click pins it open). Touch: tap toggles; auto-opens once
  when scrolled ~50% into view. Reduced motion: render open, static.
- Add `?open=1` URL param that forces the open state, so screenshots can show it.
- Page = /services overview mock: header, short page head (eyebrow "Our services", title
  "Three ways we help your business", one line), the cube animation as the centerpiece,
  the three pillars (linked), a CTA band, footer.

## Render check (required)
node /Users/nateseluga/.claude/jobs/078b87c8/tmp/shoot.mjs http://127.0.0.1:8765/<X>.html /Users/nateseluga/.claude/jobs/078b87c8/tmp/s/<X> 390,768,1440 0,0.2,0.4 light
(and `<X>.html?open=1` for I/J/K; dark once at 1440). Read the PNGs, fix, re-shoot.
