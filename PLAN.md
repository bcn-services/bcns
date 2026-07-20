# bcns — Business Model Migration Plan (managed hosting)

> Source of truth for the model-migration run. bcns is moving from
> **build-and-hand-off** (large one-time fee, client runs it) to
> **build-and-operate** (smaller setup fee + recurring fee, bcns hosts it so the
> client accesses it from any device). This run makes the website + repo changes
> that migration requires. It does **not** build any specific client app.
>
> **Scope of this run (above the stop marker):** website copy/registry changes to
> the new pricing + hosted framing, plus the shared architecture for hosted web
> apps (a new `@nseluga/app-core` package, a working `templates/hosted-web/` starter,
> an architecture decision record, and repo-doc updates). Everything that needs a
> live account (Clerk, Stripe, Neon, Cloudflare, Coolify/Hetzner) or a GitHub repo
> is a **Needs-Nate** item below the marker, per "make projects locally, connect
> to services/GitHub after."
>
> **Excluded:** the DeLuca's app. It stays a one-time desktop handoff. Its pending
> work is preserved below the stop marker, untouched by this run.
>
> **Base branch:** this plan lives on `model-migration`. Never merge to main
> without Nate's sign-off.

---

## Decisions locked (2026-07-18 model-migration session)

| Area | Decision |
| --- | --- |
| **Pricing shape** | Smaller one-time **setup fee** + **recurring monthly fee**. Replaces the old one-time-only model for all new hosted apps. |
| **Setup fees** | Standard **$1,000**, Advanced **$3,000**. |
| **Recurring fees** | Standard **$149/mo** (range $129–199), Advanced **$349/mo** (range $299–499). Anchored at/above comparable off-the-shelf SMB team plans (booking $50–150/mo, ops suites $100–300+/mo), justified by custom fit + hosting + maintenance + taking no cut of client transactions. |
| **Seat model** | **15 seats included** at the flat monthly price, then **$20/seat/mo** beyond. Protects small clients, scales revenue on bigger ones, trivial to explain. |
| **AI (Anthropic)** | **Bring-your-own-key.** Clients attach their own Anthropic API key (billed directly by Anthropic); bcns never touches AI cost or liability. AI is an **opt-in build feature**, not a metered billing line. Default to a cheap model (Haiku); show an in-app usage indicator; store the key encrypted, never in a repo. Optional one-time "AI setup" fee for wiring it. |
| **Hosting stack** | **Coolify on one Hetzner VPS + Cloudflare + Neon Postgres + Clerk auth + Stripe.** PaaS ergonomics at VPS prices; per-app container isolation; managed DB (off-box backups); Cloudflare for DNS/SSL/DDoS/WAF. ~$25–75/mo total to host ~10 clients. Revisit self-hosting only past ~$150–200/mo steady spend. |
| **Repo model** | **One repo per client business** (reverses the old Part II "monorepo, separate repos rejected" decision). Reasons: per-client isolation of code/secrets/deploy, clean handoff/offboarding, independent deploy cadence, smaller security blast radius. |
| **Code sharing** | Shared code lives in **versioned packages** (`@nseluga/ui`, `@nseluga/config`, new `@nseluga/app-core`) consumed by each client repo; a **`templates/hosted-web/` starter** (later a standalone GitHub Template Repository) spins up new client repos pre-wired. Improve a package once → bump the version across client repos to propagate. |
| **What stays in the bcns monorepo** | The marketing site (`apps/web`), DeLuca's (`apps/delucas`), the shared packages, and the template source. This repo becomes the **bcns platform repo**. |

### Guardrails (all items)

- **Single source of truth for site copy** — all website copy flows through the
  content registry (`apps/web/lib/content.ts`); `CONTENT.md` mirrors it 1:1.
- **Voice rules still apply** to any new site copy: no em-dashes (en dashes only
  inside numeric ranges), no buzzwords, no "SaaS"/"software as a service", no
  "we help X", third-to-eighth-grade reading level. See the retained voice spec
  in git history (previous C1 pass).
