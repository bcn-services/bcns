# bcns Site Content

This document is the 1:1 companion to `apps/web/lib/content.ts`. Every slot in
the registry has an entry here. Use the guidance below to fill slots, add
collection entries, or add new sections without breaking the build.

---

## How to fill a slot

Open `apps/web/lib/content.ts` and search for the `[SLOT: …]` string shown
under **Slot** in the relevant section below. Replace the entire quoted string
— including the brackets — with your real copy. Keep the replacement within the
suggested length; the component layout was designed around those constraints and
overflow will break the visual grid.

## How to add a collection entry

Find the relevant array in `content.ts` (e.g. `pastWork.items`). Copy the last
object in the array, paste it immediately after, and replace every `[SLOT: …]`
value with real copy or a new placeholder. The TypeScript interfaces for
fixed-length sections (hero `proofPoints`, `problemSolution.items`, etc.) are
tuple types — you cannot add or remove entries there without updating the
interface and the component simultaneously.

## How to add a new section

1. Add a new interface (e.g. `TeamContent`) and a key to `SiteContent` in
   `content.ts`, following the existing pattern.
2. Create a component in `apps/web/components/sections/` that reads from
   `siteContent.<newKey>`.
3. Wire the component into `apps/web/app/page.tsx` and add a nav entry to
   `apps/web/lib/site.ts` if the section should appear in the navigation.

---

## Hero (`siteContent.hero`)

The first section a visitor sees. Every word is above the fold on most screens;
be ruthless about length.

### badge
- **Slot:** `[SLOT: hero/badge]`
- **Purpose:** Small label above the headline that anchors the offering (e.g. a category or tagline chip)
- **Tone:** Punchy, confident, category-defining
- **Length:** ≤40 chars; typically 3-6 words

### headline
- **Slot:** `[SLOT: hero/headline]`
- **Purpose:** Primary value proposition — the single most important thing to communicate
- **Tone:** Direct, outcome-focused, no jargon
- **Length:** ≤70 chars; ideally one line on desktop (~8-12 words)

### subheadline
- **Slot:** `[SLOT: hero/subheadline]`
- **Purpose:** Expands on the headline with a concrete benefit or mechanism
- **Tone:** Plain language, credible; reads like a sentence from a trusted colleague
- **Length:** 1-2 sentences, ≤120 chars

### ctaPrimary
- **Slot:** `[SLOT: hero/cta-primary]`
- **Purpose:** Text for the primary call-to-action button (links to contact / booking)
- **Tone:** Action verb + object (e.g. "Book a Call", "Get Started")
- **Length:** 2-5 words, ≤30 chars

### ctaSecondary
- **Slot:** `[SLOT: hero/cta-secondary]`
- **Purpose:** Text for the secondary CTA button (links to past work or about)
- **Tone:** Softer than primary; invites exploration rather than conversion
- **Length:** 2-5 words, ≤30 chars

### proofPoints[0] — proof-point-1
- **Slot:** `[SLOT: hero/proof-point-1]`
- **Purpose:** First social-proof stat or trust signal displayed below the CTAs
- **Tone:** Factual, specific; a number or short claim works best
- **Length:** ≤35 chars (e.g. "12 clients served", "48-hour turnaround")

### proofPoints[1] — proof-point-2
- **Slot:** `[SLOT: hero/proof-point-2]`
- **Purpose:** Second trust signal; distinct from proof-point-1 in what it proves
- **Tone:** Same as proof-point-1
- **Length:** ≤35 chars

### proofPoints[2] — proof-point-3
- **Slot:** `[SLOT: hero/proof-point-3]`
- **Purpose:** Third trust signal; rounds out the triptych of credibility cues
- **Tone:** Same as proof-point-1
- **Length:** ≤35 chars

---

## Problem / Solution (`siteContent.problemSolution`)

Validates that you understand the visitor's pain before presenting the fix.
The three items are a fixed tuple — do not add or remove without updating the
interface and component.

