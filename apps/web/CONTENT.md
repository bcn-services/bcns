# bcns Site Content

This document is the 1:1 companion to `apps/web/lib/content.ts`. Every field
in `siteContent` has an entry here. Use the guidance below to fill fields, add
collection entries, or extend arrays without touching any component code.

---

## Conventions

### `[INPUT: …]` placeholders

Strings marked `[INPUT: …]` are real placeholders Nate fills after test
customers confirm pricing, turnaround times, and founder details. They render
**as-is** in the live site — no code change is needed, just edit `content.ts`
and replace the `[INPUT: …]` string with the real value.

### How to fill a field

Open `apps/web/lib/content.ts`, find the key shown under **Field** in the
relevant section below, and replace the string with your real copy. Keep the
replacement within the suggested length; the component layout was designed
around those constraints and overflow will break the visual grid.

### How to add a collection entry

Find the relevant array in `content.ts` (e.g. `pastWork.items`). Copy the last
object in the array, paste it immediately after, and replace every field with
real copy. Arrays marked "open-ended" accept any number of entries. Arrays
marked "fixed tuple" cannot be extended without also updating the TypeScript
interface and the component.

### How to add a new section

1. Add a new interface (e.g. `TeamContent`) and a key to `SiteContent` in
   `content.ts`, following the existing pattern.
2. Create a component in `apps/web/components/sections/` that reads from
   `siteContent.<newKey>`.
3. Wire the component into the relevant page in `apps/web/app/` and add a nav
   entry to `apps/web/lib/site.ts` if needed.

---

## Page map

| Page | URL | Content keys used |
|------|-----|-------------------|
| Home | `/` | `hero`, `howItWorks`, `useCases`, `contactSection`, `navCards`, `pageMeta.home` |
| Services | `/services` | `howItWorks`, `useCases`, `contactSection`, `pageMeta.services` |
| Work | `/work` | `pastWork`, `reviews`, `pageMeta.work` |
| Work detail | `/work/[slug]` | `pastWork.items[n]` (title/problem/approach/outcome), `pastWork.eyebrow`, `pastWork.caseStudy` |
| Pricing | `/pricing` | `pricing`, `faq`, `contactSection`, `pageMeta.pricing` |
| About | `/about` | `about`, `contactSection`, `pageMeta.about` |
| Privacy | `/privacy` | Static — no content registry fields |
| Terms | `/terms` | Static — no content registry fields |

---

## Hero (`siteContent.hero`) — Home

The first section a visitor sees. Every word is above the fold on most screens;
be ruthless about length.

### badge
- **Field:** `hero.badge`
- **Purpose:** Small label above the headline that anchors the offering
- **Tone:** Punchy, confident, category-defining
- **Length:** ≤40 chars; typically 3-6 words

### headline
- **Field:** `hero.headline`
- **Purpose:** Primary value proposition — the single most important thing to communicate
- **Tone:** Direct, outcome-focused, no jargon
- **Length:** ≤70 chars; ideally one line on desktop (~8-12 words)

### subheadline
- **Field:** `hero.subheadline`
- **Purpose:** Expands on the headline with a concrete benefit or mechanism
- **Tone:** Plain language, credible; reads like a sentence from a trusted colleague
- **Length:** 1-2 sentences, ≤120 chars

### ctaPrimary
- **Field:** `hero.ctaPrimary`
- **Purpose:** Text for the primary CTA button (links to contact / booking)
- **Tone:** Action verb + object (e.g. "Book a Call", "Get Started")
- **Length:** 2-5 words, ≤30 chars

### ctaSecondary
- **Field:** `hero.ctaSecondary`
- **Purpose:** Text for the secondary CTA button (links to past work or about)
- **Tone:** Softer than primary; invites exploration rather than conversion
- **Length:** 2-5 words, ≤30 chars

### proofPoints[0]
- **Field:** `hero.proofPoints[0]`
- **Purpose:** First social-proof stat or trust signal displayed below the CTAs
- **Tone:** Factual, specific; a number or short claim works best
- **Length:** ≤35 chars (e.g. "12 clients served", "48-hour turnaround")

### proofPoints[1]
- **Field:** `hero.proofPoints[1]`
- **Purpose:** Second trust signal; distinct from proofPoints[0] in what it proves
- **Tone:** Same as proofPoints[0]
- **Length:** ≤35 chars

### proofPoints[2]
- **Field:** `hero.proofPoints[2]`
- **Purpose:** Third trust signal; rounds out the triptych of credibility cues
- **Tone:** Same as proofPoints[0]
- **Length:** ≤35 chars

> `proofPoints` is a fixed tuple of exactly 3 strings — do not add or remove entries.

---

## How It Works (`siteContent.howItWorks`) — Home, /services

Demystifies the engagement process. Steps are a fixed tuple of 3; the `step`
field ("01", "02", "03") is structural and is not user-facing copy.

### eyebrow
- **Field:** `howItWorks.eyebrow`
- **Purpose:** Section label above the title
- **Tone:** Neutral, process-oriented (e.g. "The Process")
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `howItWorks.title`
- **Purpose:** Section headline summarising that the process is simple or clear
- **Tone:** Reassuring; visitors are skeptical of complexity
- **Length:** ≤80 chars, 1 sentence

### description
- **Field:** `howItWorks.description`
- **Purpose:** Brief sentence contextualising what follows
- **Tone:** Plain, brief
- **Length:** 1 sentence, ≤120 chars

### items[0] — step 1 (step value = "01", fixed)

#### items[0].title
- **Field:** `howItWorks.items[0].title`
- **Purpose:** Label for the first step in the process
- **Tone:** Action-noun or verb phrase (e.g. "Discovery Call")
- **Length:** 2-5 words, ≤40 chars

