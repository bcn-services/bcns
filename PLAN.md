# bcns Site Restructure — Plan (v2: multi-page + real copy)

> Source of truth for the second build run. v1 built the slot template; this run
> reorganizes it into a **multi-page site with real drafted copy**, ready for a
> warm customer (contacted or referred) to land on. Copy is drafted in the
> appendix below — the run **wires it in verbatim**, it does not write marketing
> copy. Anything unknown (prices, turnaround, founder specifics, past work) stays
> an explicit `[INPUT: …]` slot.
>
> **Two sections split by the `⚠️ AUTONOMOUS RUN — STOP HERE` marker:**
> `dev-team-auto` runs Section 1 (restructure + copy wiring) and stops;
> `layout-loop` runs Section 2 (visual pass on the new pages) in cowork.
> Same complementary edit fences as v1 — dev-team-auto owns structure/data/copy,
> layout-loop is presentation-only.
>
> **Base branch:** run from `layout-loop/nate-personal-first-draft` (contains all
> v1 architecture + the visual first draft). Work on a new experimental branch
> off it; never merge to main without Nate's sign-off.

---

## Decisions locked in the 2026-07-14 grilling session

| Area | Decision |
| --- | --- |
| **Audience** | Warm visitors: ~66% arrive after direct outreach, ~33% referred. They're vetting: "what is this, is it legit, what does it cost, how do I start." Not optimized for cold traffic. |
| **Offer** | Fixed-scope custom builds at two sizes (starter / full), plus **AI consulting priced per day**. Prices and turnaround TBD until test customers — all numbers are `[INPUT: …]` slots. |
| **Site map** | **Thin home** (hero + 3 nav cards + contact) with subpages `/services`, `/pricing`, `/about`, `/work`. Header nav: Services · Work · Pricing · About + "Book a free consult" CTA. |
| **Nav cards (home)** | What we build → `/services` · Past Work → `/work` · Pricing → `/pricing` (this order, Past Work center). |
| **/work** | Stays **live and in nav** (not hidden). Renders an honest holding state ("first builds in progress…") while `pastWork.items` / `reviews.items` are empty; automatically switches to the real grid when entries are added. Never a bare "past work goes here." |
| **Pricing** | 3 cards: Starter build + Full build (price *ranges* as `[INPUT: …]`) + AI consulting (per-day rate as `[INPUT: …]`). FAQ lives on `/pricing`. |
| **About** | Two founders: **Nate Seluga** (engineering) and **Brandon Chung** (business, NYU). Architecture + outlined suggested content now; personal specifics are `[INPUT: …]` slots. Builder-first framing — schools appear as credential lines, not headlines. |
| **Problem/Solution section** | Cut as a standalone section; its best lines fold into the hero subhead and services intro. |
| **Delivery Models section** | Merged into `/pricing` tiers + `/services` copy — no separate section. |
| **Copy** | All drafted (appendix below). Placeholder convention: `[INPUT: <what goes here>]`. No `[SLOT: …]` may remain on any rendered page. |

### Guardrails (Section 1 / dev-team-auto)

- **Structure, data, and copy-wiring only. No visual design, no `dt-ui`.** Use `dt-engineer`. Section 2 owns look-and-feel.
- **Use the appendix copy verbatim.** Do not improve, extend, or invent copy. If a slot exists in code with no appendix entry, make it an `[INPUT: …]` slot and note it in PROGRESS.md.
- **No invented facts** — no fake prices, clients, quotes, metrics, or founder details.
- **Single source of truth** — all copy flows through the content registry (`apps/web/lib/content.ts`); components render from it. `CONTENT.md` mirrors the registry 1:1.
- **Stay green** — `pnpm lint && pnpm typecheck && pnpm build` after every item. All `done when:` criteria verifiable headlessly.

---

## Section 1 — Restructure + copy (dev-team-auto)

### B1 — Multi-page routing + thin home · `status: done` · `track: full`