### eyebrow
- **Slot:** `[SLOT: problem-solution/eyebrow]`
- **Purpose:** Section label shown above the title in small caps or muted text
- **Tone:** Neutral, descriptive; often just the section concept ("The Problem")
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: problem-solution/title]`
- **Purpose:** Section headline that frames the tension the visitor recognises
- **Tone:** Empathetic; names the pain without being dramatic
- **Length:** ≤80 chars, 1 sentence

### description
- **Slot:** `[SLOT: problem-solution/description]`
- **Purpose:** 1-2 sentence paragraph bridging the problems below to the offered solution
- **Tone:** Honest, plain language; no marketing superlatives
- **Length:** 1-2 sentences, ≤150 chars

### items[0] — item 1 (fixed)

#### items[0].problem
- **Slot:** `[SLOT: problem-solution/item-1-problem]`
- **Purpose:** States the first pain point the visitor is likely experiencing
- **Tone:** Direct; use "you" language — the visitor should nod in recognition
- **Length:** 1 sentence, ≤80 chars

#### items[0].solution
- **Slot:** `[SLOT: problem-solution/item-1-solution]`
- **Purpose:** The specific answer to item-1-problem — how bcns fixes it
- **Tone:** Confident, concrete; avoid vague claims like "we make it easy"
- **Length:** 1 sentence, ≤80 chars

### items[1] — item 2 (fixed)

#### items[1].problem
- **Slot:** `[SLOT: problem-solution/item-2-problem]`
- **Purpose:** Second pain point; should be distinct from item 1
- **Tone:** Same as item-1-problem
- **Length:** 1 sentence, ≤80 chars

#### items[1].solution
- **Slot:** `[SLOT: problem-solution/item-2-solution]`
- **Purpose:** Answer to item-2-problem
- **Tone:** Same as item-1-solution
- **Length:** 1 sentence, ≤80 chars

### items[2] — item 3 (fixed)

#### items[2].problem
- **Slot:** `[SLOT: problem-solution/item-3-problem]`
- **Purpose:** Third pain point; complete the triptych — order by intensity or frequency
- **Tone:** Same as item-1-problem
- **Length:** 1 sentence, ≤80 chars

#### items[2].solution
- **Slot:** `[SLOT: problem-solution/item-3-solution]`
- **Purpose:** Answer to item-3-problem
- **Tone:** Same as item-1-solution
- **Length:** 1 sentence, ≤80 chars

---

## How It Works (`siteContent.howItWorks`)

Demystifies the engagement process. Steps are a fixed tuple of 3; the `step`
field ("01", "02", "03") is structural and is not a content slot.

### eyebrow
- **Slot:** `[SLOT: how-it-works/eyebrow]`
- **Purpose:** Section label above the title
- **Tone:** Neutral, process-oriented (e.g. "The Process")
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: how-it-works/title]`
- **Purpose:** Section headline summarising that the process is simple or clear
- **Tone:** Reassuring; visitors are skeptical of complexity
- **Length:** ≤80 chars, 1 sentence

### description
- **Slot:** `[SLOT: how-it-works/description]`
- **Purpose:** Brief sentence contextualising what follows (e.g. "Three steps from brief to delivery")
- **Tone:** Plain, brief
- **Length:** 1 sentence, ≤120 chars

### items[0] — step 1 (fixed; step value = "01")

#### items[0].title
- **Slot:** `[SLOT: how-it-works/step-1-title]`
- **Purpose:** Label for the first step in the process
- **Tone:** Action-noun or verb phrase (e.g. "Discovery Call")
- **Length:** 2-5 words, ≤40 chars

#### items[0].description
- **Slot:** `[SLOT: how-it-works/step-1-description]`
- **Purpose:** 1-2 sentence description of what happens in step 1
- **Tone:** Concrete, demystifying — what does the client actually do or receive?
- **Length:** 1-2 sentences, ≤120 chars

### items[1] — step 2 (fixed; step value = "02")

#### items[1].title
- **Slot:** `[SLOT: how-it-works/step-2-title]`
- **Purpose:** Label for the second step
- **Tone:** Same as step-1-title
- **Length:** 2-5 words, ≤40 chars