#### items[0].description
- **Field:** `howItWorks.items[0].description`
- **Purpose:** 1-2 sentence description of what happens in step 1
- **Tone:** Concrete, demystifying — what does the client actually do or receive?
- **Length:** 1-2 sentences, ≤120 chars

### items[1] — step 2 (step value = "02", fixed)

#### items[1].title
- **Field:** `howItWorks.items[1].title`
- **Purpose:** Label for the second step
- **Tone:** Same as step-1 title
- **Length:** 2-5 words, ≤40 chars

#### items[1].description
- **Field:** `howItWorks.items[1].description`
- **Purpose:** Description of step 2
- **Tone:** Same as step-1 description
- **Length:** 1-2 sentences, ≤120 chars

### items[2] — step 3 (step value = "03", fixed)

#### items[2].title
- **Field:** `howItWorks.items[2].title`
- **Purpose:** Label for the final step
- **Tone:** Same as step-1 title; often the delivery/outcome moment
- **Length:** 2-5 words, ≤40 chars

#### items[2].description
- **Field:** `howItWorks.items[2].description`
- **Purpose:** Description of step 3; `[INPUT: support window]` is a placeholder for the post-delivery support period
- **Tone:** Same as step-1 description
- **Length:** 1-2 sentences, ≤120 chars

> `items` is a fixed tuple of exactly 3. The `step` field ("01"/"02"/"03") is
> structural — do not change it.

---

## Use Cases (`siteContent.useCases`) — Home, /services

Shows concrete verticals or problem types served. Four items, fixed tuple.

### eyebrow
- **Field:** `useCases.eyebrow`
- **Purpose:** Section label
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `useCases.title`
- **Purpose:** Section headline framing the variety of problems solved
- **Tone:** Direct
- **Length:** ≤80 chars

### description
- **Field:** `useCases.description`
- **Purpose:** 1 sentence contextualising the examples below
- **Tone:** Plain
- **Length:** 1 sentence, ≤120 chars

### items[0] — use case 1 (fixed)

#### items[0].tag
- **Field:** `useCases.items[0].tag`
- **Purpose:** Chip/badge label categorising the use case (e.g. "Analytics", "Automation")
- **Tone:** 1-2 word noun; category label not a sentence
- **Length:** 1-3 words, ≤25 chars

#### items[0].title
- **Field:** `useCases.items[0].title`
- **Purpose:** Title of the specific use case scenario
- **Tone:** Concrete noun phrase or problem statement
- **Length:** ≤60 chars, 4-10 words

#### items[0].description
- **Field:** `useCases.items[0].description`
- **Purpose:** 1-2 sentences describing the use case in the visitor's language
- **Tone:** Practical; reads like a mini case study brief
- **Length:** 1-2 sentences, ≤130 chars

### items[1] — use case 2 (fixed)

#### items[1].tag
- **Field:** `useCases.items[1].tag`
- **Length:** 1-3 words, ≤25 chars

#### items[1].title
- **Field:** `useCases.items[1].title`
- **Length:** ≤60 chars

#### items[1].description
- **Field:** `useCases.items[1].description`
- **Length:** 1-2 sentences, ≤130 chars

### items[2] — use case 3 (fixed)

#### items[2].tag
- **Field:** `useCases.items[2].tag`
- **Length:** 1-3 words, ≤25 chars

#### items[2].title
- **Field:** `useCases.items[2].title`
- **Length:** ≤60 chars

#### items[2].description
- **Field:** `useCases.items[2].description`
- **Length:** 1-2 sentences, ≤130 chars

### items[3] — use case 4 (fixed)

#### items[3].tag
- **Field:** `useCases.items[3].tag`
- **Length:** 1-3 words, ≤25 chars

#### items[3].title
- **Field:** `useCases.items[3].title`
- **Length:** ≤60 chars

#### items[3].description
- **Field:** `useCases.items[3].description`
- **Length:** 1-2 sentences, ≤130 chars

> `items` is a fixed tuple of exactly 4.

---

## Contact Section (`siteContent.contactSection`) — Home, /services, /pricing, /about

The conversion section. Three highlights support the CTA. Highlights are a
fixed tuple.

### eyebrow
- **Field:** `contactSection.eyebrow`
- **Purpose:** Section label above the title
- **Tone:** Action-oriented (e.g. "Get in Touch", "Work Together")
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `contactSection.title`
- **Purpose:** Main headline inviting the visitor to reach out
- **Tone:** Warm but direct; not desperate
- **Length:** ≤80 chars

### description
- **Field:** `contactSection.description`
- **Purpose:** 1-2 sentences reducing friction — what happens when they contact you?
- **Tone:** Reassuring; set expectations (e.g. response time, next step)
- **Note:** Contains `[INPUT: response-time promise]` — replace with the actual turnaround (e.g. "one business day")
- **Length:** 1-2 sentences, ≤150 chars

### highlights[0] — highlight 1 (fixed)

#### highlights[0].title
- **Field:** `contactSection.highlights[0].title`
- **Purpose:** Short heading for the first trust/logistics point (e.g. "Fast Response")
- **Tone:** Confident, benefit-focused
- **Length:** 2-5 words, ≤40 chars

#### highlights[0].description
- **Field:** `contactSection.highlights[0].description`
- **Purpose:** 1 sentence elaborating on highlight 1
- **Tone:** Specific; a concrete detail beats a vague promise
- **Length:** 1 sentence, ≤80 chars

### highlights[1] — highlight 2 (fixed)

#### highlights[1].title
- **Field:** `contactSection.highlights[1].title`
- **Length:** 2-5 words, ≤40 chars