- **No invented facts** — no fake clients, quotes, or metrics.
- **No live services in tests.** Anthropic, Stripe, Clerk, and Postgres are all
  **mocked** in every test. `done when:` criteria must be verifiable headlessly.
- **Stay green** — `pnpm lint && pnpm typecheck && pnpm build` after every item.

---

## Section 1 — Website: new pricing + hosted framing (dev-team-auto)

### W1 — Reshape pricing registry + page to setup + recurring + seats · `status: done` · `track: full` · `flag: money`

- **task:** Rework the pricing content in `apps/web/lib/content.ts` and the pricing
  page/components to express the new model. Each build tier now carries a
  **one-time setup fee**, a **recurring monthly fee**, and the **seat policy**.
  Add fields to the pricing tier type as needed (`setup`, `monthly`, `seats`) —
  keep price-like fields as free strings so exact copy renders. Standard =
  setup **$1,000** / **$149/mo**; Advanced = setup **$3,000** / **$349/mo**; both
  state **"Includes up to 15 users, then $20/user per month."** Keep the AI
  consulting day-rate card ($800/day) as-is, visually distinct. Update the FAQ
  pricing answer to describe setup + monthly + seats instead of the old
  one-time-only ranges.
- **done when:**
  - Pricing renders three cards; the two build cards each show a one-time setup
    fee **and** a recurring monthly fee **and** the 15-seats/$20-overage line
    (rendered-HTML test asserts all three appear on each build card).
  - The exact strings `$1,000`, `$149`, `$3,000`, `$349`, `$20`, and `15` each
    appear on the rendered `/pricing` page (spot-check test).
  - No old one-time-only range strings (`$2,000–$5,000`, `$5,000–$15,000`) remain
    anywhere in `content.ts` (grep returns zero).
  - The FAQ "How much will my project cost?" answer describes the setup +
    monthly + per-seat model and contains no `$2,000`/`$5,000`/`$15,000` figures.
  - `content.ts` has no em-dashes (`grep -c "—"` returns 0; en dashes allowed only
    in numeric ranges) and no banned buzzwords/"SaaS"/"we help".
  - Existing passing tests remain passing; `pnpm lint && pnpm typecheck && pnpm build` green.

### W2 — Replace the now-false ownership / "runs without us" claims with honest hosted framing · `status: done` · `track: full`

- **task:** Under the hosted model the client no longer owns/runs the software, so
  several current claims are false and must be corrected in `content.ts`.
  (1) Hero proof point **`Use it forever, free`** → a hosted-accurate line such as
  `We host it and keep it running`. (2) Contact highlight **`Yours to use`** body
  currently reads "Your data and accounts stay yours. It keeps running whether we
  work together or not." Rewrite to a truthful managed-service framing: the app is
  hosted and maintained by bcns, and **the client's data is always theirs and
  exportable** (do not claim the software keeps running if they stop paying).
  (3) Anywhere else that implies a one-time handoff / client-run software (e.g.
  the "Build & handoff" process step, any "you own the result" line) → reframe to
  build → launch → **we host, run, and maintain it**.
- **done when:**
  - The string `Use it forever, free` no longer appears in `content.ts`; the hero
    proof point instead communicates that bcns hosts/runs it (spot-check test).
  - The phrase `whether we work together or not` no longer appears anywhere in
    `content.ts` (grep returns zero).
  - No rendered page claims the client owns the code or that the software keeps
    running independently of bcns (rendered-HTML test asserts the old phrases are absent).
  - The contact highlight communicates data is the client's and exportable
    (rendered text contains a data-ownership/export statement).
  - `content.ts` stays em-dash-free and buzzword-free; existing tests pass; build green.

### W3 — Add a "how hosting works" explanation (what recurring covers, what happens if you stop) · `status: done` · `track: light`