#### items[1].description
- **Slot:** `[SLOT: how-it-works/step-2-description]`
- **Purpose:** Description of step 2
- **Tone:** Same as step-1-description
- **Length:** 1-2 sentences, ≤120 chars

### items[2] — step 3 (fixed; step value = "03")

#### items[2].title
- **Slot:** `[SLOT: how-it-works/step-3-title]`
- **Purpose:** Label for the final step
- **Tone:** Same as step-1-title; often the delivery/outcome moment
- **Length:** 2-5 words, ≤40 chars

#### items[2].description
- **Slot:** `[SLOT: how-it-works/step-3-description]`
- **Purpose:** Description of step 3
- **Tone:** Same as step-1-description
- **Length:** 1-2 sentences, ≤120 chars

---

## Delivery Models (`siteContent.deliveryModels`)

Explains the engagement formats available. Three items, fixed tuple.

### eyebrow
- **Slot:** `[SLOT: delivery-models/eyebrow]`
- **Purpose:** Section label
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: delivery-models/title]`
- **Purpose:** Section headline communicating flexibility or range
- **Tone:** Clear, non-salesy
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: delivery-models/description]`
- **Purpose:** 1 sentence framing that multiple models exist to fit different needs
- **Tone:** Welcoming; signals that the visitor can find a fit
- **Length:** 1 sentence, ≤120 chars

### items[0] — model 1 (fixed)

#### items[0].title
- **Slot:** `[SLOT: delivery-models/item-1-title]`
- **Purpose:** Name of the first engagement model (e.g. "Retainer", "Project")
- **Tone:** Short noun phrase; should be self-explanatory
- **Length:** 1-4 words, ≤35 chars

#### items[0].description
- **Slot:** `[SLOT: delivery-models/item-1-description]`
- **Purpose:** 1-2 sentences explaining who this model suits and what it delivers
- **Tone:** Practical; answer "when should I choose this?"
- **Length:** 1-2 sentences, ≤120 chars

### items[1] — model 2 (fixed)

#### items[1].title
- **Slot:** `[SLOT: delivery-models/item-2-title]`
- **Purpose:** Name of the second model
- **Tone:** Same as item-1-title
- **Length:** 1-4 words, ≤35 chars

#### items[1].description
- **Slot:** `[SLOT: delivery-models/item-2-description]`
- **Purpose:** Same as item-1-description for model 2
- **Tone:** Practical
- **Length:** 1-2 sentences, ≤120 chars

### items[2] — model 3 (fixed)

#### items[2].title
- **Slot:** `[SLOT: delivery-models/item-3-title]`
- **Purpose:** Name of the third model
- **Tone:** Same as item-1-title
- **Length:** 1-4 words, ≤35 chars

#### items[2].description
- **Slot:** `[SLOT: delivery-models/item-3-description]`
- **Purpose:** Same as item-1-description for model 3
- **Tone:** Practical
- **Length:** 1-2 sentences, ≤120 chars

---

## Use Cases (`siteContent.useCases`)

Shows concrete verticals or problem types served. Four items, fixed tuple.

### eyebrow
- **Slot:** `[SLOT: use-cases/eyebrow]`
- **Purpose:** Section label
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: use-cases/title]`
- **Purpose:** Section headline framing the variety of problems solved
- **Tone:** Direct
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: use-cases/description]`
- **Purpose:** 1 sentence contextualising the examples below
- **Tone:** Plain
- **Length:** 1 sentence, ≤120 chars

### items[0] — use case 1 (fixed)

#### items[0].tag
- **Slot:** `[SLOT: use-cases/item-1-tag]`
- **Purpose:** Chip/badge label categorising the use case (e.g. "Analytics", "Automation")
- **Tone:** 1-2 word noun; category label not a sentence
- **Length:** 1-3 words, ≤25 chars

#### items[0].title
- **Slot:** `[SLOT: use-cases/item-1-title]`
- **Purpose:** Title of the specific use case scenario
- **Tone:** Concrete noun phrase or problem statement
- **Length:** ≤60 chars, 4-10 words