#### highlights[1].description
- **Field:** `contactSection.highlights[1].description`
- **Length:** 1 sentence, ≤80 chars

### highlights[2] — highlight 3 (fixed)

#### highlights[2].title
- **Field:** `contactSection.highlights[2].title`
- **Length:** 2-5 words, ≤40 chars

#### highlights[2].description
- **Field:** `contactSection.highlights[2].description`
- **Length:** 1 sentence, ≤80 chars

> `highlights` is a fixed tuple of exactly 3.

---

## Past Work (`siteContent.pastWork`) — /work

Portfolio / proof section. `items` is an open-ended array — add more as
projects are completed. The `link` field is optional.

**Current state:** `pastWork.items` holds two case-study slots — `delucas`
and `l2detailz` — real bcns clients. Every narrative field (`title`,
`problem`, `approach`, `outcome`) on both ships as an `[INPUT: …]`
placeholder. **Never replace these with drafted or invented copy** — a
fabricated metric on a live marketing site is a false claim about a real
business. Fill each field only with the real, confirmed detail for that
client, then remove the `[INPUT: …]` wrapper.

**Why `screenshots` ships as `[]` on both entries:** a placeholder `src`
would point at an image file that doesn't exist yet — screenshots get
captured in a later pass. An empty array avoids shipping a broken image
reference; populate it once real screenshot files exist.

**Why `link` is omitted on both entries:** it's optional, and
`past-work.tsx` renders `{link}` as the visible anchor text — a placeholder
href would render as a broken, misleading link. Add the field only once a
real project URL exists.

### eyebrow
- **Field:** `pastWork.eyebrow`
- **Purpose:** Section label
- **Tone:** Factual (e.g. "Selected Work", "Portfolio")
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `pastWork.title`
- **Purpose:** Section headline drawing attention to results
- **Tone:** Outcomes-first; hint at measurable impact
- **Length:** ≤80 chars

### description
- **Field:** `pastWork.description`
- **Purpose:** 1-2 sentences contextualising the work shown
- **Tone:** Confident but not boastful
- **Length:** 1-2 sentences, ≤150 chars

### items[n] — case-study entries (open-ended array)

Each entry has:

#### items[n].slug
- **Field:** `pastWork.items[n].slug`
- **Purpose:** Stable, URL-safe identifier for the case study (React list key; also the `/work/[slug]` detail-page route param)
- **Tone:** N/A (identifier, not copy)
- **Note:** Must be unique across `items` and match `^[a-z0-9-]+$`. Current values: `delucas`, `l2detailz`. Set once; do not change after a detail page or external link depends on it.
- **Length:** Short, lowercase, hyphenated

#### items[n].title
- **Field:** `pastWork.items[n].title`
- **Purpose:** Project or engagement name
- **Tone:** Neutral noun phrase (client-safe if needed)
- **Note:** Both current entries carry an `[INPUT: …]` placeholder — the display form of a client's name is Nate's call; fill with the real, confirmed title.
- **Length:** ≤60 chars

#### items[n].problem
- **Field:** `pastWork.items[n].problem`
- **Purpose:** What the client's business struggled with before the build — the "why" that motivated the project
- **Tone:** Specific, client-safe; describe the friction, not a generic pain point
- **Note:** `[INPUT: …]` placeholder on both current entries. DeLuca's and L2 Detailz are real businesses — never draft or invent this copy; fill only with the confirmed detail.
- **Length:** 1-2 sentences, ≤150 chars

#### items[n].approach
- **Field:** `pastWork.items[n].approach`
- **Purpose:** What bcns built and how it addressed the problem
- **Tone:** Concrete; name the mechanism, not just "we built software"
- **Note:** `[INPUT: …]` placeholder on both current entries — same anti-fabrication rule as `problem`.
- **Length:** 1-2 sentences, ≤150 chars

#### items[n].outcome
- **Field:** `pastWork.items[n].outcome`
- **Purpose:** The measurable or qualitative result — the "so what"
- **Tone:** Specific, evidence-driven; include numbers where possible
- **Note:** `[INPUT: …]` placeholder on both current entries. Never fill with a plausible-sounding metric — only a number or result the client has confirmed. A fabricated outcome on a live site is a false claim about a real business.
- **Length:** 1-2 sentences, ≤120 chars

#### items[n].screenshots
- **Field:** `pastWork.items[n].screenshots`
- **Purpose:** Array of `{ src, alt, caption }` objects shown alongside the case study
- **Note:** Ships as `[]` on both current entries — screenshot capture is a later pass. See "Why `screenshots` ships as `[]`" above before adding placeholder paths.

##### items[n].screenshots[m].src
- **Field:** `pastWork.items[n].screenshots[m].src`
- **Purpose:** Path or URL to the screenshot image asset
- **Tone:** N/A (path/URL only)
- **Length:** Valid path/URL; must point at a file that actually exists — a missing file fails the build

##### items[n].screenshots[m].alt
- **Field:** `pastWork.items[n].screenshots[m].alt`
- **Purpose:** Accessible alt text describing the screenshot's content
- **Tone:** Descriptive, concrete — what does the image show?
- **Length:** ≤120 chars

##### items[n].screenshots[m].caption
- **Field:** `pastWork.items[n].screenshots[m].caption`
- **Purpose:** Visible caption shown under the screenshot
- **Tone:** Short, factual
- **Length:** ≤100 chars

#### items[n].link _(optional)_
- **Field:** `pastWork.items[n].link`
- **Purpose:** URL to a live project, case study, or write-up
- **Tone:** N/A (URL only)
- **Note:** Omitted on both current entries — see "Why `link` is omitted" above.
- **Length:** Valid URL; omit field entirely if no link exists

