# bcns Landing Template — Progress Log

> Living status file. The agents update this after each work item: move the
> **Current position** pointer, flip the milestone status, and append a dated
> entry to the log. `PLAN.md` is the plan (decisions + task checklist); this file
> tracks *where we are in it*. If the two disagree, `PLAN.md` wins for scope — fix
> this file to match reality.

---

## Current position
- **Status:** Platform build, migration, and the marketing-site visual pass are all **complete**. `@nseluga/*` packages published to GitHub Packages; `bcns-app-template` is a GitHub Template Repository; DeLuca's extracted to `bcns-client-delucas`; the template purpose split landed (app-core 0.2.0 absorbs shared client logic, stale in-repo template copy dropped). This repo is the clean **platform repo** (marketing site + shared packages).
- **Next:** Build the **past-work case study system** on the marketing site — clickable cards → `/work/[slug]` detail pages, with screenshots captured from locally-hosted client apps running clean seeded demo data. See `PLAN.md`.
- **Blockers (Needs-Nate):** Written client permission from L2 Detailz and DeLuca's before either is named publicly; real case study copy (every narrative field ships as `[INPUT: …]`); L2 Detailz launch + DNS cutover before its live link can be published. First live deploy of a client app pending. DeLuca's packaging/handoff tracked in `bcns-client-delucas`.
- **Last updated:** 2026-07-27 (layout-loop full run + template split logged; new PLAN.md for case studies)

> **Note:** The DeLuca's milestone rows below are historical — that app now lives
> in `bcns-client-delucas`, where its packaging/handoff work continues.

---

## Milestone status

### v4 — Past-work case study system (dev-team-auto, 2026-07-27, branch `worktree-past-work-case-studies`)
| Item | Status | Notes |
|------|--------|-------|
| 1 — Wire a runnable `test` script | ✅ done [light] — `test` script in apps/web + root, turbo `test` task (dependsOn build, cache false); cleared the 5-file stale-test backlog; 12/12 files green (52 tests, 0 skip); both entry points verified exit-non-zero by probe injection; d47d88c |
| 2 — Extend `PastWorkItem` with case study fields | ✅ done [full] — slug/problem/approach/outcome/screenshots added; two `[INPUT: …]` entries (delucas, l2detailz); CONTENT.md mirrored (89-row cross-check); slug uniqueness+regex mutation-proved; b3's hand-synced `[INPUT:` allowlist replaced by a runtime registry walk; 62 pass/0 fail; 454c3e8 |
| 3 — `/work/[slug]` dynamic route | ✅ done [full] — Server Component route + shared `getCaseStudy()` used by all three exports; `dynamicParams=false` + `notFound()`; `● SSG` prerendering exactly the 2 registry paths; title/description from the item; new `pastWork.caseStudy` labels (+`backLabel`) in registry & CONTENT.md (93-row cross-check re-derived by script); `SectionHeading` gained an additive `as` prop so the page has one `h1` → three `h2`; back link to `/work`; 77 pass/0 fail/0 skip; live prod smoke 200/200/404, median render 3.4ms; f18806e |
| 4 — Link Past Work cards to detail pages | ⏳ not started | |
| 5 — Seed DeLuca's mock bridge (demo dataset) | ⏳ not started | parallel-group: seeds |
| 6 — L2 Detailz demo seed fixture | ⏳ not started | parallel-group: seeds |
| 7 — Capture the three case study screenshots | ⏳ not started | |
| 8 — Render screenshots with `next/image` | ⏳ not started | |
| ⚠️ STOP HERE — item 9 (real client copy + publish) is Needs-Nate | | |


### v1 Section 1 — Architecture (complete, old plan A1-A4)
| Item | Status | Notes |
|------|--------|-------|
| A1 — Content-model data layer | ✅ done [full] — typed `siteContent` registry in `lib/content.ts`; all 6 sections refactored; [SLOT] placeholders throughout; 3754173 |
| A2 — Scaffold missing sections | ✅ done [full] — 5 new data-driven sections (past-work, reviews, pricing, faq, about-founder), registry extended, nav updated to 10 entries; 0f561f0 |
| A3 — CONTENT.md spec + slot audit | ✅ done [light] — 118-slot CONTENT.md authored, 1:1 verified against registry, guides included; 9a62a62 |
| A4 — Legal pages + config scaffolding | ✅ done [light] — /privacy + /terms stub pages, footer links wired, sitemap updated, site.ts config confirmed; 0b082ee |