#### items[0].description
- **Slot:** `[SLOT: use-cases/item-1-description]`
- **Purpose:** 1-2 sentences describing the use case in the visitor's language
- **Tone:** Practical; reads like a mini case study brief
- **Length:** 1-2 sentences, ≤130 chars

### items[1] — use case 2 (fixed)

#### items[1].tag
- **Slot:** `[SLOT: use-cases/item-2-tag]`
- **Purpose:** Category chip for use case 2
- **Tone:** Same as item-1-tag
- **Length:** 1-3 words, ≤25 chars

#### items[1].title
- **Slot:** `[SLOT: use-cases/item-2-title]`
- **Purpose:** Title of use case 2
- **Tone:** Same as item-1-title
- **Length:** ≤60 chars

#### items[1].description
- **Slot:** `[SLOT: use-cases/item-2-description]`
- **Purpose:** Description of use case 2
- **Tone:** Same as item-1-description
- **Length:** 1-2 sentences, ≤130 chars

### items[2] — use case 3 (fixed)

#### items[2].tag
- **Slot:** `[SLOT: use-cases/item-3-tag]`
- **Purpose:** Category chip for use case 3
- **Tone:** Same as item-1-tag
- **Length:** 1-3 words, ≤25 chars

#### items[2].title
- **Slot:** `[SLOT: use-cases/item-3-title]`
- **Purpose:** Title of use case 3
- **Tone:** Same as item-1-title
- **Length:** ≤60 chars

#### items[2].description
- **Slot:** `[SLOT: use-cases/item-3-description]`
- **Purpose:** Description of use case 3
- **Tone:** Same as item-1-description
- **Length:** 1-2 sentences, ≤130 chars

### items[3] — use case 4 (fixed)

#### items[3].tag
- **Slot:** `[SLOT: use-cases/item-4-tag]`
- **Purpose:** Category chip for use case 4
- **Tone:** Same as item-1-tag
- **Length:** 1-3 words, ≤25 chars

#### items[3].title
- **Slot:** `[SLOT: use-cases/item-4-title]`
- **Purpose:** Title of use case 4
- **Tone:** Same as item-1-title
- **Length:** ≤60 chars

#### items[3].description
- **Slot:** `[SLOT: use-cases/item-4-description]`
- **Purpose:** Description of use case 4
- **Tone:** Same as item-1-description
- **Length:** 1-2 sentences, ≤130 chars

---

## Contact Section (`siteContent.contactSection`)

The conversion section. Three highlights support the CTA. Highlights are a
fixed tuple.

### eyebrow
- **Slot:** `[SLOT: contact/eyebrow]`
- **Purpose:** Section label above the title
- **Tone:** Action-oriented (e.g. "Get in Touch", "Work Together")
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: contact/title]`
- **Purpose:** Main headline inviting the visitor to reach out
- **Tone:** Warm but direct; not desperate
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: contact/description]`
- **Purpose:** 1-2 sentences reducing friction — what happens when they contact you?
- **Tone:** Reassuring; set expectations (e.g. response time, next step)
- **Length:** 1-2 sentences, ≤150 chars

### highlights[0] — highlight 1 (fixed)

#### highlights[0].title
- **Slot:** `[SLOT: contact/highlight-1-title]`
- **Purpose:** Short heading for the first trust/logistics point (e.g. "Fast Response")
- **Tone:** Confident, benefit-focused
- **Length:** 2-5 words, ≤40 chars

#### highlights[0].description
- **Slot:** `[SLOT: contact/highlight-1-description]`
- **Purpose:** 1 sentence elaborating on highlight 1
- **Tone:** Specific; a concrete detail beats a vague promise
- **Length:** 1 sentence, ≤80 chars

### highlights[1] — highlight 2 (fixed)

#### highlights[1].title
- **Slot:** `[SLOT: contact/highlight-2-title]`
- **Purpose:** Heading for highlight 2; distinct angle from highlight 1
- **Tone:** Same as highlight-1-title
- **Length:** 2-5 words, ≤40 chars