### holdingState — shown when items[] is empty

#### holdingState.title
- **Field:** `pastWork.holdingState.title`
- **Purpose:** Heading shown in the empty-state card before any work is added
- **Tone:** Honest, low-key
- **Length:** ≤80 chars

#### holdingState.body
- **Field:** `pastWork.holdingState.body`
- **Purpose:** 1-2 sentences explaining the holding state and what to expect
- **Tone:** Transparent; build trust, not hype
- **Length:** 1-2 sentences, ≤200 chars

#### holdingState.ctaLabel
- **Field:** `pastWork.holdingState.ctaLabel`
- **Purpose:** CTA link text shown inside the holding state
- **Tone:** Inviting; direct the visitor to action
- **Length:** ≤80 chars

#### holdingState.ctaHref
- **Field:** `pastWork.holdingState.ctaHref`
- **Purpose:** URL for the CTA link (e.g. `/#contact`)
- **Tone:** N/A (URL only)

> **Adding work:** append `{ slug, title, problem, approach, outcome, screenshots, link? }`
> objects to `pastWork.items`. `slug` must be unique and match `^[a-z0-9-]+$`;
> `screenshots` defaults to `[]`; `link` is optional. When `items.length > 0`,
> the holding state is hidden automatically — `pastWork.items` is no longer
> empty as of this pass, so the item grid (not the holding state) is what
> currently renders on `/work`.

### caseStudy — section labels for the `/work/[slug]` detail page

Structural labels (not narrative copy) shown above each of the three blocks
on a case study's detail page at `app/work/[slug]/page.tsx`. Same labels on
every case study — not per-item.

#### caseStudy.backLabel
- **Field:** `pastWork.caseStudy.backLabel`
- **Purpose:** Label on the link back to `/work`, shown above the title on every case study detail page. Currently `Back to Work`.
- **Tone:** Short, factual noun phrase
- **Length:** 1-4 words

#### caseStudy.problemLabel
- **Field:** `pastWork.caseStudy.problemLabel`
- **Purpose:** Section label above `items[n].problem` on the detail page. Currently `The problem`.
- **Tone:** Short, factual noun phrase
- **Length:** 1-3 words

#### caseStudy.approachLabel
- **Field:** `pastWork.caseStudy.approachLabel`
- **Purpose:** Section label above `items[n].approach` on the detail page. Currently `Our approach`.
- **Tone:** Short, factual noun phrase
- **Length:** 1-3 words

#### caseStudy.outcomeLabel
- **Field:** `pastWork.caseStudy.outcomeLabel`
- **Purpose:** Section label above `items[n].outcome` on the detail page. Currently `The outcome`.
- **Tone:** Short, factual noun phrase
- **Length:** 1-3 words

---

## Reviews (`siteContent.reviews`) — /work

Social proof via client quotes. `items` is an open-ended array.

**How to flip reviews live:** Add an entry to `reviews.items` — the holding
state disappears automatically. No code change needed.

### eyebrow
- **Field:** `reviews.eyebrow`
- **Purpose:** Section label (e.g. "Client Feedback", "Testimonials")
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `reviews.title`
- **Purpose:** Section headline building anticipation for the quotes
- **Tone:** Confident; let the quotes do the selling
- **Length:** ≤80 chars

### description
- **Field:** `reviews.description`
- **Purpose:** Optional 1-sentence bridge before the quote cards
- **Tone:** Low-key; don't oversell
- **Length:** 1 sentence, ≤120 chars

### items[n] — review entries (open-ended array)

Each entry has:

#### items[n].quote
- **Field:** `reviews.items[n].quote`
- **Purpose:** Verbatim or lightly edited testimonial text
- **Tone:** Authentic; preserve the client's voice — don't polish into marketing-speak
- **Length:** 1-3 sentences, ≤200 chars recommended

#### items[n].author
- **Field:** `reviews.items[n].author`
- **Purpose:** Full name of the person giving the review
- **Length:** ≤50 chars

#### items[n].role
- **Field:** `reviews.items[n].role`
- **Purpose:** Job title of the reviewer
- **Length:** ≤50 chars

#### items[n].company
- **Field:** `reviews.items[n].company`
- **Purpose:** Company or organisation the reviewer works at
- **Length:** ≤50 chars

### holdingState — shown when items[] is empty

#### holdingState.title
- **Field:** `reviews.holdingState.title`
- **Purpose:** Heading shown in the empty-state card
- **Length:** ≤80 chars

#### holdingState.body
- **Field:** `reviews.holdingState.body`
- **Purpose:** 1-2 sentences explaining the holding state
- **Length:** 1-2 sentences, ≤200 chars

#### holdingState.ctaLabel
- **Field:** `reviews.holdingState.ctaLabel`
- **Purpose:** CTA link text shown in the holding state
- **Length:** ≤80 chars

#### holdingState.ctaHref
- **Field:** `reviews.holdingState.ctaHref`
- **Purpose:** URL for the CTA link
- **Tone:** N/A (URL only)

> **Adding reviews:** append `{ quote, author, role, company }` objects to
> `reviews.items`. When `items.length > 0`, the holding state is hidden automatically.

---

## Pricing (`siteContent.pricing`) — /pricing

Communicates value and sets expectations. `tiers` is an open-ended array
(3 pre-seeded). Each tier's `features` array is also open-ended.

### eyebrow
- **Field:** `pricing.eyebrow`
- **Purpose:** Section label (e.g. "Pricing", "Investment")
- **Tone:** Neutral; avoid "cheap" or "affordable" framing
- **Length:** 1-3 words, ≤25 chars