- **task:** Restructure the single-page app into the locked site map. Create routed pages `app/services/page.tsx`, `app/pricing/page.tsx`, `app/about/page.tsx`, `app/work/page.tsx`, each composing the existing section components: `/services` = use-cases + how-it-works; `/pricing` = pricing + faq; `/about` = about-founder (reworked in B2); `/work` = past-work + reviews. Rebuild `app/page.tsx` as the thin home: hero → new nav-cards section (3 cards: What we build → /services, Past Work → /work, Pricing → /pricing) → contact section. Remove problem-solution and delivery-models from all pages (keep components in the repo, unwired). Update header nav in `site.ts` to Services · Work · Pricing · About (page links, not anchors) with the Book-a-free-consult CTA intact; footer links updated to the new routes; `sitemap.ts` includes all new routes. Per-page `metadata` (title/description) reads from the registry.
- **done when:** `/`, `/services`, `/pricing`, `/about`, `/work`, `/privacy`, `/terms` all return 200 and render their assigned sections; home renders exactly hero + nav-cards + contact; problem-solution and delivery-models appear on no page; header nav shows the 4 page links in order and each resolves; sitemap lists all routes; `pnpm lint && pnpm typecheck && pnpm build` green.

### B2 — Registry rework: nav cards, two-founder about, pricing shape, /work holding state · `status: done` · `track: full`

- **task:** Rework `apps/web/lib/content.ts` to match the new IA. (1) Add a `navCards` section type (3 entries: title, description, href). (2) Replace `aboutFounder` with a two-founder model: shared eyebrow/title/description + `founders` array (name, roleLine, photo slot, bio, credentials[]) + a shared `whyBcns` paragraph field. (3) Reshape pricing to 3 cards where tier 3 is the AI-consulting day-rate card (price fields are free strings so `[INPUT: …]` renders). (4) Add holding-state support: `pastWork` and `reviews` each get a `holdingState` object (title, body, ctaLabel) and their page components render the holding state when `items` is empty, the real grid otherwise — verified by a unit test that renders both states. Add per-page metadata fields to the registry.
- **done when:** registry typechecks with the new shapes; `/about` renders two founder cards from the `founders` array; `/work` renders holding-state copy with an empty `items` array and renders an item grid when a test entry is injected (unit test covers both branches); pricing renders 3 cards with free-string prices; existing passing tests remain passing; build green.

### B3 — Wire the drafted copy · `status: done` · `track: light`

- **task:** Replace every `[SLOT: …]` value in the registry with the exact copy from the **Copy appendix** below, section by section. Unknowns use the `[INPUT: …]` strings exactly as written in the appendix. Delete registry entries for the cut sections' copy (problem-solution, delivery-models) or mark them unused.
- **done when:** a repo-wide grep finds zero `[SLOT:` occurrences in `apps/web/lib/content.ts` and zero on any rendered page (test asserts rendered HTML of all routes contains no `[SLOT:`); every `[INPUT: …]` string on a rendered page matches one defined in the appendix; hero headline, nav card titles, pricing card names, FAQ questions, and /work holding-state title each match the appendix verbatim (spot-check test); build green.

### B4 — CONTENT.md + trackers updated to the new IA · `status: done` · `track: light`

- **task:** Rewrite `apps/web/CONTENT.md` to mirror the new registry 1:1 (per-page organization; document the `[INPUT: …]` convention, the two-founder model, and **how to flip /work live**: "add an entry to `pastWork.items` and the holding state disappears — no code change"). Keep the fill/extend guides. Update `PROGRESS.md` per run convention.
- **done when:** every registry field appears in `CONTENT.md` and vice versa (no orphans either direction); the /work flip instructions and `[INPUT: …]` convention are documented; build green.

---

> **⚠️ AUTONOMOUS RUN — STOP HERE**

_dev-team-auto halts here. Section 2 runs via the `layout-loop` skill in a
cowork session; Needs-Nate items are Nate's._

---

## Section 2 — Visual pass on the new pages (layout-loop, cowork)

brand: nate-personal
launch: pnpm --filter web dev
url: http://localhost:3000

> Presentation only — never edit copy, data, props, logic, or routing. Isolated
> branch, one focused change per pass, morning report, never auto-merged.
> `[INPUT: …]` strings are content, not styling bugs — style them as normal text.