### v2 Section 1 — Restructure + copy (dev-team-auto, current run)
| Item | Status | Notes |
|------|--------|-------|
| B1 — Multi-page routing + thin home | ✅ done [full] — 4 new routed pages, thin home (hero+navCards+contact), nav page-links, sitemap updated, 4-card NavCards incl. About, fetch timeout fix; c8ebab4 |
| B2 — Registry rework: nav cards, two-founder about, pricing shape, /work holding state | ✅ done [full] — NavCardsContent, AboutContent (2-founder), HoldingState+ctaHref, 3-tier pricing; e6fc921 |
| B3 — Wire the drafted copy | ✅ done [light] — all [SLOT:] replaced with appendix copy, [INPUT:] slots for unknowns, zero SLOT on rendered pages; 08f533e |
| B4 — CONTENT.md + trackers updated | ✅ done [light] — CONTENT.md rewritten 1:1 with registry (77 fields), flip instructions + [INPUT:] convention documented; e6642bc |

### v2 Section 3 — Voice + content pass (dev-team-auto)
| Item | Status | Notes |
|------|--------|-------|
| C1 — Voice + content pass | ✅ done [light] — zero em-dashes, zero buzzwords, ownership reframe, resolved slots filled (Standard/Advanced build, pricing, support model, meta), FK grade 4.4, B3 tests updated, build green; 419a05f |

### v2 Section 2 — Visual pass (layout-loop, cowork)
| Item | Status | Notes |
|------|--------|-------|
| V1 — `/` home visual pass | ✅ done — nav card accent circle arrow, hero padding tightened; baa9238 |
| V2 — `/services` visual pass | ✅ done — UseCases before HowItWorks, Sparkles on AI card; 70a87b5 |
| V3 — `/pricing` visual pass | ✅ done — AI consulting card differentiated, feature checkmarks; 97e4af0 |
| V4 — `/about` visual pass | ✅ done — name text-xl, role accent, credential dot bullets, whyBcns centered; 965a5ab |
| V5 — `/work` visual pass | ✅ done — both holding states promoted to bordered panels with icons; 953a7ab |

### v3 — Layout-loop full run, "Bold, executed with precision" (layout-loop, 2026-07-20)
| Item | Status | Notes |
|------|--------|-------|
| Phase 0 — Shared foundation | ✅ done — Fraunces serif-accent font wired globally, `components/reveal.tsx` (single IntersectionObserver + reduced-motion no-op), `drift`/`shimmer` keyframes in the Tailwind preset, shared hover-lift/glow utilities, `SectionHeading` opt-in serif accent; 6d0ab30, 6acd891, 3e91ade |
| `/` home loop | ✅ done — serif-accent headline word, staggered pop reveals, drifting signature motif, amplified nav-card hovers; 5dce555 |
| `/services` loop | ✅ done — THE PROCESS rebuilt as a node-badge flow with a scroll-fill connector; use-case cards pop-reveal + hover-lift; f6614e0 |
| `/pricing` loop | ✅ done — FAQ flat grid → animated accordion; featured Advanced tier (accent ring + elevated surface); 18416ff |
| `/about` loop | ✅ done — founder cards pop-reveal + hover-lift; whyBcns reframed as a pull-quote (large serif mark + accent border); 2a14fb0 |
| `/work` loop | ✅ done — holding panels given character: drifting motif + shimmer sweep on Past Work, 3 shimmer testimonial skeletons for Reviews, glow-pulse CTAs; a8ea3dd |
| Phase F — Finalize | ✅ done — throwaway `/style-lab` route deleted (motif kept, in real use); `LAYOUT_LOOP_REPORT.md` written with per-page baseline/final; f0304f7, 9f49db8 |

### v4 — Template purpose split (2026-07-21)
| Item | Status | Notes |
|------|--------|-------|
| app-core 0.2.0 absorbs shared client logic | ✅ done — health probe, webhook pipeline, storage interface, and AI opt-in gate moved out of the template into the package so fixes propagate by version bump; stale in-repo `templates/hosted-web/` copy deleted (`bcns-app-template` is canonical); 79221e1, merged PR #12 (453ee53) |