- **task:** Add content that explains the managed-hosting model honestly, in the
  registry (new FAQ entries and/or a short pricing-page block). Cover: **what the
  recurring fee includes** (hosting, uptime, backups, security patches, bug fixes,
  small tweaks); **that bcns runs it on its own servers so the client accesses it
  from any device**; **that clients bring their own Anthropic key for any AI
  features** (opt-in, billed by Anthropic, can be omitted); and **what happens if
  they stop paying** (hosting stops, data is exported and handed over). Keep to the
  voice rules.
- **done when:**
  - The rendered `/pricing` page contains an explanation of what the monthly fee
    includes, listing at least hosting, backups, and bug fixes (rendered-text test).
  - A FAQ entry explains the bring-your-own-Anthropic-key model and that AI is optional.
  - A FAQ entry states plainly what happens to the app and the client's data if
    they stop paying (hosting stops; data exported).
  - New copy is em-dash-free and buzzword-free; existing tests pass; build green.

### W4 — Mirror all copy changes into CONTENT.md · `status: done` · `track: light`

- **task:** Update `apps/web/CONTENT.md` so it mirrors the reworked registry 1:1:
  new pricing fields (setup/monthly/seats), the hosted-framing changes, and the
  new hosting/BYOK/stop-paying FAQ entries. Keep the fill/extend guides.
- **done when:** every field in `content.ts` appears in `CONTENT.md` and vice versa
  (no orphans either direction — verify by the existing mirror test if present, else
  a spot check); the new pricing and hosting concepts are documented; build green.

---

## Section 2 — Shared architecture for hosted web apps (dev-team-auto)

> Scope to what is verifiable headlessly: pure/mockable logic and a buildable
> scaffold. Real Clerk/Stripe/Neon/Coolify wiring (needs live keys) is Needs-Nate.

### A1 — Create the `@nseluga/app-core` package: billing math, subscription state, BYOK-AI · `status: done` · `track: full` · `flag: money`

- **task:** Add a new shared workspace package `packages/app-core/` (`@nseluga/app-core`),
  extending `@nseluga/config` like the other packages, exporting three fully-unit-tested
  modules with **no live-service dependencies**:
  **(1) Seat/billing math** — pure functions computing a client's monthly charge
  from tier + seat count: base monthly ($149 standard / $349 advanced), 15 seats
  included, $20/seat beyond; setup-fee lookup ($1,000 / $3,000); everything driven
  by an exported, typed pricing config object (single source of truth, so the site
  and any billing code can import the same numbers later).
  **(2) Subscription-state logic** — pure functions mapping a subscription status
  value (`active | past_due | canceled | trialing`) to an app-access decision
  (`provision | suspend`), plus a typed shape for the Stripe webhook events that
  drive it. No Stripe SDK calls — just the decision logic, so it can be unit-tested
  and later wired to a real webhook handler.
  **(3) BYOK Anthropic client module** — a single function that constructs an
  Anthropic client from a client-supplied API key, defaults to a cheap model
  (Haiku), and throws a typed, plain-English error when the key is missing/invalid.
  The Anthropic SDK is **mocked** in tests; the module never hard-codes a key.
- **done when:**
  - `pnpm --filter @nseluga/app-core test` passes with unit tests covering: the
    monthly charge for 15 seats (no overage), 16 seats (one seat of overage), and
    40 seats, for both tiers; setup-fee lookup for both tiers; subscription-status
    → provision/suspend mapping for all four status values; the BYOK module builds
    a client from a valid key (mocked SDK) and throws the typed error on a
    missing/empty key.
  - The pricing config is a single exported object; the billing math reads its
    numbers from that object (no magic numbers duplicated in the functions).
  - The package builds and is importable as `@nseluga/app-core`; `pnpm lint && pnpm typecheck && pnpm build` green.

### A2 — Scaffold `templates/hosted-web/`: buildable hosted-app starter wired to `@nseluga/app-core` · `status: done` · `track: full` · `flag: security`