- page: /
  notes: thin home — hero + 3 nav cards + contact must feel complete, not sparse; nav cards are the primary interaction, make them obviously clickable
  status: not started

- page: /services
  notes: 4 use-case cards (incl. AI consulting) + 3-step process; keep the AI card visually peer to the others, not an afterthought
  status: not started

- page: /pricing
  notes: 3 cards where card 3 is a day-rate, not a tier — differentiate it; [INPUT: …] price strings must not break the card rhythm
  status: not started

- page: /about
  notes: two equal founder cards; builder-first hierarchy — names and roles before schools
  status: not started

- page: /work
  notes: holding state must look intentional and confident, not empty — this page is linked from a home nav card
  status: not started

---

## Needs-Nate (deferred; none block Section 1)

- [ ] **Fill `[INPUT: …]` slots:** price ranges + turnaround + support window (after test customers), AI consulting day rate, response-time promise, founder bios/credentials/photos (you + Brandon), notable projects.
- [ ] **First real past-work entry + review** — flips /work off holding state (data edit only).
- [ ] **Domain, inbox + form provider, legal text, deploy** — unchanged from v1.

---

## Copy appendix (Section 1 wires this verbatim)

> Placeholder convention: `[INPUT: <description>]` — render as-is; Nate fills later.

### Home — hero
- **badge:** Custom software for local businesses
- **headline:** Software built around how your business already works
- **subheadline:** Off-the-shelf tools make you change your process. We build tools that fit it — scoped, quoted, and delivered.
- **cta-primary:** Book a free consult
- **cta-secondary:** See what we build *(→ /services)*
- **proof-point-1:** Fixed quote before work starts
- **proof-point-2:** Use it forever, free *(updated by C1 pass)*
- **proof-point-3:** Free 30-minute consult

### Home — nav cards
1. **What we build** — Booking systems, dashboards, automations, and AI consulting — the problems we solve and how. *(→ /services)*
2. **Past work** — What we've built, and what it changed for the businesses using it. *(→ /work)*
3. **Pricing** — Two build sizes and a day rate for AI consulting — and how quoting works. *(→ /pricing)*

### Home — contact
- **eyebrow:** Get in touch
- **title:** Tell us what's slowing you down
- **description:** Send a few sentences about your business and the problem. We'll reply within [INPUT: response-time promise] with next steps — and honest advice, even if that advice is "you don't need custom software."
- **highlight-1:** **Free consult** — A 30-minute call about how your business runs. No pitch, no obligation.
- **highlight-2:** **Fixed quote** — You approve the exact price before any work starts.
- **highlight-3:** **Yours to use** — Your data and accounts stay yours. It keeps running whether we work together or not. *(updated by C1 pass)*

### /services — use cases
- **eyebrow:** What we build · **title:** Tools shaped to your business, not the other way around · **description:** Four kinds of problems we solve most — if yours isn't here, ask anyway.
1. **tag:** Bookings — **title:** Scheduling & booking systems — **description:** Take appointments the way you already do — deposits, reminders, and a calendar that matches your real workflow.
2. **tag:** Operations — **title:** Inventory & back-office automation — **description:** Replace the spreadsheet juggling: ordering, invoicing, and tracking that update themselves.
3. **tag:** Insight — **title:** Dashboards & reporting — **description:** One screen that shows how the business is doing — sales, costs, trends — without exporting anything.
4. **tag:** AI — **title:** AI consulting — **description:** A working session to find where AI actually saves you time, then set it up with you. Priced per day.

### /services — how it works
- **eyebrow:** The process · **title:** Three steps from first call to finished tool · **description:** You'll know the price and the plan before anything gets built.
1. **Free consult** — A 30-minute conversation about how your business runs and where the friction is. No jargon.
2. **Scope & quote** — We write up exactly what we'll build, what it costs, and when it lands. You approve first.
3. **Build & handoff** — We build it, walk your team through it, and include [INPUT: support window] of fixes. You own the result.