#### highlights[1].description
- **Slot:** `[SLOT: contact/highlight-2-description]`
- **Purpose:** 1 sentence elaborating on highlight 2
- **Tone:** Same as highlight-1-description
- **Length:** 1 sentence, ≤80 chars

### highlights[2] — highlight 3 (fixed)

#### highlights[2].title
- **Slot:** `[SLOT: contact/highlight-3-title]`
- **Purpose:** Heading for highlight 3
- **Tone:** Same as highlight-1-title
- **Length:** 2-5 words, ≤40 chars

#### highlights[2].description
- **Slot:** `[SLOT: contact/highlight-3-description]`
- **Purpose:** 1 sentence elaborating on highlight 3
- **Tone:** Same as highlight-1-description
- **Length:** 1 sentence, ≤80 chars

---

## Past Work (`siteContent.pastWork`)

Portfolio / proof section. Items are an open-ended array — add more as projects
are completed. The `link` field is optional; omit it (or set it to `undefined`)
if no public URL exists.

### eyebrow
- **Slot:** `[SLOT: past-work/eyebrow]`
- **Purpose:** Section label
- **Tone:** Factual (e.g. "Selected Work", "Portfolio")
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: past-work/title]`
- **Purpose:** Section headline drawing attention to results
- **Tone:** Outcomes-first; hint at measurable impact
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: past-work/description]`
- **Purpose:** 1-2 sentences contextualising the work shown
- **Tone:** Confident but not boastful
- **Length:** 1-2 sentences, ≤150 chars

### items[0] — project 1 (extendable)

#### items[0].title
- **Slot:** `[SLOT: past-work/item-1-title]`
- **Purpose:** Project or engagement name
- **Tone:** Neutral noun phrase (client-safe if needed)
- **Length:** ≤60 chars

#### items[0].outcome
- **Slot:** `[SLOT: past-work/item-1-outcome]`
- **Purpose:** The measurable or qualitative result — the "so what" of the project
- **Tone:** Specific, evidence-driven; include numbers where possible
- **Length:** 1-2 sentences, ≤120 chars

#### items[0].link _(optional)_
- **Slot:** `[SLOT: past-work/item-1-link]`
- **Purpose:** URL to a live project, case study, or write-up (leave undefined if none)
- **Tone:** N/A (URL only)
- **Length:** Valid URL; omit field entirely if no link exists

### items[1] — project 2 (extendable)

#### items[1].title
- **Slot:** `[SLOT: past-work/item-2-title]`
- **Purpose:** Same as item-1-title
- **Tone:** Same as item-1-title
- **Length:** ≤60 chars

#### items[1].outcome
- **Slot:** `[SLOT: past-work/item-2-outcome]`
- **Purpose:** Same as item-1-outcome
- **Tone:** Same as item-1-outcome
- **Length:** 1-2 sentences, ≤120 chars

#### items[1].link _(optional)_
- **Slot:** `[SLOT: past-work/item-2-link]`
- **Purpose:** URL for project 2 (optional)
- **Tone:** N/A
- **Length:** Valid URL or omit

> **Adding more projects:** copy the item-2 object block, increment the index
> number in the slot names (item-3-title, item-3-outcome, etc.), and add the
> object to the `items` array. The component renders all array entries.

---

## Reviews (`siteContent.reviews`)

Social proof via client quotes. Items are an open-ended array.

### eyebrow
- **Slot:** `[SLOT: reviews/eyebrow]`
- **Purpose:** Section label (e.g. "Client Feedback", "Testimonials")
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: reviews/title]`
- **Purpose:** Section headline building anticipation for the quotes
- **Tone:** Confident; let the quotes do the selling
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: reviews/description]`
- **Purpose:** Optional 1-sentence bridge before the quote cards
- **Tone:** Low-key; don't oversell
- **Length:** 1 sentence, ≤120 chars

### items[0] — review 1 (extendable)

#### items[0].quote
- **Slot:** `[SLOT: reviews/item-1-quote]`
- **Purpose:** The verbatim or lightly edited testimonial text
- **Tone:** Authentic; preserve the client's voice — don't polish into marketing-speak
- **Length:** 1-3 sentences, ≤200 chars recommended (longer quotes can be truncated in UI)