- **task:** Create `templates/hosted-web/` as a runnable Next.js (App Router, TS
  strict) starter representing the standard hosted client app, depending on
  `@nseluga/ui`, `@nseluga/config`, and `@nseluga/app-core` via `workspace:*`. Include:
  a README with taxonomy frontmatter (`type: workflow-app`, `delivery: hosted-web`)
  and setup notes; **env-driven config** for the future live services
  (`DATABASE_URL`, Clerk keys, Stripe keys, per-app `ANTHROPIC_API_KEY`) documented
  in a committed `.env.example`, with **no real keys** and graceful behavior when a
  key is absent; an **opt-in AI module** (a feature flag / separate module that
  imports the `@nseluga/app-core` BYOK client, so a client who doesn't want AI simply
  doesn't enable it); a placeholder Stripe subscription-status webhook handler that
  calls the A1 provision/suspend logic (pure logic tested; the HTTP wiring can be a
  stub); a `Dockerfile` and a short `DEPLOY.md` describing the Coolify + Cloudflare
  + Neon + Clerk deploy (documentation only). No secrets committed; the client's
  Anthropic key is read from env, never from source.
- **done when:**
  - `pnpm --filter <hosted-web package name> build` succeeds and `pnpm --filter <hosted-web package name> dev` serves a page that returns HTTP 200 with the AI feature flag **off** and no live keys set.
  - An import-boundary/unit test proves the AI module is not invoked when its feature flag is off (AI is genuinely opt-in).
  - The subscription webhook handler routes through the A1 provision/suspend logic (a unit test drives a `past_due` event to a `suspend` decision).
  - `.env.example` documents `DATABASE_URL`, Clerk, Stripe, and `ANTHROPIC_API_KEY`, and the repo contains no real secret values (grep for obvious key prefixes returns none).
  - A `Dockerfile` and `DEPLOY.md` exist describing the Coolify/Cloudflare/Neon/Clerk deploy; `pnpm lint && pnpm typecheck && pnpm build` green across the workspace.

### A3 — Architecture decision record for the hosted-web model · `status: done` · `track: light`

- **task:** Add `docs/architecture/hosted-web-model.md` capturing the locked
  decisions from the table above as an ADR: the pricing/seat model, BYOK-AI, the
  Coolify/Hetzner/Cloudflare/Neon/Clerk/Stripe stack (with the operating-cost and
  risk notes), the per-client-repo decision **and that it supersedes the old Part II
  "monorepo, separate repos rejected" decision**, and the shared-package +
  template propagation mechanism. Reference `@nseluga/app-core` and `templates/hosted-web/`.
- **done when:** `docs/architecture/hosted-web-model.md` exists and documents the
  pricing model, the hosting stack with operating cost + at least two risks/mitigations,
  the per-client-repo decision with an explicit note that it reverses old Part II,
  and the package/template propagation flow; the file is valid Markdown; build green.

### A4 — Update repo docs to the per-client-repo model · `status: done` · `track: light`

- **task:** Update the repo's own guidance so it no longer tells future work to put
  client apps in the monorepo. In `CLAUDE.md` (repo root), replace the "Adding a
  client app later" section's monorepo instructions with the new model: **new
  client apps get their own repo, generated from `templates/hosted-web/`, consuming
  the shared packages by version**; note that `apps/` now holds only the marketing
  site and DeLuca's (the platform repo's own apps). Update `README.md` similarly if
  it states the old model. Point both at `docs/architecture/hosted-web-model.md`.
- **done when:** `CLAUDE.md` no longer instructs creating client apps under `apps/<client>/`
  and instead describes per-client repos generated from `templates/hosted-web/`; both
  `CLAUDE.md` and `README.md` reference the ADR; no other doc still asserts the
  monorepo-only client model (grep for the old phrasing returns zero); build green.

---

## Section 2 — Revenue ingestion (dev-team-auto)

