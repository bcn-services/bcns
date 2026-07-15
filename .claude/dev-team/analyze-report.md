# Analysis Report
**Task:** B2 — Registry rework: nav cards, two-founder about, pricing shape, /work holding state
**Date:** 2026-07-14

## Relevant Files

- `apps/web/lib/content.ts` — all section interfaces + `siteContent` registry; primary change target for every B2 item
- `apps/web/components/nav-cards.tsx` — NavCards component; cards array is hardcoded inline (not registry-driven); change target for (a)
- `apps/web/components/about-founder.tsx` — reads `siteContent.aboutFounder`; destructures `eyebrow, title, description, cardTitleBio, cardTitleCredentials, bio, credentials`; renders SectionHeading + 2-card grid (Bio card / Credentials card); full rewrite for (b)
- `apps/web/components/past-work.tsx` — reads `siteContent.pastWork`; destructures `eyebrow, title, description, items`; maps items → Card grid (`title`, `outcome`, `link?`); change target for (d) holding state
- `apps/web/components/reviews.tsx` — reads `siteContent.reviews`; destructures `eyebrow, title, description, items`; maps items → Card grid (`quote`, `author`, `role`, `company`); change target for (d) holding state
- `apps/web/components/pricing.tsx` — reads `siteContent.pricing`; destructures `eyebrow, title, description, tiers`; maps tiers → Card grid (`name`, `price`, `description`, `features[]`); `price` is already a free string; no structural change needed, only registry data for (c)
- `apps/web/__tests__/content-registry.test.mjs` — validates 6 core section keys, required fields, all strings are `[SLOT: ...]` or step numbers, no siteConfig duplication; must be updated/extended for new section shapes
- `apps/web/__tests__/b1-multi-page-routing.test.mjs` — line 156 asserts `about page has AboutFounder`; will break if the export is renamed; update the assertion alongside any component rename
- `apps/web/app/about/page.tsx` — imports `AboutFounder`; update import if component export name changes
- `apps/web/app/work/page.tsx` — imports `PastWork` and `Reviews`; no changes needed
- `apps/web/app/pricing/page.tsx` — imports `Pricing` and `Faq`; no changes needed

## Data Flow

Registry (`content.ts`) → component destructures section key → renders JSX. No async, no server fetch — pure static import. All B2 changes follow the same pattern: (1) add/reshape interfaces in `content.ts`, (2) update `siteContent` object to match, (3) update consuming component to read new shape.

## Patterns to Follow

- Every interface lives at top of `content.ts` before `SiteContent`; named `*Content`, `*Item`, `*Tier` conventions
- `SiteContent` interface aggregates all section keys; adding a new key requires adding it to both the interface and the `siteContent` object
- All string values in `siteContent` must be `[SLOT: ...]` placeholders or step-number strings (enforced by `content-registry.test.mjs` Test 4 — `SLOT_RE = /^\[SLOT: [^\]]+\]$/`)
- Arrays use `[]` type (open-ended) for variable-length; tuples (`[A, A, A]`) only for fixed-length like `proofPoints`
- Components import from `@/lib/content` and `@bcns/ui`; icons from `lucide-react` inside component files (not registry)
- Section wrapper: `<section id="..." className="border-t border-border/60 py-24 sm:py-28">` wrapped in `<Container>`, opens with `<SectionHeading eyebrow title description />`
- NavCards uses `<Container>` + `<ul role="list">` + `<Link>` wrapping `<Card>`; no SectionHeading (it's a nav widget, not a content section)

## Likely Changes

### (a) navCards — registry-driven NavCards
- `content.ts`: add `NavCardItem { label: string; description: string; href: string }` + `NavCardsContent { items: NavCardItem[] }` interfaces; add `navCards` key to `SiteContent` and `siteContent` with 3–4 SLOT entries
- `nav-cards.tsx`: replace `const cards = [...] as const` with `siteContent.navCards.items`; field names `label/description/href` already match current inline shape — drop `as const`

### (b) Two-founder about
- `content.ts`: add `FounderItem { name: string; roleLine: string; photo?: string; bio: string; credentials: string[] }` interface; replace `AboutFounderContent` with `AboutContent { eyebrow: string; title: string; description: string; founders: [FounderItem, FounderItem]; whyBcns: string }`; rename key in `SiteContent` and `siteContent` from `aboutFounder` → `about`
- `about-founder.tsx`: full rewrite — destructure from `siteContent.about`; render two founder sub-cards (name, roleLine, bio, credentials[]) + whyBcns block; component export rename optional (e.g. `AboutSection`) but must update all references if renamed
- `apps/web/app/about/page.tsx`: update import if component is renamed
- `apps/web/__tests__/b1-multi-page-routing.test.mjs` line 156: update `"AboutFounder"` string check to new export name if renamed

### (c) Pricing shape — 3-card with tier-3 as AI consulting day-rate
- `content.ts`: `PricingTier.price` is already `string` (free-string) — no interface change needed; `tiers` is already `PricingTier[]` (open array) supporting exactly 3 entries; only update `siteContent.pricing.tiers` data when copy is ready
- `pricing.tsx`: no structural change required; `price` already renders as `<p className="text-2xl font-bold">{price}</p>` — free string renders fine

### (d) holdingState for pastWork + reviews
- `content.ts`: add `HoldingState { title: string; body: string; ctaLabel: string }` interface; add `holdingState?: HoldingState` to `PastWorkContent` and `ReviewsContent`; add SLOT values to `siteContent.pastWork.holdingState` and `siteContent.reviews.holdingState`
- `past-work.tsx`: destructure `holdingState` alongside `items`; add conditional: `items.length === 0` → render holding state card using `holdingState.title / .body / .ctaLabel`; else render existing grid unchanged
- `reviews.tsx`: same conditional pattern as `past-work.tsx`

### (e) Per-page metadata
- `content.ts`: `PageMeta { title: string; description: string }` and `PageMetaRegistry { home, services, work, pricing, about }` already exist and are fully stubbed — no changes needed to the registry shape
- Check `apps/web/app/*/page.tsx` files: if they are not yet reading from `siteContent.pageMeta` for their `export const metadata`, wire them up

## Risks

- `content-registry.test.mjs` Test 1 hardcodes only 6 core section keys — adding `navCards` / renaming `aboutFounder` → `about` won't break Test 1, but the test won't cover new keys; add assertions for `navCards`, `about`, and `holdingState` fields in the B2 QA test
- Test 4 recurses the entire `siteContent` object — `holdingState` fields and `FounderItem` string fields must all be `[SLOT: ...]` placeholders; `photo` field should be `undefined` or a SLOT (empty string would fail the regex)
- `b1-multi-page-routing.test.mjs` line 156 checks for the string `"AboutFounder"` in `app/about/page.tsx` source — if the component is renamed, this assertion fails silently at the QA gate; update that line at the same time as the rename
- `nav-cards.tsx` currently uses `as const` on the inline array giving literal types for `href`; removing it is safe — `NavCardItem.href` will be `string`, which is what `next/link`'s `href` prop accepts
- `FounderItem.founders` is a 2-tuple `[FounderItem, FounderItem]` — TypeScript will enforce exactly 2 founders; if the registry ever needs 1 or 3, the tuple must be relaxed to `FounderItem[]`
- No existing tests cover NavCards rendering, AboutFounder rendering logic, PastWork/Reviews holding state, or pricing tier count — the B2 QA test file must add all of these assertions from scratch
- `pageMeta` already exists fully stubbed; (e) is likely a wiring task in page files, not a registry task — verify each `app/*/page.tsx` actually exports `metadata` reading from registry before marking (e) done
