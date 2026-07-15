# Engineer Report
**Task:** B1 — Multi-page routing + thin home
**Branch:** feat/b1-multi-page-routing
**Date:** 2026-07-14

## Design Decisions
- **Routing**: Used Next.js App Router file-system routing (`app/<route>/page.tsx`) — zero config, matches existing privacy/terms pattern
- **ProblemSolution + DeliveryModels**: Excluded from all rendered pages (component files kept in repo); task spec says "remove from all pages, keep files"
- **NavCards**: Static component (no content.ts key) with 3 cards (What we build → /services, Past Work → /work, Pricing → /pricing); labels/descriptions are inline strings since these are structural navigation copy, not content-slot copy
- **pageMeta**: Added `PageMeta` + `PageMetaRegistry` interface and stub fields to `lib/content.ts` so per-page metadata reads from the registry; pages consume `siteContent.pageMeta.<key>` directly in metadata export
- **Hero CTAs**: Converted `<a>` to Next.js `<Link>` to satisfy `@next/next/no-html-link-for-pages` rule; `/#contact` targets home contact section from any page
- **Nav shape**: Kept `{ label: string; href: string }` shape from siteConfig; `as const` preserved; only 4 entries now (Services, Work, Pricing, About) in task-specified order

## Files Changed
- `apps/web/app/page.tsx` — stripped to Hero + NavCards + ContactSection; added pageMeta metadata export
- `apps/web/app/services/page.tsx` — NEW: HowItWorks + UseCases with pageMeta metadata
- `apps/web/app/pricing/page.tsx` — NEW: Pricing + Faq with pageMeta metadata
- `apps/web/app/about/page.tsx` — NEW: AboutFounder with pageMeta metadata
- `apps/web/app/work/page.tsx` — NEW: PastWork + Reviews with pageMeta metadata
- `apps/web/app/sitemap.ts` — added /services, /work, /pricing, /about at priority 0.8
- `apps/web/lib/site.ts` — replaced 10 hash-anchor nav entries with 4 page-route entries
- `apps/web/lib/content.ts` — added PageMeta/PageMetaRegistry interfaces and stub pageMeta registry entry
- `apps/web/components/site-header.tsx` — logo href `#top` → `/`; CTA `<a href="#contact">` → `<Link href="/#contact">`
- `apps/web/components/site-footer.tsx` — logo href `#top` → `/`; Contact link `#contact` → `/#contact`
- `apps/web/components/hero.tsx` — added Link import; primary CTA `#contact` → `/#contact`; secondary CTA `#examples` → `/services#examples`
- `apps/web/components/nav-cards.tsx` — NEW: 3-card navigation grid for home page

## Deferred / Out of Scope
- Actual copy for pageMeta fields (still `[SLOT: …]`) — copy task is separate
- Mobile nav/hamburger menu for subpages — existing header renders nav links hidden on mobile (`hidden md:flex`); no mobile nav exists yet
- ContactSection on subpages — contact stays home-only; CTA links point to `/#contact`

## Flags for Reviewer
- NavCards description strings are inline, not from content.ts — intentional for structural copy but flagging in case content team wants them slottable
- `/#contact` anchor linking relies on home page rendering ContactSection with `id="contact"` — verify the id is set on that component's section element