### title
- **Field:** `pricing.title`
- **Purpose:** Section headline framing pricing as straightforward or value-driven
- **Tone:** Confident; transparency builds trust
- **Length:** ≤80 chars

### description
- **Field:** `pricing.description`
- **Purpose:** 1-2 sentences setting expectations
- **Tone:** Honest; don't over-promise
- **Length:** 1-2 sentences, ≤150 chars

### tiers[0] — Standard build

#### tiers[0].id _(optional)_
- **Field:** `pricing.tiers[0].id`
- **Purpose:** Internal identifier for the tier; used by components for scroll anchors or comparison logic. Not displayed.
- **Note:** Leave undefined unless a component explicitly needs it.

#### tiers[0].name
- **Field:** `pricing.tiers[0].name`
- **Purpose:** Display name for the first pricing tier. Currently `Standard build`.
- **Tone:** Descriptive noun; signals the scope of the tier
- **Length:** 1-3 words, ≤25 chars

#### tiers[0].price
- **Field:** `pricing.tiers[0].price`
- **Purpose:** Headline price string shown on the card. Currently `$1,000 setup`.
- **Tone:** N/A (formatted value)
- **Length:** ≤20 chars

#### tiers[0].setup _(optional)_
- **Field:** `pricing.tiers[0].setup`
- **Purpose:** One-time setup fee, spelled out. Currently `$1,000 one-time setup`.
- **Tone:** N/A (formatted value)
- **Note:** Optional field on build tiers; the AI consulting tier (tiers[2]) omits it.
- **Length:** ≤30 chars

#### tiers[0].monthly _(optional)_
- **Field:** `pricing.tiers[0].monthly`
- **Purpose:** Flat monthly hosting/support fee. Currently `$149/mo`.
- **Tone:** N/A (formatted value)
- **Note:** Optional; consulting tier omits it.
- **Length:** ≤20 chars

#### tiers[0].seats _(optional)_
- **Field:** `pricing.tiers[0].seats`
- **Purpose:** Included-user allowance and per-seat overage. Currently `Includes up to 15 users, then $20/user per month.`
- **Tone:** Plain, factual
- **Note:** Optional; consulting tier omits it.
- **Length:** 1 sentence, ≤60 chars

#### tiers[0].description
- **Field:** `pricing.tiers[0].description`
- **Purpose:** 1 sentence describing who this tier is for
- **Tone:** Direct; "a single-purpose tool…"
- **Length:** 1 sentence, ≤100 chars

#### tiers[0].features[n] (open-ended array)
- **Field:** `pricing.tiers[0].features`
- **Purpose:** Bullet list of deliverables/inclusions for tier 0
- **Note:** features[1] = `Delivered in about a week`; features[2] = `30 days of fixes and tweaks included`; features[3] = `One year of bug fixes, free`
- **Tone:** Concrete noun phrase
- **Length:** ≤60 chars per item

### tiers[1] — Advanced build

#### tiers[1].id _(optional)_
- **Field:** `pricing.tiers[1].id`
- **Purpose:** Same as tiers[0].id

#### tiers[1].name
- **Field:** `pricing.tiers[1].name`
- **Purpose:** Currently `Advanced build`.
- **Length:** 1-3 words, ≤25 chars

#### tiers[1].price
- **Field:** `pricing.tiers[1].price`
- **Purpose:** Headline price string shown on the card. Currently `$3,000 setup`.
- **Length:** ≤20 chars

#### tiers[1].setup _(optional)_
- **Field:** `pricing.tiers[1].setup`
- **Purpose:** One-time setup fee, spelled out. Currently `$3,000 one-time setup`.
- **Note:** Optional; consulting tier omits it.
- **Length:** ≤30 chars

#### tiers[1].monthly _(optional)_
- **Field:** `pricing.tiers[1].monthly`
- **Purpose:** Flat monthly hosting/support fee. Currently `$349/mo`.
- **Note:** Optional; consulting tier omits it.
- **Length:** ≤20 chars

#### tiers[1].seats _(optional)_
- **Field:** `pricing.tiers[1].seats`
- **Purpose:** Included-user allowance and per-seat overage. Currently `Includes up to 15 users, then $20/user per month.`
- **Note:** Optional; consulting tier omits it.
- **Length:** 1 sentence, ≤60 chars

#### tiers[1].description
- **Field:** `pricing.tiers[1].description`
- **Length:** 1 sentence, ≤100 chars

#### tiers[1].features[n] (open-ended array)
- **Field:** `pricing.tiers[1].features`
- **Note:** features[1] = `Delivered in two to three weeks`; features[2] = `30 days of fixes and tweaks included`; features[3] = `One year of bug fixes, free`
- **Length:** ≤60 chars per item

### tiers[2] — AI consulting

#### tiers[2].id _(optional)_
- **Field:** `pricing.tiers[2].id`
- **Purpose:** Same as tiers[0].id

#### tiers[2].name
- **Field:** `pricing.tiers[2].name`
- **Length:** 1-3 words, ≤25 chars

#### tiers[2].price
- **Field:** `pricing.tiers[2].price`
- **Purpose:** Price string. Currently `$800 / day`.
- **Note:** AI consulting is a day-rate engagement, so it omits the optional `setup`, `monthly`, and `seats` fields the two build tiers carry.
- **Length:** ≤20 chars

#### tiers[2].description
- **Field:** `pricing.tiers[2].description`
- **Length:** 1 sentence, ≤100 chars

#### tiers[2].features[n] (open-ended array)
- **Field:** `pricing.tiers[2].features`
- **Length:** ≤60 chars per item