> Slice has no merchant-facing API and no confirmed automated email summaries (researched 2026-07-17).
> The one path buildable without client credentials: let the owner drag-drop a Slice statement PDF
> (downloaded from owners.slicelife.com) and mark it as revenue. If @slicelife.com emails exist at
> handoff, `SliceEmailSource` (Option A in §3b) becomes the upgrade — one new file, no schema change.

- task: Add a "This is revenue" toggle to the drag-drop confirm card so any PDF (e.g. a downloaded Slice statement) can be imported as `direction: "revenue"` rather than going through the expense-invoice classifier. When the toggle is on, bypass `is_invoice`, force `direction: "revenue"`, and let the user confirm the amount. When off, the existing invoice path is unchanged.
  done when:
    - Dragging a PDF with the toggle on saves a transaction with `direction: "revenue"` in the database
    - A fixture non-invoice PDF imported with the toggle on is not rejected by the `is_invoice` check
    - Toggle defaults to off and all existing drag-drop tests remain passing
    - New unit test covers the revenue toggle path from confirm card through runner to DB row
    - `corepack pnpm typecheck && corepack pnpm test` green from `apps/delucas/`
  status: not started
  track: light

---

> **⚠️ AUTONOMOUS RUN — STOP HERE**

_dev-team-auto halts here after Section 2. Visual passes done on separate branches. Sections 3–5 are Needs-Nate._

---

## Needs-Nate — hosted infrastructure & repo setup (do after the run)

- [ ] **Provision accounts:** Hetzner (one CPX31 VPS), install **Coolify**; Cloudflare (DNS/SSL/WAF); Neon (managed Postgres); Clerk (auth); Stripe (subscriptions + Customer Portal). Record which env vars each produces.
- [ ] **Publish shared packages** to a private registry (GitHub Packages): `@nseluga/ui`, `@nseluga/config`, `@nseluga/app-core`, so external client repos can install them by version. (Set up Renovate/Dependabot to bump them across client repos.)
- [ ] **Extract the template to its own repo:** copy `templates/hosted-web/` → a new local project `bcns-app-template/`, then connect it to GitHub and mark it a **Template Repository**. (Make the project locally first; connect to GitHub after.)
- [ ] **First client app (Coventry Hills):** needs a scoping/grilling session before any build (requirements unknown). Then generate a **new local project** `client-coventry-hills/` from the template, build the client-specific delta, deploy to Coolify; connect to GitHub after.
- [ ] **Wire live services in `templates/hosted-web/`:** real Clerk auth, real Stripe webhook endpoint + Customer Portal, Neon `DATABASE_URL` + migrations, backups (Neon PITR + nightly dumps to R2/Storage Box), monitoring (Better Stack/UptimeRobot + Sentry). These need the keys from the provisioning step.
- [ ] **Data-handling basics:** a simple client data-processing note, a tested restore, and a one-page incident plan (you now hold client business data).
- [ ] **Website go-live:** the model-migration copy ships on the marketing site (Vercel) after the run is reviewed and merged.

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

## Section 3 — Packaging (Needs-Nate) — *milestone: installers built and verified*

- [ ] Run `electron-builder install-app-deps` from `apps/delucas/` — rebuilds `better-sqlite3` and `@napi-rs/canvas` for Electron's ABI (skipping → `NODE_MODULE_VERSION` crash on launch).
- [ ] Build: `corepack pnpm build && corepack pnpm package` from `apps/delucas/`. Artifacts → `release/`. Mac = unsigned DMG (x64 + arm64); Windows = unsigned NSIS .exe (x64).
- [ ] **Highest risk:** pdfjs `standard_fonts` dir is resolved via `createRequire` — inside asar this may point inside the archive where `FilesystemStandardFontDataFactory` cannot read. After installing from the artifact, drag-drop a font-embedded PDF and confirm the LLM receives a legible image (not blank/garbled).
- [ ] Windows NSIS on macOS requires Wine (`brew install --cask wine-stable`). If unavailable, defer and ship Mac DMG first; confirm client laptop OS at handoff.
- [ ] Install from the artifact (not dev) and re-run the full pipeline: drag-drop PDF → confirm card saves; email Check Now → invoices imported; quit → backup written; re-open → backup not re-triggered.
- [ ] **RC reached** when the installed artifact passes all checks above.

