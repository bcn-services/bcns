# Analysis Report
**Task:** Shared codebase map for website content-migration series (W1–W4) in `apps/web`
**Date:** 2026-07-19

## Relevant Files
- `apps/web/lib/content.ts` — SINGLE SOURCE OF TRUTH. `export const siteContent: SiteContent`. Interfaces (L16–177) then registry (L183–464). Edit values here.
- `apps/web/CONTENT.md` — 1:1 mirror (905 lines). Per-field `**Field:** key.path` docs + Cross-check table (L800–882, "Total registry fields: 77") + remaining `[INPUT:]` slots (L891–898). W4 updates this 1:1.
- `apps/web/app/pricing/page.tsx` — renders `/pricing`: `<SiteHeader/> <Pricing/> <Faq/> <SiteFooter/>`; metadata from `siteContent.pageMeta.pricing`.
- `apps/web/components/pricing.tsx` — `Pricing()`; destructures `siteContent.pricing` {eyebrow,title,description,tiers}; maps `tiers` (index 2 = "isConsulting" styling), renders name/price/description/features[].
- `apps/web/components/faq.tsx` — `Faq()`; `siteContent.faq` {eyebrow,title,description,items}; maps items {question,answer}.
- `apps/web/components/hero.tsx` — `Hero()`; `siteContent.hero`; maps `proofPoints` to `<li>` (rendered on Home only).
- `apps/web/components/contact-section.tsx` — `ContactSection()`; `siteContent.contactSection`; maps `highlights` (icons by index: MessageSquare,Clock,Mail).
- Test harness: `apps/web/__tests__/*.mjs` (8 files). Run: `node --experimental-strip-types --test __tests__/*.mjs`.

## Ground-Truth Field Paths (exact current values)
- Hero proof point: `siteContent.hero.proofPoints[1]` = `"Use it forever, free"` (tuple of 3; [0]="Fixed quote before work starts", [2]="Free 30-minute consult").
- Contact "Yours to use": `siteContent.contactSection.highlights[2].title` = `"Yours to use"`; `.description` = `"Your data and accounts stay yours. It keeps running whether we work together or not."`
- FAQ cost Q: `siteContent.faq.items[0].question` = `"How much will my project cost?"`; `.answer` = `"Every project gets a fixed quote after the free consult. Standard builds run $2,000 to $5,000. Advanced builds run $5,000 to $15,000. The quote is the price. No hourly surprises."`
- Process/handoff step: `siteContent.howItWorks.items[2].title` = `"Build & handoff"` (step "03"); `.description` mentions 30 days of fixes.
- Pricing tier type: `interface PricingTier { id?; name; price; description; features: string[] }` (content.ts L92–98); section `interface PricingContent` (L100–105); registry `siteContent.pricing` (L306–348). Tiers: [0] "Standard build" `$2,000–$5,000`, [1] "Advanced build" `$5,000–$15,000`, [2] "AI consulting" `$800 / day`. Prices use en-dash `–` (use Python for exact-string checks).

## Data Flow
`content.ts` (typed const) → imported `from "@/lib/content"` by each component + each `app/**/page.tsx` → destructured, `.map()`ed → JSX. Icons live in components (mapped by array index), NOT registry. No runtime/data fetching; all static. CONTENT.md is docs-only, read only by tests (b4, content-registry), never imported by app.

## Patterns to Follow
- Registry is the ONLY place to edit copy; components/pages never hardcode strings. Match existing key nesting exactly.
- Voice rules (baseline.md): no em-dashes; en-dash only in numeric ranges; no buzzwords/"SaaS"/"we help"; no invented facts.
- Fixed tuples (do NOT change length): hero.proofPoints[3], howItWorks.items[3], useCases.items[4], contactSection.highlights[3], about.founders[2], navCards.items[4]. Open-ended: pricing.tiers, faq.items, pastWork.items, reviews.items, features[].
- CONTENT.md structure per field: `### fieldName` + `- **Field:** path` + Purpose/Tone/Length. Update Cross-check table + field count if adding/removing fields.

## Test Harness — pass/fail split (per baseline)
- PASS (must stay green): `a4-legal-pages`, `b1-multi-page-routing`, `b3-copy-wiring`, `b4-content-md`.
- FAIL (STALE, pre-existing, assert OLD shape): `a2-fix-verification` + `a2-new-sections` (reference removed `siteContent.aboutFounder`), `b2-registry-rework` (asserts about/navCards holdingState — partially current but fails), `content-registry` (asserts removed `siteContent.problemSolution` L116 + `deliveryModels` L118). Don't resurrect unless your item's `done when:` names them.
- **content-registry.test.mjs = the completeness/mirror validator** (asserts every section key exists + tuple lengths); currently STALE/FAILING because it expects `problemSolution`/`deliveryModels` which were cut from the registry.
- **b4-content-md.test.mjs = CONTENT.md↔registry mirror gate** (PASSING): asserts every `Object.keys(siteContent)` top-level key + leaf field names appear in CONTENT.md, plus `/work` flip phrase + `[INPUT:` convention. W4 must keep both green.
- b3-copy-wiring asserts exact strings: hero.headline, faq.items[0].question, pastWork.holdingState.title, tier names — editing those requires updating b3.

## Risks
- Editing hero.headline / faq.items[0].question / tier names / pastWork.holdingState.title breaks PASSING b3-copy-wiring — update assertions in lockstep.
- b4 uses `contentMd.includes(key)` substring match; removing a section key from content.ts without removing its CONTENT.md mention still passes, but adding a new section key requires a CONTENT.md mention or b4 fails.
- En-dashes in prices: shell grep silently mismatches; use Python or `scripts/readability-check.py`.
- Turbo root scripts broken; use `corepack pnpm <cmd>` inside `apps/web`. Tests need `--experimental-strip-types` (import `.ts`).
- content-registry (stale mirror validator) will keep failing until someone re-syncs it to the current registry shape — a natural W-series target but only if an item names it.