> **Extending tier features:** each `features` array is open-ended — append
> strings to add bullet points. No interface change needed.

---

## FAQ (`siteContent.faq`) — /pricing

Addresses objections and reduces friction before the visitor contacts you.
`items` is an open-ended array (7 pre-seeded).

### eyebrow
- **Field:** `faq.eyebrow`
- **Purpose:** Section label (e.g. "FAQ", "Common Questions")
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `faq.title`
- **Purpose:** Section headline framing that questions will be answered directly
- **Tone:** Honest and confident
- **Length:** ≤80 chars

### description
- **Field:** `faq.description`
- **Purpose:** 1 sentence inviting further contact if the question isn't covered
- **Tone:** Open, welcoming
- **Length:** 1 sentence, ≤120 chars

### items[n] — FAQ entries (open-ended array)

#### items[n].question
- **Field:** `faq.items[n].question`
- **Purpose:** A question visitors have
- **Tone:** Written as the visitor would phrase it — use "you/your" not "clients"
- **Note:** Several answers contain `[INPUT: …]` placeholders for pricing/turnaround/support details
- **Length:** 1 sentence, ≤100 chars

#### items[n].answer
- **Field:** `faq.items[n].answer`
- **Purpose:** Direct, complete answer
- **Tone:** Honest; if the answer has caveats, name them
- **Length:** 1-3 sentences, ≤200 chars

#### Seeded questions (current `faq.items` order)

The seven pre-seeded entries, in order, are:

0. **How much will my project cost?** — Setup + monthly framing: Standard is $1,000 setup and $149/mo, Advanced is $3,000 setup and $349/mo, both include up to 15 users then $20/user per month. Exact numbers come in the fixed quote after the free consult.
1. **How long does a build take?** — About a week for single tools, two to three weeks for connected systems; delivery date lands with the quote.
2. **What happens if something breaks after delivery?** — 30 days of no-questions fixes, then a year of free bug fixes on what was built; new features quoted separately.
3. **Do I need to be technical to work with you?** — No; questions are about the business, and everything ships with a plain-English walkthrough.
4. **What does the monthly fee cover?** — Hosting, uptime, daily backups, security patches, bug fixes, and small tweaks, run on bcns servers so the team reaches it from any device with a login.
5. **Does my tool use AI, and how does that get billed?** — AI is optional; if used, the client brings their own Anthropic key and Anthropic bills them directly, so they control that cost and can leave AI out entirely.
6. **What happens if I stop paying the monthly fee?** — Hosting stops and the live tool goes offline, but the data is always the client's; bcns exports it and hands it over before shutting anything down. No lock-in.

> **Adding more FAQs:** append `{ question, answer }` objects to `faq.items`.
> No interface or component change needed.

---

## About (`siteContent.about`) — /about

Two-founder credibility section.

### eyebrow
- **Field:** `about.eyebrow`
- **Purpose:** Section label (e.g. "About", "The Team")
- **Tone:** Grounding; signals humans behind the business
- **Length:** 1-4 words, ≤30 chars

### title
- **Field:** `about.title`
- **Purpose:** Headline introducing the founders
- **Tone:** Warm but professional
- **Length:** ≤80 chars

### description
- **Field:** `about.description`
- **Purpose:** 1 sentence positioning the duo
- **Tone:** Brief, personal
- **Length:** 1 sentence, ≤100 chars

### founders[] — two-founder model (fixed tuple of 2)

Each founder entry has:

#### founders[n].name
- **Field:** `about.founders[n].name`
- **Purpose:** Full display name of the founder
- **Length:** ≤50 chars

#### founders[n].roleLine
- **Field:** `about.founders[n].roleLine`
- **Purpose:** One-line role description shown under the name (e.g. "Engineering", "Business & clients")
- **Tone:** Short noun phrase; signals what each founder owns
- **Length:** ≤40 chars

#### founders[n].photo _(optional)_
- **Field:** `about.founders[n].photo`
- **Purpose:** Path or URL to the founder's headshot
- **Note:** Contains `[INPUT: photo]` — replace with the real asset path or URL when available. Omit field entirely if no photo exists.
- **Length:** Valid path/URL

#### founders[n].bio
- **Field:** `about.founders[n].bio`
- **Purpose:** 1-3 paragraph biography — the founder's story, expertise, and why they do this work
- **Tone:** Specific/evidence-driven, no marketing fluff
- **Note:** Nate's bio is written. Brandon's bio leads with `[INPUT: business experience summary]` — fill with the specific businesses/roles when ready.
- **Length:** 100-300 words; shorter is better if every sentence earns its place

#### founders[n].credentials[] (open-ended array)
- **Field:** `about.founders[n].credentials`
- **Purpose:** Bullet list of credentials (degrees, former employers, notable achievements)
- **Tone:** Factual noun phrase
- **Note:** Nate: one credential line (Harvey Mudd CS) — no placeholders remain. Brandon: `[INPUT: NYU program]`, `[INPUT: credential 2]`, `[INPUT: credential 3]` — fill when confirmed.
- **Length:** ≤80 chars per item; append strings to add more

### whyBcns
- **Field:** `about.whyBcns`
- **Purpose:** 2-3 sentences explaining why Nate and Brandon started bcns and what they want it to be
- **Tone:** Personal, honest; written in the voice of the founders
- **Note:** C1 pass wrote the founding story. Edit in place if the framing evolves.
- **Length:** 2-3 sentences, ≤250 chars

> `founders` is a fixed tuple of exactly 2. Adding a third founder requires updating the interface and the component.

---

## Nav Cards (`siteContent.navCards`) — Home

Navigation card grid linking to the main pages. Fixed tuple of 4.