#### items[0].author
- **Slot:** `[SLOT: reviews/item-1-author]`
- **Purpose:** Full name of the person giving the review
- **Tone:** N/A (proper noun)
- **Length:** Full name, ≤50 chars

#### items[0].role
- **Slot:** `[SLOT: reviews/item-1-role]`
- **Purpose:** Job title of the reviewer
- **Tone:** N/A (title)
- **Length:** ≤50 chars

#### items[0].company
- **Slot:** `[SLOT: reviews/item-1-company]`
- **Purpose:** Company or organisation the reviewer works at
- **Tone:** N/A (name)
- **Length:** ≤50 chars

### items[1] — review 2 (extendable)

#### items[1].quote
- **Slot:** `[SLOT: reviews/item-2-quote]`
- **Purpose:** Second testimonial quote
- **Tone:** Authentic
- **Length:** 1-3 sentences, ≤200 chars

#### items[1].author
- **Slot:** `[SLOT: reviews/item-2-author]`
- **Purpose:** Full name of reviewer 2
- **Tone:** N/A
- **Length:** ≤50 chars

#### items[1].role
- **Slot:** `[SLOT: reviews/item-2-role]`
- **Purpose:** Job title of reviewer 2
- **Tone:** N/A
- **Length:** ≤50 chars

#### items[1].company
- **Slot:** `[SLOT: reviews/item-2-company]`
- **Purpose:** Company of reviewer 2
- **Tone:** N/A
- **Length:** ≤50 chars

> **Adding more reviews:** copy the item-2 object block, increment the index,
> and append to the `items` array.

---

## Pricing (`siteContent.pricing`)

Communicates value and sets expectations. Three tiers with open-ended feature
lists per tier.

### eyebrow
- **Slot:** `[SLOT: pricing/eyebrow]`
- **Purpose:** Section label (e.g. "Pricing", "Investment")
- **Tone:** Neutral; avoid "cheap" or "affordable" framing
- **Length:** 1-3 words, ≤25 chars