---

## Section 3b — Slice integration (Needs-Nate, researched 2026-07-17)

> Slice's public API (`get-slice.com/docs/api-overview`) is a **fintech partner API** — seven endpoints for quote/payment/settlement — built for businesses embedding Slice's payment product, not for pizzeria owners reading their own revenue. No merchant sales endpoint exists. Partner-only credentials require a "pilot conversation" with Slice; not available to DeLuca's owner. **Slice API is not a viable path.**
>
> No confirmed automated email summaries from Slice either. Reporting lives in-app (Owner's App / owners.slicelife.com). Emails from `@slicelife.com` exist (order notifications, payout receipts) but no confirmed periodic P&L summary. Check the client's inbox at handoff before ruling out the email path.

**Integration options — pick at handoff:**

| Option | What unblocks it | Effort |
|--------|-----------------|--------|
| **A — `SliceEmailSource`** (preferred) | `@slicelife.com` payout/statement emails exist in inbox | ~1 day: new `sources/slice-email.ts` filtering for `@slicelife.com`, new `extractRevenueFromSlice()` in `llm.ts`, returns `direction: "revenue"`. `NormalizedTransaction` already has the field — no schema change. |
| **B — drag-drop PDF override** | No automated emails; owner downloads monthly PDF from portal | ~2h: add a "revenue summary" toggle to the drag-drop confirm card to bypass `is_invoice` and set `direction: "revenue"`. |
| **C — manual entry** (current v1) | Always available | Done. |

- [ ] **[INPUT: Slice login]** — at handoff, search inbox for `@slicelife.com` payout/statement emails; choose option A, B, or C.
- [ ] Implement A or B as v1.1 post-ship if needed.

---

## Section 3c — Labor integration (blocked — Needs-Nate)

> v1 manual entry is live. Full automation requires the employee/scheduling software name.

- [ ] **[INPUT: labor-app name]** — get at handoff; research email/CSV/API export; add `LaborSource` as a new `IngestionSource`.

---

## Section 4 — Release candidate (Needs-Nate) — *milestone: ready to ship*

- [ ] Review + merge `delucas-e2e`; review + merge visual pass (`visual/delucas-pizza-warmth`).
- [ ] `corepack pnpm typecheck && corepack pnpm test` green from `apps/delucas/`.
- [ ] Load realistic demo data; eyeball every number against a hand-computed P&L.
- [ ] Complete Section 3 (Packaging) checklist above, including pdfjs font verification.
- [ ] **RC reached** when the installed artifact passes all Section 3 checks.

---

## Section 5 — Handoff (Needs-Nate) — *milestone: done*

- [ ] Get client's email provider (**if Outlook/M365 → decision point: drag-and-drop-primary variant**).
- [ ] **[INPUT: Slice login]** — check inbox for `@slicelife.com` emails → pick option A, B, or C from Section 3b.
- [ ] **[INPUT: labor-app name]** — note for v1.1 labor integration.
- [ ] On his laptop: install correct-OS build; enable 2FA + generate email app password; create his Anthropic account (his card, ~$5 spend cap); configure settings; point backup at his synced folder and watch one backup sync.
- [ ] Watch real invoices import; correct vendor→category mappings live.
- [ ] Tag `delucas-v1.0-shipped`; commit lockfile.
- [ ] Walk him through it: open app → read numbers. That's the whole tutorial.
- [ ] **Done** when he reads this month's profit on his own machine without help.
- [ ] Post-ship (bcns, not client): extract `templates/local-app/` from the shipped app.
