# bcns Site Restructure — Plan (v2: multi-page + real copy)

> Source of truth for the second build run. v1 built the slot template; this run
> reorganizes it into a **multi-page site with real drafted copy**, ready for a
> warm customer (contacted or referred) to land on. Copy is drafted in the
> appendix below — the run **wires it in verbatim**, it does not write marketing
> copy. Anything unknown (prices, turnaround, founder specifics, past work) stays
> an explicit `[INPUT: …]` slot.
>
> **Combined overnight run.** `dev-team-auto` runs Section 1 (B1–B4, already done),
> Section 3 (C1 — voice/content pass), and Part III Section 1 (P1–P6 — DeLuca's pizza app),
> then halts at the single `⚠️ AUTONOMOUS RUN — STOP HERE` marker.
> `layout-loop` handles both visual passes (bcns website + pizza app) in separate cowork sessions after.
> dev-team-auto owns structure/data/copy/function; layout-loop is presentation-only.
>
> **Base branch:** `overnight-combined` (branched from `repo-pizza-plan`, which contains
> all B1–B4 work + V1–V5 layout-loop + Parts II–III). Never merge to main without Nate's sign-off.

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

## Section 3 — Voice + content pass (dev-team-auto)

> This run **replaces and tightens the copy** in `apps/web/lib/content.ts` — it does the opposite of Section 1's "wire verbatim" rule: here the agent rewrites toward the voice spec and fills every resolved `[INPUT: …]` slot with the real values below. Only the Nate-only slots in **Needs-Nate** stay `[INPUT: …]`. No new facts beyond what the copy brief supplies. All checks are headlessly verifiable.

### C1 — Voice + content pass · `status: not started` · `track: light`

- **task:** Rewrite every string in `apps/web/lib/content.ts` to match the **Copy
  brief** below, then update `apps/web/CONTENT.md` to mirror the result 1:1. Four
  jobs, all in the content registry (no component/logic edits): **(1) Fill resolved
  slots** with the exact values in the brief — pricing names + ranges, day rate,
  turnaround, the 30-day / 1-year support model, one-business-day response.
  **(2) Apply the ownership reframe** — strike every claim that the client owns the
  code; lead with "use it forever, free" and "your data is yours"; stay silent on
  IP; do not re-add the removed ownership FAQ. **(3) Voice sweep** — remove every
  em-dash (`—`) in the file, delete banned buzzwords, kill "we help X" and any
  "SaaS" framing, and tighten all copy to the voice rules (short, concrete,
  Hormozi discipline without the hype). **(4) Rewrite the About + holding states**
  per the brief (builder-first bios with no fabricated portfolio, honest founding
  story, firmed-up holding states). Write real page-meta titles/descriptions from
  the positioning. Because tier names, holding-state titles, and several copy
  strings change, **update the Copy appendix in this PLAN.md and any verbatim
  spot-check tests from B3 to the new approved strings** so they keep passing.
- **done when:**
  - `grep -c "—" apps/web/lib/content.ts` returns `0` (no em-dashes; en dashes are allowed **only** inside numeric ranges like `$2,000–$5,000`).
  - `grep -riE "leverage|empower|utilize|synergy|seamless|cutting-edge|world-class|best-in-class|robust|unlock|supercharge|elevate|revolutioniz|game-chang|we help|software as a service|saas" apps/web/lib/content.ts` returns zero matches.
  - No ownership-of-code claim remains: the hero proof point reads `Use it forever, free`, the contact "you own it" highlight no longer contains the word "code", and there is no FAQ about who owns the build.
  - Every `[INPUT: …]` remaining in `content.ts` is one of the enumerated **Needs-Nate** slots (founder photos, Brandon's NYU program, Brandon's experience summary, any extra credential lines). All pricing, turnaround, support-window, response-time, and page-meta slots are filled with the brief's real values — a grep for `INPUT: (starter|full|day rate|support window|turnaround|response-time|meta/)` returns zero.
  - Pricing renders three cards named `Standard build` ($2,000–$5,000), `Advanced build` ($5,000–$15,000), and `AI consulting` ($800 / day); each build tier lists both `30 days of fixes and tweaks included` and `One year of bug fixes, free`.
  - Readability: the concatenated body copy scores Flesch-Kincaid grade level ≤ 8 (verify with a committed one-off script, e.g. `textstat`), matching the third-to-eighth-grade target.
  - `CONTENT.md` mirrors the new registry 1:1 (no orphans either direction) and its `[INPUT: …]` section lists only the remaining Needs-Nate slots.
  - The B3 verbatim spot-check tests are updated to the new strings and pass; existing holding-state and no-`[SLOT:` tests still pass; `pnpm lint && pnpm typecheck && pnpm build` green.

---

### Copy brief (C1 executes against this)

#### Voice rules (hard constraints)

- **Short, direct sentences.** One idea per sentence. If a sentence has two ideas, split it.
- **No em-dashes anywhere.** Replace with a period or comma. En dashes only inside numeric ranges (`$2,000–$5,000`).
- **No "we help X achieve Y"** constructions. Say what you do or what they get, not that you "help."
- **No buzzwords:** leverage, empower, utilize, synergy, seamless, cutting-edge, world-class, best-in-class, robust, unlock, supercharge, elevate, revolutionize, game-changing.
- **Not "SaaS" / "software as a service."** bcns is a custom software studio — bespoke builds per client, not one product rented to many.
- **Third-grade-to-eighth-grade reading level.** Copy should take zero brainpower to parse. Active voice. No adverbs. Cut every redundant word.
- **Precision over sentiment (the engine of this pass).** Replace every vague claim with an observable fact. Not "we're reliable" — say "one-year bug warranty" or "you approve the exact price before we start." The facts do the persuading.
- **Register: Hormozi's discipline, not his volume.** Borrow the mechanics — short declaratives, concrete numbers, contrast lines, sets of three, risk-reversal, second-person "you/your." Leave the theatrics — no hype, urgency, scarcity, bravado, or grand claims. bcns sounds confident and calm, not loud and salesy.

#### Approved phrases / cadence (keep or echo these)

- Contrast line (hero): "Off-the-shelf tools make you change your process. We build tools that fit it." *(strip the em-dash that currently trails it.)*
- Honest-advice line (keep, it's the most credible thing on the site): "We'll tell you if you don't need custom software."
- "No pitch, no obligation."
- "You approve the exact price before any work starts."
- Founder line (strip the em-dash): "Two founders. One builds, one makes sure it's worth building."
- Value-prop angle to work in where it fits: **custom software without hiring a dev team**, and **stable** (reliability is a real, unclaimed differentiator).
- Founding-client invitation (holding states): "Want to be one of them? Book a free consult."

#### Resolved values (fill these exactly)

| Slot | Value |
|---|---|
| Pricing tier 1 name | `Standard build` |
| Pricing tier 1 price | `$2,000–$5,000` |
| Pricing tier 2 name | `Advanced build` |
| Pricing tier 2 price | `$5,000–$15,000` |
| Pricing tier 3 price | `$800 / day` |
| Standard turnaround | `Delivered in about a week` |
| Advanced turnaround | `Delivered in two to three weeks` |
| Support model (both build tiers) | two bullets: `30 days of fixes and tweaks included` · `One year of bug fixes, free` |
| Response-time promise (contact) | `one business day` |
| FAQ pricing answer | "Every project gets a fixed quote after the free consult. Standard builds run $2,000 to $5,000. Advanced builds run $5,000 to $15,000. The quote is the price. No hourly surprises." |
| FAQ turnaround answer | "Most single tools ship in about a week. Larger connected systems take two to three weeks. You get a delivery date with the quote, and we tell you right away if anything threatens it." |
| FAQ "what if it breaks" answer | "For the first 30 days, tell us anything that needs fixing or refining and we handle it, no questions asked. After that, genuine bugs in what we built stay free to fix for a year. New features, or changes to things that already work, are quoted separately." |

Tier naming rationale (do not surface on the site): the split is **how hard it is for us to build**, not how much there is. A single very complex tool can be an Advanced build.

#### Section-by-section notes (what to change and why)

- **Hero.** Keep the badge ("Custom software for local businesses" — accurate, not SaaS). Keep the headline. Subheadline: strip the trailing em-dash; keep the off-the-shelf contrast line. Proof points: `Fixed quote before work starts` / **`Use it forever, free`** (replaces "You own everything we build") / `Free 30-minute consult`. Optionally work the "without hiring a dev team" angle into the subhead.
- **How it works — step 3.** Rewrite to the support model: "We build it, walk your team through it, then give you 30 days to use it and tell us what needs fixing or tweaking. We handle those, no questions asked."
- **Use cases.** Keep the four cards. Strip every em-dash in the descriptions (e.g. "Take appointments the way you already do, with deposits, reminders, and a calendar that matches your real workflow.").
- **Contact section.** Rewrite the description without the em-dash and quote marks: "Send a few sentences about your business and the problem. We'll reply within one business day with next steps, and honest advice, even if that advice is you don't need custom software." Highlight 3: drop the code-ownership claim. Title `Yours to use`, body "Your data and accounts stay yours. It keeps running whether we work together or not."
- **Pricing.** Rename tiers to Standard/Advanced; fill ranges and day rate; split the support line into the two bullets above. Keep the AI consulting card as a day rate, visually and verbally distinct from the two build tiers.
- **FAQ.** Fill the three answers above. Keep the "Do I need to be technical" answer. Do **not** add a bug-vs-feature FAQ. Do **not** re-add an ownership FAQ.
- **About.** Description: "Two founders. One builds, one makes sure it's worth building." **Nate bio:** builder-first, no fabricated portfolio and no cited projects (nothing is published or in real use yet). Frame how he thinks — fast, simple, stable — with Harvey Mudd CS as a credential line, not the headline. Remove the `[INPUT: notable projects]` beat entirely. **Brandon bio:** the business/people half — has worked inside small businesses, owns scoping, communication, and making sure every build earns its cost. **whyBcns:** honest founding story, e.g. "Small businesses get two bad options. Software that doesn't fit, or a price only big companies can pay. We build the third one. Custom tools, built lean, straight from the two of us." Credentials: keep only true lines (Harvey Mudd CS for Nate); leave Brandon's NYU program and any extra lines as Needs-Nate slots.
- **Holding states (content is right — only scrub the AI-writing tells).** Strip em-dashes. Past-work body: "...as projects wrap. Each one covers the problem, what we built, and what changed." Reviews title: replace the limp "Reviews will live here too" with **"No reviews yet. That changes with our first client."** Reviews body: "Real names, real businesses, unedited. As soon as our first clients have something to say." Keep both CTAs. Optionally add one founding-client line (early clients get our full attention).
- **Page meta.** Write real SEO titles (50–60 chars) and descriptions (140–160 chars) for all five pages from the positioning above. No Nate input needed.

#### Needs-Nate (stay `[INPUT: …]` after C1)

- [ ] **Founder photos** — both Nate and Brandon (`about.founders[n].photo`).
- [ ] **Brandon's NYU program** and any specific credential lines (`[INPUT: NYU program]`, `[INPUT: credential 2/3]`).
- [ ] **Brandon's experience summary** — the specifics of which small businesses / roles, if he wants them named beyond "worked inside small businesses."
- [ ] **Any extra credential lines for Nate** beyond Harvey Mudd CS — if none, the pass drops the empty slots.
- [ ] **First real past-work entry + review** — a data edit that flips /work off the holding state (not part of this copy pass).
- [ ] **Contract-only facts** (not site copy): bcns retains IP while the client gets perpetual free use; warranty excludes third-party/outside changes and client edits; hosting, API, and infrastructure costs are always the client's responsibility.

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

---
---

# Part II — Repo setup plan (client apps)

> Locked in the 2026-07-14 repo/pizza grilling session. Governs how all client
> apps are structured in this monorepo from here on. The reusable template is
> **extracted after the first client app ships** — nothing here is speculative
> scaffolding.

## Decisions locked

| Area | Decision |
| --- | --- |
| **Client apps live in the monorepo** | `apps/<business-name>/` (Option A over separate repos). Folder name = the business's name, always. No product-type suffixes. |
| **Shipped = frozen** | The delivered artifact is a packaged binary — repo churn can never reach a client's machine. Rebuildability is protected by: (1) **git tag at ship** (`<business>-v1.0-shipped`) capturing the whole workspace, (2) committed lockfile. |
| **Shared packages are additive-only** | `@bcns/ui` / `@bcns/config` never break existing APIs. Incompatible change needed → add a new component, don't mutate the old one. |
| **Product taxonomy lives in app READMEs, not folders** | Each `apps/<business>/README.md` carries frontmatter: `type: dashboard \| workflow-app`, `delivery: local-electron \| hosted-web \| …`, `data_sources: […]`. Dashboard-vs-app is a template axis, not a folder axis. |
| **No premature package extraction** | All app logic stays app-local for the first build. `packages/` gains nothing new until a shipped app proves what's reusable. Expected first graduates (post-ship): ingestion interface, Electron shell scaffold, packaging config. |
| **Renderer/shell separation (mobile insurance)** | Every client app splits `src/renderer/` (React web app — all UI + product logic, **never imports Electron APIs**) from `src/shell-electron/` (window, polling, file access), talking through one typed IPC bridge. Mobile later = new shell (Capacitor/hosted) around the same renderer, zero rewrite. |
| **Template extraction (post-ship)** | After the first client ships: copy `apps/<business>/` → `templates/local-app/`, strip client specifics into config/slots. Future taxonomy (`templates/hosted-dashboard/`, …) earns its way in from shipped apps only. |
| **Delivery-shape decision framework (future clients)** | Ask in order: (1) Who looks at it — one person / one machine? → local app, no auth. Multiple people/devices? → hosted. (2) Must anything run when no one is using it? → needs a host or poll-on-open redesign. (3) What's the 3-year zero-touch failure surface? Every dependency is scored: subscription that can lapse, token that can expire, service that can go down, API that can deprecate. Fewest wins. (4) Does the client pay for hosting knowingly, or is $0/forever required? |

## Conventions for every client app

- Extends `@bcns/ui` + `@bcns/config` via `workspace:*` (per root CLAUDE.md).
- Fail visible, degrade manual: every automation, on failure, shows one plain-English banner while the rest of the app keeps working via manual paths. Automation failure never bricks the product.
- All money/date business math in pure-function modules, separate from UI — unit-testable headlessly.
- Client credentials/config live only on the client machine (gitignored `.env`/app-data), populated at handoff. Test fixtures are always fabricated, never real client documents.
- App must run its renderer as a browser dev server (`pnpm dev` → localhost) — required by the two-phase build cycle (dev-team-auto QA + layout-loop both drive the browser, not the packaged binary). Packaging happens after both phases.

---
---

# Part III — First product: revenue tracker (client: DeLuca's, pizza business — `apps/delucas/`)

> A single local desktop app where a non-technical pizza-shop owner opens one
> window and immediately sees how his business is doing. Install once, leave
> alone: $0/month, no server, no subscription, no OAuth. Two-phase build:
> **dev-team-auto** builds Section 1 (architecture + function, plain UI) and
> stops at the marker; **layout-loop** runs Section 2 (design pass) in cowork;
> packaging + handoff are Needs-Nate items after both.

## Decisions locked (2026-07-14 grilling)

| Area | Decision |
| --- | --- |
| **Shape** | Electron desktop app (over Tauri: TS everywhere, Node ecosystem for IMAP/SQLite, bundled rendering engine frozen at ship — system-webview drift can't touch it). React + TypeScript renderer. electron-builder producing **both** Mac `.dmg` and Windows installer — client's laptop OS unknown; pick at handoff. Installers are unsigned (Nate installs in person; do not buy signing certs). |
| **Users/auth** | One user, his personal laptop, monitoring-only. **No auth, no login screen.** |
| **Storage** | Local SQLite (`better-sqlite3`) in Electron's app-data dir. Persists across sessions automatically. |
| **Backup** | Zero-touch: on every app close (and daily on open), copy the SQLite file to a cloud-synced folder on his machine (Google Drive/iCloud/OneDrive — whichever exists, detected/configured at handoff). Most likely 3-year failure is his laptop dying, not any API. |
| **Ingestion — invoices (Napoli Foods, Foxon Park/Pepsi, utilities)** | Automatic: on app open, IMAP-poll his email, pull **every unprocessed email with a PDF attachment** (classify, don't filter by sender — vendor lists rot), send PDF→image→LLM, extract `{is_invoice, vendor, date, amount}` JSON. Store confirmed invoices; show them in a "newly imported" strip. Poll-on-open only — **no background daemon**; IMAP catches up on everything missed. |
| **Email access** | IMAP + app-specific password (no OAuth — token expiry is the #1 leave-alone killer). Provider TBD: Gmail/ISP = fine; **Outlook/M365 = problem (Microsoft killed basic-auth IMAP)** — if Outlook, drag-and-drop becomes primary and email polling is dropped. Confirm provider before handoff; build assumes generic IMAP (`imapflow`). |
| **LLM** | Anthropic API, stable alias (not a pinned dated model). **Client's own account + his card, set up entirely by Nate at handoff, hard spend cap (~$5/mo).** Failure = visible banner + manual fallback, fixable by phone call; never a code update. All LLM calls go through one module, mocked in all tests — QA never hits the live API. |
| **Ingestion — revenue (Slice POS)** | v1: manual entry (period + amount). **First investigation when his login arrives: Slice's daily/weekly summary emails** — if they exist, revenue rides the existing email+LLM pipeline and manual entry drops to fallback. Slice API = later slot. |
| **Ingestion — labor (unknown employee app)** | v1: manual entry. Integration slot reserved. |
| **Rent** | Recurring fixed cost: entered once with start date + amount, auto-materializes monthly. Editable. |
| **Extensibility slot** | Single app-local `IngestionSource` interface — `{ name, fetch(), parse() } → NormalizedTransaction[]`. Email+LLM, drag-and-drop, manual entry, recurring-rent are the v1 implementations. Slice API / labor app later = one new file each; nothing else changes. **Not** a `packages/` module yet. |
| **Fallback chain** | Every automated source degrades: email fails → banner + drag-and-drop PDF (same parser); LLM fails → banner + drag-and-drop with manual amount fields; everything fails → manual entry tab still works. |
| **Reporting grain** | **Monthly.** (Week toggle deferred; revisit after he uses it.) |
| **Done** | Two milestones: **RC (ready-to-ship)** = end of Section 3 below — installers built, tests green, demo data correct. **Done** = working on his machine with his real accounts (Section 4 handoff checklist complete). |

## Guardrails (Section 1 / dev-team-auto)

- Function and structure only — plain-but-correct UI; **no visual design, no `dt-ui`**. Section 2 (layout-loop) owns look-and-feel.
- Every `done when:` headlessly verifiable: pure unit tests for parsing, P&L math, date bucketing, recurring materialization; behavioral checks against the **renderer dev server** (localhost), never the packaged binary.
- No live network in tests: IMAP mocked with fixture mailboxes; LLM mocked with fixture responses; fixture invoices are fabricated.
- Renderer never imports Electron/Node APIs — typed IPC bridge only (enforced by lint rule or import test).
- `pnpm lint && pnpm typecheck && pnpm build` green after every item.

## Section 1 — Architecture + function (dev-team-auto)

### P1 — App scaffold: Electron + renderer/shell split · `status: todo` · `track: full`

- **task:** Create `apps/delucas/` in the workspace: Electron main process (`src/shell-electron/`), React+TS renderer (`src/renderer/`, Vite dev server), typed IPC bridge (`src/bridge/` — one interface file defining every shell capability the renderer may call: db queries, ingestion trigger, file dialogs). Depends on `@bcns/ui`/`@bcns/config` via `workspace:*`. `pnpm dev` runs the renderer in a browser at localhost with a mock bridge; `pnpm dev:electron` runs the real shell. App README with taxonomy frontmatter (`type: workflow-app`, `delivery: local-electron`).
- **done when:** renderer loads in a plain browser via `pnpm dev` with the mock bridge; Electron window opens via `pnpm dev:electron`; an import-boundary test proves `src/renderer/` imports nothing from `electron`/`node:*`; build green.

### P2 — Data model + P&L core · `status: todo` · `track: full`

- **task:** SQLite schema (via `better-sqlite3`, migrations run on app start): `transactions` (id, date, amount_cents, direction: revenue|expense, category: food|beverage|utilities|rent|labor|other, vendor, source: email|dragdrop|manual|recurring, source_ref, created_at), `recurring_rules` (rent), `processed_emails` (message-id dedupe), `settings`. Pure-function P&L module: bucket transactions into calendar months; compute per-month revenue, expenses (total + by category), profit; 12-month series; plain-English summary sentence generator ("You made $X more than you spent in <month>"). Recurring materializer: rent rule → one transaction per month, idempotent.
- **done when:** unit tests cover month bucketing (incl. year boundaries, timezone-safe date handling), P&L math with mixed transactions, category totals, recurring idempotency (running twice creates no duplicates), summary sentence for profit/loss/zero cases; schema migrates from empty; build green.

### P3 — Ingestion framework + manual + drag-and-drop sources · `status: todo` · `track: full`

- **task:** Define `IngestionSource` interface + `NormalizedTransaction` type; ingestion runner that executes sources, dedupes (by source_ref), writes transactions, and records a per-run report (found/imported/failed) for the UI. Implement: **manual-entry source** (renderer form: direction, date, amount, category, vendor — big inputs, no jargon); **recurring source** (rent, from P2); **drag-and-drop source** (drop zone accepts PDF → pdf-to-image → LLM extraction module → prefilled confirm card the user approves/edits before save; on LLM failure, same card with empty amount for manual fill). LLM extraction module: one function, Anthropic API via stable alias, strict JSON schema out `{is_invoice, vendor, date, amount, confidence}`; fully mockable.
- **done when:** unit tests: runner dedupe (same source_ref twice → one transaction), each source normalizes to identical `NormalizedTransaction` shape, LLM module returns parsed fixture JSON and surfaces malformed-response errors; behavioral check on dev server: manual entry creates a transaction that appears in the dashboard; drag-and-drop with a fixture PDF + mocked LLM shows the confirm card and saves on approve; build green.

### P4 — Email (IMAP) ingestion source · `status: todo` · `track: full`

- **task:** IMAP source using `imapflow`: on app open (and via a "Check now" button), connect with host/user/app-password from settings, find emails with PDF attachments not in `processed_emails`, run each through the P3 LLM extraction; `is_invoice: true` + confidence high → import with vendor/category mapping (vendor string → category via a small editable mapping table, default `other`); low confidence → queue as a review card (same confirm card as P3). Record message-ids processed regardless of outcome. Failure handling per the fallback chain: connection/auth failure sets a status the UI renders as the plain-English banner; never crashes; drag-and-drop unaffected.
- **done when:** tests against a mocked IMAP server/fixtures: new invoice email → transaction imported once (re-run imports nothing); non-invoice PDF (fixture menu) → classified out, no transaction; low-confidence → lands in review queue; auth failure → status flag set, no crash; vendor→category mapping applied; build green.

### P5 — Dashboard (the product) · `status: todo` · `track: full`

- **task:** Main screen, monthly grain: (1) headline — current month Revenue / Expenses / Profit as three large figures, profit green/red, plain-English sentence beneath (from P2); (2) 12-month profit bar chart; (3) current-month expense breakdown by category (bars, not pie); (4) "Since you last opened" strip listing newly imported items from the last ingestion run report ("3 new invoices: Napoli $840 …"); (5) any active failure banners (email/LLM status from P4) — one line, plain English, dismissible-but-returns-while-broken. Second tab **"Add & fix"**: manual entry form, drag-and-drop zone, review queue, transaction list for the current month with edit/delete, rent rule editor. Month navigation (prev/next). Plain functional styling only.
- **done when:** behavioral checks on dev server with seeded fixture data: headline numbers equal P2-computed values for the seeded month; sentence matches profit sign; 12 bars render with correct values; category bars match seeded totals; newly-imported strip reflects a simulated ingestion run; editing a transaction updates the headline; banner renders when email status is failed; build green.

### P6 — Settings, backup, first-run · `status: todo` · `track: full`

- **task:** Settings screen (intended for Nate at handoff, not the client): email host/user/app-password, Anthropic key, backup folder path, vendor→category mapping editor. Backup: on app quit and once per calendar day on open, copy the SQLite file to `<backup folder>/delucas-backup-<date>.db`, keep last 30, surface last-backup date subtly on the dashboard; backup failure → the standard banner. First-run: empty-state dashboard with a friendly "no data yet" state (no crash on zero transactions). electron-builder config for Mac `.dmg` + Windows NSIS (unsigned).
- **done when:** unit tests: backup rotation keeps 30, daily-on-open triggers at most once per day, settings round-trip persist; behavioral: empty DB renders the empty state, settings edits persist across renderer reload; `pnpm package` (or equivalent) produces both installers locally; build green.

---

> **⚠️ AUTONOMOUS RUN — STOP HERE**

_dev-team-auto halts here. C1 (website voice pass) and P1–P6 (pizza app) are complete. Visual passes for both projects run via `layout-loop` in cowork; Sections 3–4 are Needs-Nate._

---

## Post-overnight — Visual passes (layout-loop, cowork)

### bcns website — Visual pass

brand: nate-personal
launch: pnpm --filter web dev
url: http://localhost:3000

> Presentation only — never edit copy, data, props, logic, or routing. Isolated
> branch, one focused change per pass, morning report, never auto-merged.
> `[INPUT: …]` strings are content, not styling bugs — style them as normal text.
> Run this pass AFTER C1 completes — the copy will have changed (new tier names, holding-state rewrites, bios).

- page: /
  notes: thin home — hero + 3 nav cards + contact must feel complete, not sparse; nav cards are the primary interaction, make them obviously clickable
  status: not started

- page: /services
  notes: 4 use-case cards (incl. AI consulting) + 3-step process; keep the AI card visually peer to the others, not an afterthought
  status: not started

- page: /pricing
  notes: 3 cards where card 3 is a day-rate, not a tier — differentiate it; price strings like `$2,000–$5,000` must not break the card rhythm
  status: not started

- page: /about
  notes: two equal founder cards; builder-first hierarchy — names and roles before schools
  status: not started

- page: /work
  notes: holding state must look intentional and confident, not empty — this page is linked from a home nav card
  status: not started

### DeLuca's app — Visual pass

brand: TBD (client brand profile — pizza-shop warmth; define at session start)

- Targets: dashboard screen, Add & fix tab, confirm/review cards, banners, empty state.
- North star: a man who barely uses computers reads the headline in 3 seconds. Big type, high contrast, no chart junk, no jargon anywhere ("Money in", not "Revenue", if it reads better).
- Presentation only — no logic, schema, or IPC changes. Isolated branch, no merge without Nate's sign-off.

## Section 3 — Release candidate (Needs-Nate) — *milestone: ready to ship*

- [ ] Review + merge Sections 1–2; tag nothing yet.
- [ ] Load realistic demo data; eyeball every number against hand-computed P&L.
- [ ] Live-fire test with real Anthropic key + a real test mailbox: send fixture invoices, confirm end-to-end import.
- [ ] Build both installers; install on one of our machines from the artifact (not from dev) and re-verify.
- [ ] **RC reached** when all above check out.

## Section 4 — Handoff (Needs-Nate) — *milestone: done*

- [ ] Get client's email provider (**if Outlook/M365 → decision point: drag-and-drop-primary variant**), Slice login, labor-app name.
- [ ] Check his inbox for Slice summary emails → if present, plan revenue automation as v1.1 (new `IngestionSource`).
- [ ] On his laptop: install correct-OS build; enable 2FA + generate email app password; create his Anthropic account (his card, ~$5 spend cap); configure settings; point backup at his synced folder and watch one backup sync.
- [ ] Watch real invoices import; correct vendor→category mappings live.
- [ ] Tag `delucas-v1.0-shipped`; commit lockfile.
- [ ] Walk him through it: open app → read numbers. That's the whole tutorial.
- [ ] **Done** when he reads this month's profit on his own machine without help.
- [ ] Post-ship (bcns, not client): extract `templates/local-app/` from the shipped app.