### title
- **Slot:** `[SLOT: pricing/title]`
- **Purpose:** Section headline framing pricing as straightforward or value-driven
- **Tone:** Confident; transparency builds trust
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: pricing/description]`
- **Purpose:** 1-2 sentences setting expectations (e.g. custom quotes available)
- **Tone:** Honest; don't over-promise
- **Length:** 1-2 sentences, ≤150 chars

### tiers[0] — tier 1 (fixed count: 3)

#### tiers[0].name
- **Slot:** `[SLOT: pricing/tier-1-name]`
- **Purpose:** Name of the first pricing tier (e.g. "Starter", "Essentials")
- **Tone:** Descriptive noun; signals the scope of the tier
- **Length:** 1-3 words, ≤25 chars

#### tiers[0].price
- **Slot:** `[SLOT: pricing/tier-1-price]`
- **Purpose:** Price string (e.g. "$2,500/mo", "Custom", "From $500")
- **Tone:** N/A (formatted value)
- **Length:** ≤20 chars

#### tiers[0].description
- **Slot:** `[SLOT: pricing/tier-1-description]`
- **Purpose:** 1 sentence describing who this tier is for
- **Tone:** Direct; "best for X who needs Y"
- **Length:** 1 sentence, ≤100 chars

#### tiers[0].features[0]
- **Slot:** `[SLOT: pricing/tier-1-feature-1]`
- **Purpose:** First feature/deliverable included in tier 1
- **Tone:** Concrete noun phrase (e.g. "Weekly analytics report")
- **Length:** ≤60 chars

#### tiers[0].features[1]
- **Slot:** `[SLOT: pricing/tier-1-feature-2]`
- **Purpose:** Second feature in tier 1
- **Tone:** Same as feature-1
- **Length:** ≤60 chars

#### tiers[0].features[2]
- **Slot:** `[SLOT: pricing/tier-1-feature-3]`
- **Purpose:** Third feature in tier 1
- **Tone:** Same as feature-1
- **Length:** ≤60 chars

### tiers[1] — tier 2 (fixed count: 3)

#### tiers[1].name
- **Slot:** `[SLOT: pricing/tier-2-name]`
- **Purpose:** Name of tier 2 (typically the mid-range or most popular tier)
- **Tone:** Same as tier-1-name
- **Length:** 1-3 words, ≤25 chars

#### tiers[1].price
- **Slot:** `[SLOT: pricing/tier-2-price]`
- **Purpose:** Price string for tier 2
- **Tone:** N/A
- **Length:** ≤20 chars

#### tiers[1].description
- **Slot:** `[SLOT: pricing/tier-2-description]`
- **Purpose:** 1 sentence describing tier 2's target customer
- **Tone:** Same as tier-1-description
- **Length:** 1 sentence, ≤100 chars

#### tiers[1].features[0]
- **Slot:** `[SLOT: pricing/tier-2-feature-1]`
- **Purpose:** First feature in tier 2
- **Tone:** Same as tier-1-feature-1
- **Length:** ≤60 chars

#### tiers[1].features[1]
- **Slot:** `[SLOT: pricing/tier-2-feature-2]`
- **Purpose:** Second feature in tier 2
- **Tone:** Same as tier-1-feature-1
- **Length:** ≤60 chars

#### tiers[1].features[2]
- **Slot:** `[SLOT: pricing/tier-2-feature-3]`
- **Purpose:** Third feature in tier 2
- **Tone:** Same as tier-1-feature-1
- **Length:** ≤60 chars

### tiers[2] — tier 3 (fixed count: 3)

#### tiers[2].name
- **Slot:** `[SLOT: pricing/tier-3-name]`
- **Purpose:** Name of tier 3 (typically the premium or enterprise tier)
- **Tone:** Same as tier-1-name
- **Length:** 1-3 words, ≤25 chars

#### tiers[2].price
- **Slot:** `[SLOT: pricing/tier-3-price]`
- **Purpose:** Price string for tier 3
- **Tone:** N/A
- **Length:** ≤20 chars

#### tiers[2].description
- **Slot:** `[SLOT: pricing/tier-3-description]`
- **Purpose:** 1 sentence describing tier 3's target customer
- **Tone:** Same as tier-1-description
- **Length:** 1 sentence, ≤100 chars

#### tiers[2].features[0]
- **Slot:** `[SLOT: pricing/tier-3-feature-1]`
- **Purpose:** First feature in tier 3
- **Tone:** Same as tier-1-feature-1
- **Length:** ≤60 chars

#### tiers[2].features[1]
- **Slot:** `[SLOT: pricing/tier-3-feature-2]`
- **Purpose:** Second feature in tier 3
- **Tone:** Same as tier-1-feature-1
- **Length:** ≤60 chars

#### tiers[2].features[2]
- **Slot:** `[SLOT: pricing/tier-3-feature-3]`
- **Purpose:** Third feature in tier 3
- **Tone:** Same as tier-1-feature-1
- **Length:** ≤60 chars

> **Extending tier features:** each `features` array is unconstrained — add more
> strings to include additional bullet points. No interface change needed.

---

## FAQ (`siteContent.faq`)

Addresses objections and reduces friction before the visitor contacts you. Items
are an open-ended array (3 pre-seeded).

### eyebrow
- **Slot:** `[SLOT: faq/eyebrow]`
- **Purpose:** Section label (e.g. "FAQ", "Common Questions")
- **Tone:** Neutral
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: faq/title]`
- **Purpose:** Section headline framing that questions will be answered directly
- **Tone:** Honest and confident
- **Length:** ≤80 chars

### description
- **Slot:** `[SLOT: faq/description]`
- **Purpose:** 1 sentence inviting further contact if the question isn't covered
- **Tone:** Open, welcoming
- **Length:** 1 sentence, ≤120 chars

### items[0] — FAQ 1 (extendable)

#### items[0].question
- **Slot:** `[SLOT: faq/item-1-question]`
- **Purpose:** The most common or most important question visitors have
- **Tone:** Written as the visitor would phrase it — use "you/your" not "clients"
- **Length:** 1 sentence, ≤100 chars