### items[0]
- **Field:** `navCards.items[0].title` — Display title of card 0
- **Field:** `navCards.items[0].description` — 1 sentence description of what the linked page covers
- **Field:** `navCards.items[0].href` — Link destination (e.g. `/services`)

### items[1]
- **Field:** `navCards.items[1].title`
- **Field:** `navCards.items[1].description`
- **Field:** `navCards.items[1].href`

### items[2]
- **Field:** `navCards.items[2].title`
- **Field:** `navCards.items[2].description`
- **Field:** `navCards.items[2].href`

### items[3]
- **Field:** `navCards.items[3].title`
- **Field:** `navCards.items[3].description`
- **Field:** `navCards.items[3].href`

> `items` is a fixed tuple of exactly 4. Do not add or remove cards without
> updating the interface and the component.

---

## Page Meta (`siteContent.pageMeta`)

SEO `<title>` and `<meta name="description">` for each page. All values are
filled as of the C1 pass. Edit in place if positioning language changes.

### pageMeta.home

#### pageMeta.home.title
- **Field:** `pageMeta.home.title`
- **Length:** 50-60 chars (browser truncates beyond ~60)

#### pageMeta.home.description
- **Field:** `pageMeta.home.description`
- **Length:** 140-160 chars

### pageMeta.services

#### pageMeta.services.title
- **Field:** `pageMeta.services.title`
- **Length:** 50-60 chars

#### pageMeta.services.description
- **Field:** `pageMeta.services.description`
- **Length:** 140-160 chars

### pageMeta.work

#### pageMeta.work.title
- **Field:** `pageMeta.work.title`
- **Length:** 50-60 chars

#### pageMeta.work.description
- **Field:** `pageMeta.work.description`
- **Length:** 140-160 chars

### pageMeta.pricing

#### pageMeta.pricing.title
- **Field:** `pageMeta.pricing.title`
- **Length:** 50-60 chars

#### pageMeta.pricing.description
- **Field:** `pageMeta.pricing.description`
- **Length:** 140-160 chars

### pageMeta.about

#### pageMeta.about.title
- **Field:** `pageMeta.about.title`
- **Length:** 50-60 chars

#### pageMeta.about.description
- **Field:** `pageMeta.about.description`
- **Length:** 140-160 chars

---

## Cross-check

Registry keys in `siteContent` and their CONTENT.md coverage:

| Registry key | CONTENT.md section |
|---|---|
| `hero.badge` | Hero — badge |
| `hero.headline` | Hero — headline |
| `hero.subheadline` | Hero — subheadline |
| `hero.ctaPrimary` | Hero — ctaPrimary |
| `hero.ctaSecondary` | Hero — ctaSecondary |
| `hero.proofPoints[0..2]` | Hero — proofPoints |
| `howItWorks.eyebrow` | How It Works — eyebrow |
| `howItWorks.title` | How It Works — title |
| `howItWorks.description` | How It Works — description |
| `howItWorks.items[0..2].title` | How It Works — items step titles |
| `howItWorks.items[0..2].description` | How It Works — items step descriptions |
| `howItWorks.items[0..2].step` | Structural (not user-facing) — noted |
| `useCases.eyebrow` | Use Cases — eyebrow |
| `useCases.title` | Use Cases — title |
| `useCases.description` | Use Cases — description |
| `useCases.items[0..3].tag` | Use Cases — items tags |
| `useCases.items[0..3].title` | Use Cases — items titles |
| `useCases.items[0..3].description` | Use Cases — items descriptions |
| `contactSection.eyebrow` | Contact Section — eyebrow |
| `contactSection.title` | Contact Section — title |
| `contactSection.description` | Contact Section — description |
| `contactSection.highlights[0..2].title` | Contact Section — highlights titles |
| `contactSection.highlights[0..2].description` | Contact Section — highlights descriptions |
| `pastWork.eyebrow` | Past Work — eyebrow |
| `pastWork.title` | Past Work — title |
| `pastWork.description` | Past Work — description |
| `pastWork.items[n].slug` | Past Work — items slug |
| `pastWork.items[n].title` | Past Work — items title |
| `pastWork.items[n].problem` | Past Work — items problem |
| `pastWork.items[n].approach` | Past Work — items approach |
| `pastWork.items[n].outcome` | Past Work — items outcome |
| `pastWork.items[n].screenshots` | Past Work — items screenshots |
| `pastWork.items[n].screenshots[m].src` | Past Work — items screenshots src |
| `pastWork.items[n].screenshots[m].alt` | Past Work — items screenshots alt |
| `pastWork.items[n].screenshots[m].caption` | Past Work — items screenshots caption |
| `pastWork.items[n].link` _(optional)_ | Past Work — items link |
| `pastWork.holdingState.title` | Past Work — holdingState title |
| `pastWork.holdingState.body` | Past Work — holdingState body |
| `pastWork.holdingState.ctaLabel` | Past Work — holdingState ctaLabel |
| `pastWork.holdingState.ctaHref` | Past Work — holdingState ctaHref |
| `pastWork.caseStudy.backLabel` | Past Work — caseStudy backLabel |
| `pastWork.caseStudy.problemLabel` | Past Work — caseStudy problemLabel |
| `pastWork.caseStudy.approachLabel` | Past Work — caseStudy approachLabel |
| `pastWork.caseStudy.outcomeLabel` | Past Work — caseStudy outcomeLabel |
| `reviews.eyebrow` | Reviews — eyebrow |
| `reviews.title` | Reviews — title |
| `reviews.description` | Reviews — description |
| `reviews.items[n].quote` | Reviews — items quote |
| `reviews.items[n].author` | Reviews — items author |
| `reviews.items[n].role` | Reviews — items role |
| `reviews.items[n].company` | Reviews — items company |
| `reviews.holdingState.title` | Reviews — holdingState title |
| `reviews.holdingState.body` | Reviews — holdingState body |
| `reviews.holdingState.ctaLabel` | Reviews — holdingState ctaLabel |
| `reviews.holdingState.ctaHref` | Reviews — holdingState ctaHref |
| `pricing.eyebrow` | Pricing — eyebrow |
| `pricing.title` | Pricing — title |
| `pricing.description` | Pricing — description |
| `pricing.tiers[0..2].id` | Pricing — tiers id |
| `pricing.tiers[0..2].name` | Pricing — tiers name |
| `pricing.tiers[0..2].price` | Pricing — tiers price |
| `pricing.tiers[0..1].setup` _(optional)_ | Pricing — tiers setup |
| `pricing.tiers[0..1].monthly` _(optional)_ | Pricing — tiers monthly |
| `pricing.tiers[0..1].seats` _(optional)_ | Pricing — tiers seats |
| `pricing.tiers[0..2].description` | Pricing — tiers description |
| `pricing.tiers[0..2].features[n]` | Pricing — tiers features |
| `faq.eyebrow` | FAQ — eyebrow |
| `faq.title` | FAQ — title |
| `faq.description` | FAQ — description |
| `faq.items[n].question` | FAQ — items question |
| `faq.items[n].answer` | FAQ — items answer |
| `about.eyebrow` | About — eyebrow |
| `about.title` | About — title |
| `about.description` | About — description |
| `about.founders[0..1].name` | About — founders name |
| `about.founders[0..1].roleLine` | About — founders roleLine |
| `about.founders[0..1].photo` | About — founders photo |
| `about.founders[0..1].bio` | About — founders bio |
| `about.founders[0..1].credentials[n]` | About — founders credentials |
| `about.whyBcns` | About — whyBcns |
| `navCards.items[0..3].title` | Nav Cards — items title |
| `navCards.items[0..3].description` | Nav Cards — items description |
| `navCards.items[0..3].href` | Nav Cards — items href |
| `pageMeta.home.title` | Page Meta — home title |
| `pageMeta.home.description` | Page Meta — home description |
| `pageMeta.services.title` | Page Meta — services title |
| `pageMeta.services.description` | Page Meta — services description |
| `pageMeta.work.title` | Page Meta — work title |
| `pageMeta.work.description` | Page Meta — work description |
| `pageMeta.pricing.title` | Page Meta — pricing title |
| `pageMeta.pricing.description` | Page Meta — pricing description |
| `pageMeta.about.title` | Page Meta — about title |
| `pageMeta.about.description` | Page Meta — about description |

