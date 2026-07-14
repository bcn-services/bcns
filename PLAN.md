# bcns Landing Template — Plan (v1)

> Source of truth for the first build run. Goal: a **reusable, scalable landing
> template** — solid architecture and on-brand visuals, with content as clearly
> labeled `[X GOES HERE]` slots plus an outline of what belongs in each. Not a
> finished marketing site. The words are specced, not written; the bones and the
> design are real.
>
> **This run has two sections, split by the `⚠️ AUTONOMOUS RUN — STOP HERE`
> marker.** An orchestrator prompt (pasted by Nate into a Claude cowork session)
> drives both: `dev-team-auto` builds Section 1 (architecture) and stops
> at the marker; then `layout-loop` runs Section 2 (visuals). The two skills have
> **complementary edit fences** — dev-team-auto owns structure/data/copy-slots;
> layout-loop is presentation-only and forbidden from touching copy or data — so
> the handoff is clean with no overlap.

---

## Status

- **Scaffold:** pnpm + Turborepo monorepo, Next.js 14 App Router, TS strict, Tailwind, shared `@bcns/ui` + `@bcns/config`. Lint/typecheck/build all green. 6 landing sections exist with placeholder prose.
- **Section 1 (dev-team-auto):** architecture only — data-driven content model, full information architecture scaffolded, prose stripped to labeled slots, `CONTENT.md` spec. **No style/layout work.**
- **Section 2 (layout-loop):** full visual first draft against `craft.md` + `nate-personal` brand, in cowork on an isolated branch. Never auto-merged.
- **Out of scope this run:** `templates/`, product-building, the rest of the repo. Real content, domain, email, deploy — all Needs-Nate, below the marker.

---

## Finalized decisions

| Area | Decision |
| --- | --- |
| **Company name** | `bcns` — **final.** Wire it everywhere (`site.ts`, metadata, footer). |
| **Domain** | `bcns.com` is taken. Site URL / domain stays a clearly-marked **placeholder constant**; real domain is Needs-Nate. |
| **Email / contact** | No inbox yet. `hello@bcns.com` shown as the eventual address; **form is the only contact path.** Receiving inbox + form provider are Needs-Nate. |
| **Content model** | Every section is **data-driven** from a typed content registry (extend `apps/web/lib/site.ts` or add `lib/content.ts`). Copy = labeled `[SLOT: …]` placeholders, never hardcoded in JSX. Adding an entry (a review, a past-work item) is a **data edit**, not a new component. |
| **Content spec** | Slots live in the data layer **and** are mirrored 1:1 in a standalone `CONTENT.md` (purpose / tone / length per slot) so copy can be drafted outside the codebase. |
| **Information architecture** | Hero · Problem/Solution · How-it-works · Delivery models · Use-cases · **Past work** · **Reviews** · **Pricing** · **FAQ** · **About/founder** · Contact. (Process/timeline folds into How-it-works.) |
| **Visual work** | Handled exclusively by `layout-loop` in Section 2. dev-team-auto does **zero** styling. |
| **Brand** | `craft.md` (invariant taste, exists) + `nate-personal.md` (swappable brand — **draft, must be seeded before Section 2**). |

### Guardrails (for Section 1 / dev-team-auto)

- **Structure and data only. No visual design, no styling passes, no `dt-ui`.** Use `dt-engineer`. Leave every look-and-feel decision to Section 2.
- **No invented facts.** bcns has zero shipped clients — no fake case studies, reviews, or metrics. Example entries in Past work / Reviews are **labeled placeholders** (`[REVIEW 1: …]`), not fabricated quotes.
- **Single source of truth.** All marketing copy flows through the content registry; components render from it. `name`/`domain`/`email` stay single-constant in `site.ts`.
- **Stay green.** `pnpm lint && pnpm typecheck && pnpm build` pass after every item. `done when:` criteria are all verifiable headlessly (build + structural presence), never "looks good."

---

## Section 1 — Architecture (dev-team-auto)

> Run by `dev-team-auto`. Each item drives through the convergence loop
> (`dt-engineer` builds → QA gates tests+behavioral → review → fix) to DONE or
> BLOCKED. Structural only — no visuals.

### A1 — Content-model data layer · `status: done` · `track: full`

- **task:** Introduce a typed, per-section content registry that drives the site. Extend `apps/web/lib/site.ts` (or add `apps/web/lib/content.ts`) with a structured object per section. Refactor the 6 existing sections (`hero`, `problem-solution`, `how-it-works`, `delivery-models`, `use-cases`, `contact-section`) to render entirely from the registry. Replace hardcoded marketing sentences in component bodies with labeled `[SLOT: …]` placeholders in the registry. Do not restyle anything.
- **done when:** `pnpm lint && pnpm typecheck && pnpm build` green; all 6 existing sections render from the registry; no hardcoded marketing sentence remains in any component body; every content field is either a labeled `[SLOT: …]` placeholder or a neutral structural default; no visual/styling changes in the diff.

### A2 — Scaffold the missing sections · `status: done` · `track: full`

- **task:** Add the 5 missing sections as data-driven components reading from the registry: **Past work**, **Reviews**, **Pricing**, **FAQ**, **About/founder**. Each collection-style section (Past work, Reviews, Pricing tiers, FAQ items) uses an **array of entry slots** so entries are addable by data edit alone. Wire each section into `app/page.tsx` and the nav in `site.ts`. Seed 1–2 **labeled example entries** for Past work and Reviews (e.g. `[PAST WORK 1: title / one-line outcome / link]`) — placeholders, not invented facts. Structural markup only; no styling beyond what already exists.
- **done when:** build green; all 5 new sections present on the page and in nav; each collection section supports add-an-entry-by-data (verified by the registry shape); Past work + Reviews carry labeled example-entry slots; no fabricated content; no visual design work in the diff.