### /pricing
- **eyebrow:** Pricing · **title:** Two build sizes, one day rate — quoted before we start · **description:** Every project gets a fixed quote up front. The tiers show typical scope; your quote depends on the consult.
- **Card 1 — Standard build** *(was "Starter build")* · price: $2,000–$5,000 · A single-purpose tool: a booking page, a report generator, one automation. Features: One core workflow, built end to end / Delivered in about a week / 30 days of fixes and tweaks included / One year of bug fixes, free
- **Card 2 — Advanced build** *(was "Full build")* · price: $5,000–$15,000 · A system your business runs on: multiple workflows, logins, data that stays in sync. Features: Multiple connected workflows / Delivered in two to three weeks / 30 days of fixes and tweaks included / One year of bug fixes, free
- **Card 3 — AI consulting** · price: $800 / day · Working sessions to find and set up AI where it pays for itself. Features: Audit of where AI fits your operation / Hands-on setup, not a slide deck / Plain-English handoff notes

### /pricing — FAQ
- **eyebrow:** FAQ · **title:** The questions we'd ask too · **description:** Anything else — ask in the form and we'll answer straight.
1. **How much will my project cost?** — Every project gets a fixed quote after the free consult. Standard builds run $2,000 to $5,000. Advanced builds run $5,000 to $15,000. The quote is the price. No hourly surprises. *(updated by C1 pass)*
2. **How long does a build take?** — Most single tools ship in about a week. Larger connected systems take two to three weeks. You get a delivery date with the quote, and we tell you right away if anything threatens it. *(updated by C1 pass)*
3. **What happens if something breaks after delivery?** — For the first 30 days, tell us anything that needs fixing or refining and we handle it, no questions asked. After that, genuine bugs in what we built stay free to fix for a year. New features, or changes to things that already work, are quoted separately. *(updated by C1 pass)*
4. **Do I need to be technical to work with you?** — No. We ask about your business, not your tech. Everything comes with a plain-English walkthrough.
*(FAQ 5 — "Who owns what you build?" removed by C1 pass. Ownership stay-silent policy.)*

### /about (two-founder outline — suggested beats, specifics are INPUT slots)
- **eyebrow:** About · **title:** The people behind bcns · **description:** Two founders — one builds, one makes sure it's worth building.
- **Founder 1 — Nate Seluga** · roleLine: Engineering · photo: [INPUT: photo] · bio: "Nate builds the tools. He cares about fast, simple, and stable, in that order. No bloat, no unnecessary dependencies, nothing that breaks six months after handoff. Computer science at Harvey Mudd College." credentials: Computer science, Harvey Mudd College *(C1: removed [INPUT: notable projects] beat and extra credential slots)*
- **Founder 2 — Brandon Chung** · roleLine: Business & clients · photo: [INPUT: photo] · bio: "[INPUT: business experience summary]. Brandon owns scoping, communication, and making sure every build earns its cost. He's the reason we don't build things clients don't need." credentials: [INPUT: NYU program], New York University / [INPUT: credential 2] / [INPUT: credential 3]
- **whyBcns (shared):** "Small businesses get two bad options. Software that doesn't fit, or a price only big companies can pay. We build the third one. Custom tools, built lean, straight from the two of us." *(filled by C1 pass)*

### /work — holding state
- **Past work:** eyebrow: Past work · title: Our first builds are in progress · body: "We're building for our first clients right now. Case studies land here as projects wrap. Each one covers the problem, what we built, and what changed." · cta: Want to be one of them? Book a free consult.
- **Reviews:** title: "No reviews yet. That changes with our first client." *(was "Reviews will live here too")* · body: "Real names, real businesses, unedited. As soon as our first clients have something to say." *(C1 pass updated both)*

---

## Conventions (for the agents)

- Section 1 = structure/data/copy-wiring only; `dt-engineer`, never `dt-ui`; `done when:` always headlessly verifiable.
- Section 2 = presentation only; isolated branch; never merges without Nate's sign-off.
- Registry and `CONTENT.md` update together, always 1:1.
- No invented facts. Copy comes from the appendix; unknowns stay `[INPUT: …]`.
- `pnpm lint && pnpm typecheck && pnpm build` green after every item.
