# PROTOTYPE round 2 — E–H (throwaway). Read BRIEF.md first; this file overrides it where they differ.

Nate's verdict on round 1: bcns style (direction D), include the cube BLOCKS somewhere,
keep C's colored dots flowing along the connectors, add velobyte's moving pieces.
Reference files (read them, borrow freely): D.html (bcns style + cube mark in SVG),
C.html (flowing colored dots), shots/ (screenshots of A–D).

## bcns style (all versions)
- Space Grotesk = headings, labels, numerals, diagram labels. Manrope = body. Light-weight
  large headlines, ONE semibold blue emphasized phrase per headline.
- Light: ground #FBFCFE, ink #2f3440 (never darker), secondary #5b6070, hairline #DDE4EE,
  tint panel #F1F6FD, blue #4a86d7 (lines/dots/accents), filled buttons #3b74c4 (AA contrast).
- Dark: ground #0F1114, ink #EDF0F4, secondary #9aa1ad, hairline #2a2f38, blue #7EB3F7 leads.
- Cube mark: the logo's 3 isometric cubes, faces top #C7DDFA / left #7EB3F7 / right #4A86D7,
  stroke a soft #3a4458 (dark mode: #0F1114 or none). Geometry: see D.html and
  apps/web/components/cube.tsx. NO text painted on cube faces (that was the unreadable bug).
- Step labels: Space Grotesk tracked caps "HOW IT WORKS | 01 / 04".

## Flowing dots (from C) — required
Each tool has a muted color: Shopify green #5f8f62, Square violet #7b6cc4, QuickBooks
teal #4f978f, Google Calendar amber #c08a3e, Gmail red #c0625a. Small dots in that color
travel continuously along each tool's connector into bcns Connect (rAF or SVG
<animateMotion>), and arrive/gather in their colors. Loop forever while the diagram is on
screen; pause when off-screen (IntersectionObserver). Reduced motion: dots static, no loop.

## Moving pieces (from velobyte) — required
The diagram is ONE persistent set of elements (tool cards, dots, rows, cubes) that MOVE and
re-arrange between steps (transform/position transitions ~600–800ms, ease-out). Never
crossfade between separate pictures. Velobyte's version: dots travel on thin labeled
hairline lanes and the same pieces carry from stage to stage.

## Steps (keep this copy, plain English)
01 Your tools stay put. — Shopify, Square, QuickBooks, Google Calendar, Gmail. You keep using them.
02 We connect them. — One connection to each, set up by us.
03 Everything in one organized place. — Customers, orders, money, appointments and messages, sorted together and kept current.
04 Ask it anything. — An AI agent or an app we build for you works on top.
   Question: "What did we sell last week?"  Answer: "$4,280 from 63 orders. Up 12% on the week before."
   (A small 7-bar chart Mon–Sun is welcome.)

## Building blocks
Content: siteContent.buildingBlocks (Connect / Deluxe builds / AI consulting). Each version
says where they live — follow it.

## Check your own work (required this round)
Render with: node /Users/nateseluga/.claude/jobs/078b87c8/tmp/shoot.mjs \
  http://127.0.0.1:8765/<X>.html /Users/nateseluga/.claude/jobs/078b87c8/tmp/s/<X> 390,768,1440 0,0.15,0.3,0.45 light
(also once with `dark` at 1440). Output PNGs: s/<X>-<width>-<frac>.png; it prints
OVERFLOW-X if the page scrolls sideways. Read the PNGs, fix what's broken (overlaps, empty
stages, unreadable text, steps not advancing), re-shoot. The server is already running.