### Part III — DeLuca's pizza app (dev-team-auto)
| Item | Status | Notes |
|------|--------|-------|
| P1 — App scaffold: Electron + renderer/shell split | ✅ done [full] — Electron 29 + React+TS renderer, typed IPC bridge, mock bridge, import-boundary test, sandbox:true; dac99cc |
| P2 — Data model + P&L core | ✅ done [full] — SQLite schema (WAL mode), typed migrations, pure P&L module, recurring materializer (transactional), IPC boundary hardened (2 Critical + 4 Important fixed); 15ab594 |
| P3 — Ingestion framework + manual + drag-and-drop sources | ✅ done [full] — IngestionSource interface, runner (dedup+run report), manual/recurring/dragdrop sources, LLM module (mock bypass, 30s timeout, module-scope client), path containment, date validation; 70c2532 |
| P4 — Email (IMAP) ingestion source | ✅ done [full] — imapflow (CJS, DI-mockable), 50-msg batch cap, 20MB attachment cap, vendor→category mapping, review queue (in-memory), startup-after-window, NaN port guard; a617a07 |
| P5 — Dashboard (the product) | ✅ done [full] — two-tab dashboard (headline/chart/categories/strip/banners + add&fix tab), TransactionList edit/delete, MonthNav, RentRuleEditor, custom SVG chart; updateRecurringRule hardened; ed05659 |
| P6 — Settings, backup, first-run | ✅ done [full] — Settings screen (IMAP/Anthropic/backup/vendor map), backup module (daily trigger, quit trigger, 30-file rotation, safe rotation order), EmptyState first-run, electron-builder (Mac DMG + Win NSIS unsigned, asarUnpack .node); d0c88c3 |
| E2E validation checkpoint | ✅ done — pipeline validated against real credentials (Gmail IMAP + Anthropic key); ~15 bugs found and fixed on branch `delucas-e2e`; model updated to `claude-haiku-4-5`; PDF render fixed 4 ways (pdfjs legacy build, Path2D/DOMMatrix globals, filesystem font factory, process.getBuiltinModule polyfill); Settings Anthropic key now passed to SDK; 133 tests passing |
| S1 — Revenue toggle on drag-drop confirm card | ⬜ not started |
| Packaging (Section 3) | ⬜ not started — needs `electron-builder install-app-deps`, asar/pdfjs font path verification in packaged build |
| Slice integration research | ✅ done — Slice API is a fintech partner API (not a merchant sales API); no confirmed automated email summaries; integration plan written in PLAN.md §3b; path determined at handoff |
| Handoff (Section 5) | ⬜ not started — blocked on client laptop OS, Slice login, labor-app name |

Legend: ⬜ Not started · 🟡 In progress · ✅ Done · ⛔ Blocked

---

## How to update this file (agent instructions)
1. When you start an item, set **Current position → Next** to it and mark its row 🟡.
2. When you finish, flip the item's `status:` in `PLAN.md` and its row here to `✅ done [track] — [one-line summary + commit hash]`, then append a dated log entry below with what changed and any follow-ups discovered (add follow-ups to `PLAN.md` too).
3. When every Section 1 item is done, advance the pointer to the STOP-HERE marker; Section 2 (layout-loop) is launched separately in cowork.
4. Record decisions made mid-build (registry shape, section naming, etc.) both here (log) and in the relevant `PLAN.md` section.
5. Note blockers in **Blockers** immediately; don't silently stall. A blocked item does not stop the run.

---

## Log (newest first)

- **2026-07-27** — 📋 **PLAN.md replaced: past-work case study system.** The prior `PLAN.md` was the finished layout-loop plan (every page `status: done`, outcome captured in `LAYOUT_LOOP_REPORT.md`); its results are now recorded in the v3 milestone table above, and the file was replaced with a fresh dev-team plan rather than left in place — a fully-`done` plan gets re-picked-up by the next `/dev-team-auto` run. New plan: make Past Work cards clickable through to `/work/[slug]` detail pages, and illustrate them with screenshots captured from locally-hosted client apps running **clean seeded demo data** (never real customer records). Decisions taken in the planning session: agents capture all screenshots including DeLuca's Electron shell (Nate's call, over the flagged headless-reliability risk); all narrative copy ships as `[INPUT: …]` placeholders so no client outcome is fabricated on a live marketing site; client permission is a hard gate below the stop marker. Screenshot scope fixed at DeLuca's main dashboard (1) and L2 Detailz public frontend + admin calendar (2). No code written yet.