#### items[0].answer
- **Slot:** `[SLOT: faq/item-1-answer]`
- **Purpose:** Direct, complete answer to question 1
- **Tone:** Honest; if the answer has caveats, name them
- **Length:** 1-3 sentences, ≤200 chars

### items[1] — FAQ 2 (extendable)

#### items[1].question
- **Slot:** `[SLOT: faq/item-2-question]`
- **Purpose:** Second most frequent question
- **Tone:** Same as item-1-question
- **Length:** 1 sentence, ≤100 chars

#### items[1].answer
- **Slot:** `[SLOT: faq/item-2-answer]`
- **Purpose:** Answer to question 2
- **Tone:** Same as item-1-answer
- **Length:** 1-3 sentences, ≤200 chars

### items[2] — FAQ 3 (extendable)

#### items[2].question
- **Slot:** `[SLOT: faq/item-3-question]`
- **Purpose:** Third question
- **Tone:** Same as item-1-question
- **Length:** 1 sentence, ≤100 chars

#### items[2].answer
- **Slot:** `[SLOT: faq/item-3-answer]`
- **Purpose:** Answer to question 3
- **Tone:** Same as item-1-answer
- **Length:** 1-3 sentences, ≤200 chars

> **Adding more FAQs:** append `{ question: "...", answer: "..." }` objects to
> the `items` array. No interface or component change needed.

---

## About Founder (`siteContent.aboutFounder`)

Personal credibility section. The `description` field is optional in the
interface (can be omitted or set to `undefined`). `credentials` is an
open-ended array (3 pre-seeded).

### eyebrow
- **Slot:** `[SLOT: about/eyebrow]`
- **Purpose:** Section label (e.g. "About", "The Founder")
- **Tone:** Grounding; signals a human behind the business
- **Length:** 1-4 words, ≤30 chars

### title
- **Slot:** `[SLOT: about/title]`
- **Purpose:** Headline naming or introducing the founder
- **Tone:** Warm but professional; avoid third-person where possible
- **Length:** ≤80 chars

### description _(optional)_
- **Slot:** `[SLOT: about/description]`
- **Purpose:** Optional subtitle or positioning line beneath the title
- **Tone:** Brief, personal
- **Length:** 1 sentence, ≤100 chars; omit field if not needed

### cardTitleBio
- **Slot:** `[SLOT: about/card-title-bio]`
- **Purpose:** Heading on the bio card (e.g. "Background", "My Story")
- **Tone:** Simple noun (the bio content does the work)
- **Length:** 1-3 words, ≤25 chars

### cardTitleCredentials
- **Slot:** `[SLOT: about/card-title-credentials]`
- **Purpose:** Heading on the credentials/bullet list card (e.g. "Credentials", "Experience")
- **Tone:** Simple noun
- **Length:** 1-3 words, ≤25 chars

### bio
- **Slot:** `[SLOT: about/bio]`
- **Purpose:** 1-3 paragraph narrative biography — the founder's story, expertise, and why they do this work
- **Tone:** First-person preferred; specific/evidence-driven, no marketing fluff; must feel like a person wrote it
- **Length:** 100-300 words; shorter is better if every sentence earns its place

### credentials[0]
- **Slot:** `[SLOT: about/credential-1]`
- **Purpose:** First credential bullet (e.g. degree, former employer, notable achievement)
- **Tone:** Factual noun phrase; third-person if listing degrees/employers
- **Length:** ≤80 chars

### credentials[1]
- **Slot:** `[SLOT: about/credential-2]`
- **Purpose:** Second credential bullet
- **Tone:** Same as credential-1
- **Length:** ≤80 chars

### credentials[2]
- **Slot:** `[SLOT: about/credential-3]`
- **Purpose:** Third credential bullet
- **Tone:** Same as credential-1
- **Length:** ≤80 chars

> **Adding more credentials:** append string values to the `credentials` array.
> No interface or component change needed.

---

_Last updated: 2026-07-13. Source of truth: `apps/web/lib/content.ts`._