Total registry fields: 93 — counted as one row per field path in the table above, optional fields (`setup`, `monthly`, `seats`, `link`) and container fields (`screenshots`) included. That is 92 before this pass + the 1 new `pastWork.caseStudy.backLabel` field added here for the `/work/[slug]` detail page's back-to-work link. This count is re-derived by script from the table above each time it changes, never hand-incremented (`node -e` counting Cross-check table rows). All have a CONTENT.md entry. No orphans in either direction.

The three hosting FAQ entries added in this pass (monthly-fee coverage, bring-your-own-Anthropic-key, stop-paying handoff) live in the open-ended `faq.items` array and are covered by the generic `faq.items[n].question` / `faq.items[n].answer` rows above — they add entries, not new field paths.

---

## Remaining `[INPUT: …]` slots (Needs-Nate)

These are the `[INPUT: …]` slots remaining in `content.ts`. All pricing,
turnaround, response-time, support-window, and page-meta slots are filled.

| Field | Slot |
|---|---|
| `about.founders[0].photo` | `[INPUT: photo]` |
| `about.founders[1].photo` | `[INPUT: photo]` |
| `about.founders[1].bio` (opening) | `[INPUT: business experience summary]` |
| `about.founders[1].credentials[0]` | `[INPUT: NYU program]` |
| `about.founders[1].credentials[1]` | `[INPUT: credential 2]` |
| `about.founders[1].credentials[2]` | `[INPUT: credential 3]` |
| `pastWork.items[0].title` (delucas) | `[INPUT: delucas case study title]` |
| `pastWork.items[0].problem` (delucas) | `[INPUT: delucas problem]` |
| `pastWork.items[0].approach` (delucas) | `[INPUT: delucas approach]` |
| `pastWork.items[0].outcome` (delucas) | `[INPUT: delucas outcome]` |
| `pastWork.items[1].title` (l2detailz) | `[INPUT: l2detailz case study title]` |
| `pastWork.items[1].problem` (l2detailz) | `[INPUT: l2detailz problem]` |
| `pastWork.items[1].approach` (l2detailz) | `[INPUT: l2detailz approach]` |
| `pastWork.items[1].outcome` (l2detailz) | `[INPUT: l2detailz outcome]` |

DeLuca's and L2 Detailz are real bcns clients — fill these eight slots only
with confirmed detail from each client, never drafted or invented copy.

**`reviews.items`** is still an empty array, not a placeholder — add entries
to it to flip reviews live. `pastWork.items` is no longer empty (it holds
the two case-study slots above); its `screenshots` field on both entries is
an empty array by design (see the Past Work section) and stays that way
until real screenshot files exist.

---

_Last updated: 2026-07-27 (Added `pastWork.caseStudy.backLabel` — the label on the `/work/[slug]` detail page's back-to-work link, alongside the existing `problemLabel`/`approachLabel`/`outcomeLabel` section labels). Source of truth: `apps/web/lib/content.ts`._