- **2026-07-21** — ✅ **Template purpose split (branch work, PR #12).** Split responsibilities cleanly: **packages = all shared logic**, **template = pure runnable skeleton**. `@nseluga/app-core` 0.2.0 absorbed the health probe, webhook pipeline, storage interface, and AI opt-in gate that had been living in the template, so a fix now propagates to every client repo with a version bump instead of a copy-paste. The stale in-repo `templates/hosted-web/` copy was deleted — the standalone `bcns-app-template` Template Repository is canonical, and the new `/new-client-repo` skill creates + stamps + verifies client repos from it. Commits 79221e1, merged as 453ee53.

  **Note — unpushed local commit:** `7b4d678` ("infra: droplet provisioning as code — bootstrap, onboard, systemd unit, nightly backups") exists on the local `main` only and is not in `origin/main`. It needs review and a push, or it will be lost on the next clean checkout.

- **2026-07-20** — ✅ **Marketing site layout-loop full run complete — "Bold, executed with precision."** Ran the full `/layout-loop` on `apps/web` across all five pages and merged to `main`. Shared foundation first (Phase 0): Fraunces serif-italic accent font wired globally as `--font-serif-accent`, `components/reveal.tsx` as the single IntersectionObserver powering every scroll reveal (with a `prefers-reduced-motion` no-op path), `drift`/`shimmer` keyframes added to the Tailwind preset, hover-lift/glow standardized as shared utilities, and `SectionHeading` extended with an opt-in serif accent segment. Then one loop per page: home (accent headline word, staggered reveals, drifting motif), services (THE PROCESS rebuilt as a connected node-badge flow with a scroll-fill connector), pricing (FAQ → animated accordion, featured Advanced tier), about (founder card reveals, whyBcns as a pull-quote), work (holding panels given a drifting motif + shimmer sweep so they read as intentional rather than empty). Phase F deleted the throwaway `/style-lab` route and wrote `LAYOUT_LOOP_REPORT.md`. **All presentation-only** — no copy, data, props, logic, or routing changed. Two open review flags carried in the report: mobile and reduced-motion spot-checks. Commits 6d0ab30 → 9f49db8.

- **2026-07-20** — ✅ **GitHub plumbing complete + DeLuca's extracted (interactive session).** Got the platform onto GitHub under the personal account `nseluga` (no org) and split client apps into their own repos.

  **Platform repo.** Merged the model-migration branch to `main` (PR #6). Network blocks SSH (port 22) → all git over HTTPS via the `gh` credential helper.

  **Shared packages → GitHub Packages.** Wired `@nseluga/*` for private publishing (removed `private`, `version 0.1.0`, `publishConfig` → `npm.pkg.github.com`, ship raw TS via `files:[src]` + `transpilePackages`) (PR #7). Hit the GitHub Packages rule that **scope must match the owner** — `@bcns` fails on a personal account — so renamed `@bcns/*` → `@nseluga/*` repo-wide (PR #8, temporary; migrate to a `bcns` org later). Published `@nseluga/{app-core,ui,config}@0.1.0` (private). Installs need a **classic PAT** with `read:packages` — the `gh` OAuth token can publish but 403s on downloads; verified a fresh authed read works with a classic PAT.

  **Template repo.** Extracted `templates/hosted-web/` → standalone private **`bcns-app-template`**, marked a GitHub *Template Repository*.

  **DeLuca's extracted.** Moved `apps/delucas` out to its own repo **`bcns-client-delucas`** with full history (`git subtree split`); repointed `@nseluga/*` to `^0.1.0`, added `.npmrc` + `.gitignore`, fixed Vite/electron-vite aliases to consume the installed package. Removed it from this monorepo (PR #9); `apps/web` still builds green (13 pages). Fixed two pre-existing DeLuca's bugs there: recurring-rule `start_date` edits weren't persisting (dropped across the update path), and the dashboard didn't reflect rule changes across tabs (shared refresh); plus editing a rule now rewrites the current month + future materialized transactions while preserving past months. All verified (typecheck + full test suite + Electron build).

  **Other:** local git guardrails hook (force-push/destructive-op block) as a stand-in for branch protection (unavailable on free private repos); `SETUP.md` records the repo topology, `bcns-client-<slug>` naming, and the temporary-scope → org migration.

- **2026-07-17** — ✅ **E2E validation complete; Slice integration researched; PLAN.md updated.**

  **E2E validation (branch `delucas-e2e`, ~15 commits).** The full ingestion pipeline was validated
  end-to-end against real credentials for the first time. Gmail IMAP connected, PDFs extracted, LLM
  parsed invoices, review queue staged low-confidence items, vendor→category mapping applied, backup
  triggered on quit, and a "needs review" notification appeared on the Dashboard. All bugs found had
  been masked by the 133 mock-only tests. Major fixes:

  - **Model string** (`claude-3-5-sonnet-latest` → `claude-haiku-4-5`): prior string pointed to a
    retired model line (Claude 3.5 Sonnet retired 2025-10-28), returning 404.
  - **Anthropic key not passed to SDK**: Settings key was never forwarded to the `Anthropic` client
    constructor — all real API calls silently fell through to a missing env var.
  - **PDF rendering broken in Electron in 4 ways**: (1) pdfjs needed its legacy build (not the ESM
    build); (2) `Path2D` and `DOMMatrix` globals required `@napi-rs/canvas`; (3) a custom
    `FilesystemStandardFontDataFactory` needed to bypass asar-packaged font loading; (4) a
    `process.getBuiltinModule` polyfill was required for pdfjs's Node compatibility shim.
  - Additional fixes: Markdown code fence stripping before JSON parse, recurring rule appearing
    without restart, non-invoice flagging in confirm card, orphaned CheckNowButton, IMAP socket
    errors made non-fatal, review-queue save now refreshes the dashboard.

  **Highest packaging risk (unverified):** The pdfjs `standard_fonts` directory is resolved via
  `createRequire` from the pdfjs-dist package path. Inside a packaged/asar build, this path may
  point inside the archive where `FilesystemStandardFontDataFactory` cannot read it. This MUST be
  verified before handoff by installing from the DMG artifact and testing PDF drag-drop with a
  font-embedded document. Full packaging plan in PLAN.md §3 (Section 3 — Packaging).

  **Slice research findings.** Slice's public API (`get-slice.com/docs/api-overview`) is a fintech
  partner API — seven endpoints for quote/payment/settlement workflows. It is not a merchant sales
  data API; individual pizzeria owners cannot call it to get their revenue. No confirmed automated
  email summaries from Slice to owners; reporting lives in the Owner's App only. Three integration
  paths documented in PLAN.md §3b: email pipeline (check client inbox at handoff), PDF statement
  drag-drop override, or continued manual entry. Labor integration remains blocked pending the
  client's software name (PLAN.md §3c).

  **PLAN.md additions:** Section 3 (Packaging), Section 3b (Slice integration), Section 3c (labor
  integration stub), Section 4 (RC checklist, replaces old §3), Section 5 (Handoff, replaces old §4).

- **2026-07-15** — ✅ **DeLuca's pizza app visual pass done** on branch `visual/delucas-pizza-warmth`. 6 commits. Pizza-shop warmth brand applied across all renderer files (presentation only — no logic, schema, or IPC touched). Full change log:

  **Pass 1 — Brand palette via CSS variables** (`index.css`): Off-white/cream background (hsl 34 22% 92%), tomato-red primary accent (hsl 10 72% 38%), warm stone borders, near-black with warm undertone foreground. Eliminates the clinical white / generic anti-pattern (craft P7). Active tab underline and "DeLuca's" wordmark pick up the tomato-red.

  **Pass 2 — Headline numbers + wordmark** (`HeadlineNumbers.tsx`, `App.tsx`): Labels changed to plain English — "Money in" (was "Revenue"), "Spent" (was "Expenses"), "Profit" (unchanged). Profit card is dominant (`text-5xl font-extrabold`) vs. the other two (`text-4xl font-bold`) — creates hierarchy per P1. Cards get `rounded-xl bg-card border shadow-sm` for figure/ground lift. "DeLuca's" wordmark set to `text-primary` (tomato-red) with `bg-card` header band.

  **Pass 3 — Empty state + section card surfaces** (`EmptyState.tsx`, `ProfitBarChart.tsx`, `CategoryBars.tsx`): EmptyState now: larger pizza emoji focal point, bold "Nothing here yet" heading, friendly body copy, tomato-red "ADD & FIX →" directional cue. All section cards unified to `rounded-xl bg-card border shadow-sm`. Chart/expense placeholders updated to descriptive plain text.

  **Pass 4 — Card/background contrast + MonthNav** (`index.css`, `MonthNav.tsx`): Background darkened to medium cream so white cards float clearly off it (figure/ground per craft token). MonthNav buttons get `bg-card border shadow-sm rounded-lg` — feel like real controls. Month label bolded to `font-bold text-lg`.

  **Pass 5 — Add & fix tab section panels** (`AddFix.tsx`, `TransactionList.tsx`): SectionCard wrapper applied to "Enter manually" and "Import from PDF" sections. TransactionList empty/data states updated to `rounded-xl bg-card shadow-sm`. Section headings use `tracking-widest font-semibold` pattern. Vertical gap tightened to `space-y-5` to match Dashboard rhythm.

  **Pass 6 — Banners, recurring rules, review queue** (`BannerList.tsx`, `RentRuleEditor.tsx`, `ReviewQueue.tsx`): BannerList rewritten with `red-50/red-200` warm styling, SVG warning icon, × dismiss button (more prominent than prior text link). Section headings and "+ Add rule" button weight/hover behavior unified. Rule rows get `rounded-xl bg-card shadow-sm` surface treatment.

  **Stopping condition:** Diminishing returns — all rubric rows satisfied for the empty/first-run state (the only state visible in browser dev mode). Flagged decision: could not verify headline number size in live data state (mock bridge returns zeros; north-star "read number in 3 seconds" was met structurally — `text-5xl font-extrabold` tabular-nums for Profit). Flag for Nate to check in Electron with real data.

  **Branch:** `visual/delucas-pizza-warmth` — **do not merge without Nate's sign-off**.

- **2026-07-15** — ✅ **bcns website visual pass (second pass) done** on branch `visual-pass/bcns-nate-personal`. 5 commits. Pages improved:
  - `/` — nav cards: replaced arrow-circle CTA with visible "Explore →" text link in brand blue; added top-border accent that animates to primary on hover; reduced section top padding so cards are visible in first viewport.
  - `/services` — AI consulting card gets faint primary border + bg tint (peer but distinct); card grid mt reduced from mt-14 to mt-10 (tighter heading→cards gap).
  - `/pricing` — AI consulting card gains "DAY RATE" badge label (sparkles icon + uppercase text in primary blue) + elevated secondary/60 surface. Clearly reads as a different engagement model, not a third tier.
  - `/about` — founder names enlarged to text-2xl/bold; roles set to uppercase tracking-wider in primary blue; left accent stripe + consistent left padding added. Builder-first hierarchy is now visually enforced.
  - `/work` — holding-state icon enlarged to size-16/rounded-2xl with glow border; title to text-2xl/bold; ambient radial glow added from icon center (brand atmosphere); section bottom padding tightened to eliminate dead void. Looks intentional and confident.
  - Mobile breakpoint check attempted — Claude-in-Chrome cannot emulate mobile viewport (extension limitation). Layout uses Tailwind sm/lg responsive classes throughout which were already implemented correctly.
  - Flagged decision: about page has equal-weight founder cards (no P1-dominant element). Decided this is correct — elevating one founder over the other would be wrong. Equal weight is the right design choice for a two-founder card grid.

- **2026-07-15** — ✅ **P6 settings/backup/first-run done** (full track, 1 build attempt + review/fix pass). Built Settings tab (IMAP/Anthropic key/backup folder/vendor mapping editor), backup module (daily trigger comparing ISO date strings, quit backup via before-quit, 30-file rotation, safe sequential rotation after copy), EmptyState first-run screen, electron-builder config (Mac DMG unsigned + Windows NSIS, asarUnpack .node). Mac DMG artifact produced at release/. Review found 1 Critical (settings:set no allowlist) + 2 Important (rotation ran before copy succeeded, triggerNow stale status). All fixed. 133 tests. Commit: d0c88c3. STOP HERE marker reached.

- **2026-07-15** — ✅ **P5 dashboard done** (full track, 1 build attempt + review/fix pass). Built two-tab dashboard: Dashboard tab (HeadlineNumbers, ProfitBarChart custom SVG, CategoryBars, IngestionStrip, BannerList dismissible-but-returns) + Add & Fix tab (ManualEntryForm, DragDropZone, ReviewQueue, TransactionList inline edit/delete, RentRuleEditor). MonthNav prev/next. 6 new IPC channels. Review found 0 Critical / 3 Important (updateRecurringRule SQL injection via raw keys, getTransactionsForMonth inconsistent return type, BannerList dep array) / 2 Minor. All fixed. 113 tests. Commit: ed05659.

- **2026-07-15** — ✅ **P4 IMAP ingestion done** (full track, 1 build attempt + review/fix pass). Built imapflow-based EmailSource with DI mock factory, 50-message batch cap, 20MB attachment byte cap, startup-after-window, vendor→category mapping, in-memory review queue. Review found 2 Critical + 3 Important. All fixed. 91 tests. Commit: a617a07.

- **2026-07-15** — ✅ **P3 ingestion framework done** (full track, 1 build attempt + review/fix pass). Built IngestionSource interface, runner (dedup by source_ref, per-run report), manual/recurring/dragdrop sources, LLM extraction module (Anthropic SDK, mock bypass, 30s timeout, module-scope client), PDF→image via pdfjs-dist+@napi-rs/canvas. Review found 2 Critical (LLM timeout, file path containment) + 4 Important (date validation, PDF memory leak). All fixed. 68 tests passing. Commit: 70c2532.

- **2026-07-15** — ✅ **P2 data model + P&L core done** (full track, 1 build attempt + review/fix pass). Built SQLite schema (5 tables, WAL mode), idempotent migration runner, typed query functions, pure-function P&L module (bucketing/compute/12-month series/summary sentences), idempotent recurring materializer. Review found 2 Critical (IPC input validation missing on db:query and insertTransaction) + 4 Important (unbounded query, non-atomic materializer, settings coercion, month format injection). All fixed. 43 tests passing. Commit: 15ab594.

- **2026-07-15** — ✅ **P1 app scaffold done** (full track, 1 build attempt + 1 fix pass). Created `apps/delucas/` Electron 29 + React+TS renderer app: typed IPC bridge, mock bridge for browser dev, preload contextBridge, Vite config (port 3001), electron-vite config, import-boundary test. Review found 2 Important issues (sandbox:false, boundary scan missed bridge/ dir) + 3 Minor — fix agent resolved all. Build green across all 4 packages. Commit: dac99cc. Branch: feat/delucas-p1-scaffold.

- **2026-07-15** — ✅ **C1 voice + content pass done** (light track, 2 attempts). Rewrote `apps/web/lib/content.ts` per the copy brief: zero em-dashes, zero buzzwords, ownership reframe ("Use it forever, free"), all pricing/turnaround/support/meta slots filled with resolved values (Standard build $2,000–$5,000, Advanced build $5,000–$15,000, AI consulting $800/day, 30-day tweaks + 1-year bug-fix support model). About section: builder-first bios, no fabricated portfolio, honest founding story in whyBcns. Reviews holding state updated to "No reviews yet. That changes with our first client." FK grade 4.4 (well under 8.0 threshold). B3 spot-check tests updated and passing. CONTENT.md mirrors registry 1:1. Build green. Commit: 419a05f.

- **2026-07-14** — 🔄 **v2 plan started** on branch `experimental-v2`. PLAN.md updated to v2 — multi-page site with real drafted copy. Items A1-A4 (v1 architecture) remain done on prior branch `worktree-experimental-overnight-first-draft`. v2 plan B1-B4 starts fresh from the current single-page-app state on `experimental-v2`. Base: all components + registry + legal pages from A1-A4 work are merged in.

- **2026-07-13** — 📋 **PLAN.md + PROGRESS.md created** via a `/grilling` session on branch `worktree-experimental-overnight-first-draft`. Resolved: company name `bcns` final; `bcns.com` taken (domain/email stay placeholders, Needs-Nate); goal is a reusable/scalable **template** (structure + on-brand visuals, content as labeled `[X GOES HERE]` slots, not finished copy); full IA fixed at 11 sections (added Past work, Reviews, Pricing, FAQ, About/founder; Process folded into How-it-works). Run structured in two sections split by the STOP-HERE marker: Section 1 = `dev-team-auto` architecture-only (structure/data/slots, no styling, `dt-engineer` not `dt-ui`); Section 2 = `layout-loop` full visual first draft in cowork. Content spec lives both in a data registry and a mirrored `CONTENT.md`. Rest of the repo (`templates/`, product-building) explicitly out of scope. No code written yet — awaiting the orchestrated run (prompt pasted into a cowork session).