### A3 — CONTENT.md spec + slot audit · `status: done` · `track: light`

- **task:** Author `apps/web/CONTENT.md` (or repo-root `CONTENT.md`): every section, every slot, mirrored 1:1 from the data registry, each with **purpose / suggested tone / length guidance**. Add a short "How to fill a slot" and "How to add a section or a collection entry" guide. Verify no drift — every registry slot appears in `CONTENT.md` and vice versa.
- **done when:** `CONTENT.md` covers every registry slot 1:1 (no orphans either direction); includes fill + extend instructions; build green.

### A4 — Legal pages + config scaffolding · `status: done` · `track: light`

- **task:** Create real routed `app/privacy/page.tsx` and `app/terms/page.tsx` pages whose bodies are **labeled slots** (`[PRIVACY POLICY BODY: …]`), not real legal text. Point the footer's Privacy/Terms links at them (kill the dead `#`). Confirm `site.ts` `name: "bcns"`; keep `domain`/`email`/`url` as clearly-commented placeholder constants (single source). Ensure `sitemap.ts` includes the new routes and metadata reads from config.
- **done when:** `/privacy` and `/terms` render with labeled slots; footer links resolve to them; `name` wired as `bcns`; `domain`/`email`/`url` remain single-source placeholder constants; sitemap includes both routes; build green. No real legal text (Needs-Nate).

---

> **⚠️ AUTONOMOUS RUN — STOP HERE**

_dev-team-auto halts here. Everything below is run differently: Section 2 by the
`layout-loop` skill in cowork, and the Needs-Nate items by Nate directly._

---

## Section 2 — Visual first draft (layout-loop, cowork)

> **Prerequisite (Needs-Nate, blocks this section):** seed
> `~/os/knowledge/library/design-language/brands/nate-personal.md` — a draft is
> fine, but the file must exist. `layout-loop` refuses to run without a brand
> file. `craft.md` already exists.
>
> **How to run:** in a Claude **cowork** session (screen access required —
> layout-loop verifies by looking at rendered pixels). The orchestrator prompt
> launches it after Section 1 completes. Launch: `pnpm --filter web
> dev` → `http://localhost:3000`. Brand: `nate-personal`. Target queue: the
> landing page (all sections) + `/privacy`, `/terms`.

### V1 — Full visual formatting pass · `status: not started`

- **task:** Run `layout-loop` over the full site. Apply `craft.md` (invariant taste) + `nate-personal` brand tokens to format the visuals of the entire skeleton for a first draft — typography, spacing rhythm, hierarchy, color, section composition, mobile + desktop. Work on an **isolated branch**, one focused change per pass, commit each iteration. **Do not touch copy, data, props, or the content slots** (edit fence: presentation only). Leave a morning report.
- **done when (layout-loop rubric):** objective gates pass — WCAG AA contrast, no overflow/overlap/clipping, layout holds at mobile **and** desktop. All four rubric rows (uniquely-Nate, intuitive, simple, aesthetically pleasing) satisfied with cited visual evidence. Loop ended by convergence or the 5-pass cap per page. Content provably unchanged. **Never auto-merged** — Nate reviews the report + diff and merges himself.

---

## Needs-Nate (all deferred, none block Section 1)

- [ ] **Brand file** — seed `nate-personal.md` (draft). *Blocks Section 2.*
- [ ] **Domain** — `bcns.com` is taken; pick + buy the real domain, set `NEXT_PUBLIC_SITE_URL` and the `domain` constant.
- [ ] **Inbox + form provider** — set up a receiving inbox (recommend Cloudflare Email Routing → your Gmail, free) and a form endpoint (recommend Web3Forms free tier); set `NEXT_PUBLIC_CONTACT_ENDPOINT` / `NEXT_PUBLIC_CONTACT_ACCESS_KEY`.
- [ ] **Real content** — fill the slots from `CONTENT.md`: copy, Past work, Reviews, Pricing, FAQ, About/founder. Decide the founder/credibility framing (tie to portfolio + HMC, or brand-only).
- [ ] **Legal text** — write real Privacy + Terms bodies.
- [ ] **Deploy** — Vercel free tier (`vercel --prod`), set env vars, attach domain, verify live.

## Out of scope this run (Phase 2 — future PLAN.md)

- Extracting the landing skeleton into a reusable, brand-swappable starter under `templates/`.
- Building actual client products / apps under `apps/`.
- Anything in the repo outside `apps/web/` (except the shared config/UI packages `apps/web` already consumes).

---

## Conventions (for the agents)

- **Section 1 = structure/data/copy-slots only.** `dt-engineer`, never `dt-ui`. No styling. `done when:` is always build + structural presence, verifiable headlessly.
- **Section 2 = presentation only.** `layout-loop` never edits copy, data, props, logic, or routing. Isolated branch, never merges without Nate's sign-off.
- All marketing copy flows through the content registry; components render from it. `CONTENT.md` mirrors the registry 1:1 — update both together.
- No invented facts, quotes, metrics, or case studies. Example entries are labeled placeholders.
- `name`/`domain`/`email`/`url` are single-source constants in `site.ts`.
- Keep `pnpm lint && pnpm typecheck && pnpm build` green after every item.
