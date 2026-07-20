# Dev-team memory log

## 2026-07-15 — dev-team-auto — P6 Settings, backup, first-run
- **Outcome:** DONE — 1 build attempt + review/fix pass (full track, branch feat/delucas-p1-scaffold, commit d0c88c3)
- **What happened:** Engineer built Settings tab, backup module, EmptyState, electron-builder config (Mac DMG produced). QA PASS 133/133. Review found 1 Critical (settings:set no key allowlist) + 2 Important (rotation before copy succeeded, triggerNow stale status). Fix agent resolved all in one pass.
- **What worked:** `asarUnpack: ["**/*.node"]` is the correct electron-builder config for native addons like better-sqlite3. Safe rotation order (rotate AFTER copy succeeds, never before) is the right pattern for any backup rotation logic.
- **What failed:** settings:set lacked an allowlist — same input-validation gap pattern as every prior IPC handler. LESSON: every IPC handler that accepts a key/value pair needs an explicit ALLOWED_KEYS set. Engineer should build this in from the start, not wait for review.
- **Remember next run:** P1–P6 ALL DONE. STOP HERE marker reached. Next steps: (1) layout-loop visual pass for bcns website on overnight-combined; (2) layout-loop DeLuca's visual pass on a separate cowork branch; (3) Needs-Nate Section 3–4 items (client laptop handoff). better-sqlite3 needs electron-rebuild for the Electron ABI before packaging — done automatically by electron-builder during `pnpm package` but unit tests need system Node rebuild afterward.

## 2026-07-15 — dev-team-auto — P5 Dashboard (the product)
- **Outcome:** DONE — 1 build attempt + review/fix pass (full track, branch feat/delucas-p1-scaffold, commit ed05659)
- **What happened:** Engineer built full dashboard: two-tab shell (Dashboard | Add & fix), HeadlineNumbers, ProfitBarChart (custom SVG), CategoryBars, BannerList, TransactionList (inline edit/delete), MonthNav, RentRuleEditor. QA PASS 23/23. Review found 0 Critical / 3 Important (updateRecurringRule SQL injection gap via raw keys, getTransactionsForMonth {ok,error} inconsistency, BannerList dep array) / 2 Minor. Fix pass running.
- **What worked:** Pure-function P&L hooks testable without browser — all 23 behavioral checks ran as Node.js unit tests. Custom SVG chart avoids recharts dependency.
- **What failed:** Engineer left one IPC handler (updateRecurringRule) without field allowlist — same recurring IPC injection gap pattern as P2/P3/P4. Pattern: every new IPC handler that accepts `updates: Record<string, unknown>` needs an explicit allowlist before queries.ts.
- **Remember next run:** P6 (settings/backup/first-run) needs to: (1) add Settings page reading/writing settings table (already has IPC handlers from P2); (2) backup module in src/shell-electron/backup.ts — copies SQLite file, rotates to 30, fires on quit via app.on('before-quit') and once per day on open; (3) electron-builder config for Mac dmg + Windows NSIS (unsigned); (4) first-run empty state — Dashboard shows "no data yet" when all P&L values are 0.

## 2026-07-15 — dev-team-auto — P4 Email (IMAP) ingestion source
- **Outcome:** DONE — 1 build attempt + review/fix pass (full track, branch feat/delucas-p1-scaffold, commit a617a07)
- **What happened:** Engineer built EmailSource using imapflow with DI mock factory. QA PASS. Review found 2 Critical (no attachment byte cap → OOM, unbounded fetchAll → UI freeze on full mailbox) + 3 Important (NaN port, startup IMAP before window open, missing in-memory state docs). Fix agent resolved all.
- **What worked:** DI factory pattern (`imapFactory` param) cleanly separates real imapflow from test fixtures. 50-message batch cap + 20MB attachment cap are the right safety envelope for a pizza business inbox.
- **What failed:** Engineer omitted OOM protection on attachment downloads and didn't cap the fetchAll range. The startup-before-window ordering bug is easy to miss when code is sequential.
- **Remember next run:** imapflow IS CJS (not ESM — team memory was wrong). `require('imapflow')` works directly, no dynamic import needed. P5 IPC channels for ingestion/email-status all wired and working.

## 2026-07-15 — dev-team-auto — P3 Ingestion framework + manual + drag-and-drop sources
- **Outcome:** DONE — 1 build attempt + review/fix pass (full track, branch feat/delucas-p1-scaffold, commit 70c2532)
- **What happened:** Engineer built full ingestion stack: IngestionSource interface, runner, 3 sources, LLM module, PDF pipeline, renderer components, 5 IPC channels, 62 initial tests. QA exported validateLLMResult and added 6 malformed-response tests (68 total). Review found 2 Critical + 4 Important. Fix agent resolved all in one pass.
- **What worked:** LLM `mock?` parameter pattern is clean and QA-safe. pdfjs-dist + @napi-rs/canvas works without build toolchain (pre-built ARM64 binaries). Home-dir path containment (`startsWith(app.getPath("home") + sep)`) is the right file access policy for Electron apps.
- **What failed:** Engineer omitted LLM timeout, PDF document cleanup, and date format validation on IPC boundary. Same recurring IPC validation gap.
- **Remember next run:** P4 (IMAP) uses imapflow CJS. The `processed_emails` table is already in schema. LLM module from P3 is already wired; P4 feeds emails through the same pipeline.

## 2026-07-15 — dev-team-auto — P2 Data model + P&L core
- **Outcome:** DONE — 1 build attempt + review/fix pass (full track, branch feat/delucas-p1-scaffold, commit 15ab594)
- **What happened:** Engineer built SQLite schema (5 tables, WAL mode), idempotent migration runner, pure-function P&L module, recurring materializer. 43 tests passed QA. Review found 2 Critical + 4 Important IPC boundary issues. Fix agent resolved all in one pass.
- **What worked:** Pure-function P&L in src/shared/pnl.ts is fully headlessly testable. Date-as-string YYYY-MM-DD + string slice for month bucketing is TZ-safe. day_of_month constrained to 1–28 to handle Feb.
- **What failed:** Engineer missed IPC input validation on all handlers — renderer-supplied data reached SQLite unchecked. Systematic pattern: Electron IPC handlers must validate all inputs.
- **Remember next run:** P3 needs LLM module in src/shell-electron/. IPC bridge already has dialog:openFile for drag-and-drop. db:insertTransaction validates and returns {ok, error} — ingestion runner should check ok.

## 2026-07-15 — dev-team-auto — P1 App scaffold: Electron + renderer/shell split
- **Outcome:** DONE — 1 build attempt + review/fix pass (full track, branch feat/delucas-p1-scaffold, commit dac99cc)
- **What happened:** Engineer created apps/delucas/ from scratch: Electron 29, React+TS renderer (port 3001), typed IPC bridge, mockBridge, preload contextBridge, electron-vite config, import-boundary test. QA PASS on first build. Review found 2 Important + 3 Minor. Fix agent resolved all in one pass.
- **What worked:** analyze agent correctly flagged Electron 29 (node 20) requirement. Import-boundary test as pure Node ESM static-analysis script (no test framework) was fast and CI-safe.
- **What failed:** Engineer left sandbox:false in webPreferences (review caught it). Import boundary scan covered only src/renderer/ — missed src/bridge/ (review caught it).
- **Remember next run:** apps/delucas/ on branch feat/delucas-p1-scaffold. better-sqlite3 and imapflow are NOT installed yet — P2 adds better-sqlite3, P4 adds imapflow. IPC bridge in src/bridge/BridgeInterface.ts already defines db, ingestion, dialog, settings stubs.

## 2026-07-15 — dev-team-auto — C1 Voice + content pass
- **Outcome:** DONE — 2 attempts (light track, branch worktree-agent-afb098493a86a56c1, commit 419a05f)
- **What happened:** Rewrote content.ts for voice/copy pass. Engineer missed the second `$` inside en-dash price ranges ("$2,000–5,000" instead of "$2,000–$5,000"). QA caught it on first pass. Bug Fixer patched in one step. QA re-gate PASS. FK readability grade 4.4 (threshold 8.0). Readability check script committed at apps/web/scripts/readability-check.py.
- **What worked:** Light track correct — copy-only change, single file. QA grep for exact price strings (using Python to avoid shell en-dash encoding issues) reliably caught the format bug.
- **What failed:** Engineer forgot the second dollar sign inside the en-dash range on both build tiers. grep on the orchestrator side silently failed to match due to en-dash encoding; QA used Python to catch it correctly.
- **Remember next run:** En-dash (`–`) encoding in shell grep can silently mismatch — use Python or `python3 -c "import subprocess; ..."` for exact-string checks involving Unicode range characters. The readability script is now at apps/web/scripts/readability-check.py for future copy passes.

## 2026-07-14 — dev-team-auto — B4 CONTENT.md + trackers updated
- **Outcome:** DONE — 1 attempt (light track, branch feat/b1-multi-page-routing, commit e6642bc)
- **What happened:** Rewrote CONTENT.md 1:1 with new registry (77 fields). QA PASS first attempt, 49 assertions.
- **What worked:** Cross-check count (77 fields ↔ 77 CONTENT.md entries) is a reliable completeness signal.
- **What failed:** nothing notable.
- **Remember next run:** Section 1 complete. layout-loop runs Section 2 (per-page visual passes). The worktree branch `feat/b1-multi-page-routing` is now merged into `experimental-v2`.

## 2026-07-14 — dev-team-auto — B3 Wire the drafted copy
- **Outcome:** DONE — 1 attempt (light track, branch feat/b1-multi-page-routing, commit 08f533e)
- **What happened:** Replaced all [SLOT:] values in content.ts with verbatim appendix copy. Engineer also stubbed problem-solution.tsx and delivery-models.tsx to return null (they imported removed registry fields). QA PASS on first attempt, 88 assertions.
- **What worked:** Light track with static analysis QA (read content.ts + build output) — no server needed.
- **What failed:** nothing notable.
- **Remember next run:** problem-solution.tsx and delivery-models.tsx now return null — kept in repo but inert. pageMeta fields are still [INPUT:] slots (no appendix entries). ctaHref fields in holding state wired to `/#contact` — fine for now.

## 2026-07-14 — dev-team-auto — B2 Registry rework: nav cards, two-founder about, pricing shape, /work holding state
- **Outcome:** DONE — 1 attempt (full track, branch feat/b1-multi-page-routing, commit e6fc921)
- **What happened:** Reworked content.ts registry: added NavCardsContent (4-item), replaced aboutFounder with AboutContent (2-founder tuple + whyBcns), added HoldingState+ctaHref to pastWork/reviews, 3-tier pricing. Review caught 2 Important issues (fragile STRUCTURAL_KEYS exclusion in test, hardcoded href in holding-state CTAs). Fix agent resolved both. Re-QA PASS.
- **What worked:** Keeping engineer export name unchanged (`AboutFounder`) prevented B1 test regressions. Path-suffix exclusion pattern (`path.endsWith('.href')`) is the right fix for structural URL fields in SLOT validators.
- **What failed:** Engineer hardcoded `"/#contact"` in holding-state CTAs instead of putting it in the registry — review caught it.
- **Remember next run:** B3 wires the copy appendix verbatim into content.ts — expect zero [SLOT:] remaining after. The content-registry test (188 assertions) will catch any missed SLOT replacements. ctaHref slots in pastWork.holdingState and reviews.holdingState still need real URLs in B3 (they're `[SLOT:]` now).

## 2026-07-14 — dev-team-auto — B1 Multi-page routing + thin home
- **Outcome:** DONE — 1 attempt (full track, branch feat/b1-multi-page-routing, commit c8ebab4)
- **What happened:** Converted single-page app to 5-page site. Engineer created 4 new route pages + NavCards component, updated nav to page links, fixed href anchors. QA PASS on first attempt. Review found 2 Important issues (missing /about card in NavCards, no fetch timeout in contact-form). Fix agent resolved both. Re-QA PASS.
- **What worked:** dt-analyze map correctly identified all anchor-link breakage risks (logo #top, #contact, #examples) before the engineer touched them — all pre-empted. Full-track with analyze pays off on structural rewrites.
- **What failed:** Review caught that nav-cards had only 3 cards, missing /about — engineer didn't add it despite it being in the PLAN.md decisions. Always verify nav-cards match the full nav spec.
- **Remember next run:** NavCards must mirror all 4 siteConfig.nav routes. contact-form.tsx fetch never had a timeout — already fixed in c8ebab4. B2 reworks content.ts registry shape significantly; expect type errors across all components that read the current registry.

## 2026-07-19 — dev-team-auto — W1 Reshape pricing (setup + recurring + seats)
- **Outcome:** DONE — 1 build attempt + clean review + 1 Minor-fix pass (full track, flag:money, branch dev-team/model-migration-run, commit a05059f)
- **What happened:** Opus engineer extended PricingTier with optional setup?/monthly?/seats? free-string fields, kept required `price` for the $800/day consulting card + b3 test stability. pricing.tsx branches build-vs-consulting on `!setup` (not magic index). FAQ items[0].answer rewritten to setup+monthly+seats. QA PASS (new w1-pricing.test.mjs, 8 assertions + built-HTML check). Opus review: 0 Critical/Important, 3 Minor (2 applied).
- **What worked:** Built-HTML Python string check on `.next/server/app/pricing.html` is the right un-mocked behavioral gate for content changes. Keeping `price` field + tier names unchanged kept the passing b3-copy-wiring test green with zero assertion edits.
- **What failed:** nothing — clean first build. (Reviewer flagged magic `index===2` render branch; fixed to `!setup`.)
- **Remember next run:** IMPORTANT REPO-STATE FACT — the migration PLAN.md/PROGRESS.md were UNCOMMITTED in the sibling `.claude/worktrees/model-migration` worktree; the committed `worktree-model-migration` branch @ 40cfb15 still had the OLD delucas ledger. This session copied the migration PLAN/PROGRESS into the session branch and committed them. Turbo root `pnpm lint`/`typecheck` are BROKEN ("cannot find binary path") — run per-package from apps/web. Tests need `node --experimental-strip-types --test __tests__/*.mjs`. 4 stale tests (a2-fix, a2-new, b2, content-registry) fail pre-existing — don't chase them. content-registry.test.mjs still references removed problemSolution/deliveryModels sections.

## 2026-07-19 — dev-team-auto — W2 Honest hosted framing
- **Outcome:** DONE — 1 build + review + 1 fix pass (full track, branch dev-team/model-migration-run, commit 8f96916)
- **What happened:** Sonnet engineer reframed content.ts: hero proofPoints[1]→"We host it and keep it running", contact highlight→data-yours+export, howItWorks[2] "Build & handoff"→"Build & launch", founder bio "after handoff"→"after launch". Removed "Use it forever, free" + "whether we work together or not". QA PASS (w2-hosted-framing.test.mjs, behavioral built-HTML grep across 5 routes). Sonnet review: 1 Important (contact copy over-promised unbuilt self-serve export as present-tense guarantee) + 1 Minor. Fixer reworded to service/intent ("we'll export it and hand it over whenever you ask") and "handoff notes"→"project notes".
- **What worked:** Review's completeness grep (own/yours/forever/handoff/keep/runs) across the WHOLE registry caught the truthfulness risk — the right check for a truth-in-marketing correction. Distinguishing "one-time setup" (correct, matches W1) from "one-time handoff" (wrong) required reading each survivor in context, not blind replace.
- **What failed:** Engineer's first pass over-promised a feature that doesn't exist (self-serve export). LESSON below.
- **Remember next run:** site.ts OG/Twitter metadata contains em-dashes (pre-existing, out of W-scope) — don't flag content.ts em-dash checks against rendered HTML; check content.ts source only. b3-copy-wiring locks exact hero/contact/process strings — W2's changed strings happened not to be b3-locked, but always read b3 before editing copy.

## 2026-07-19 — dev-team-auto — W3 "How hosting works" explanation
- **Outcome:** DONE — 1 build attempt, QA PASS (light track, no review pass, branch dev-team/model-migration-run, commit acd3259)
- **What happened:** Sonnet engineer appended faq.items[4] (monthly-fee coverage: hosting/uptime/backups/security patches/bug fixes/tweaks + own-servers/any-device), [5] (BYO-Anthropic-key, AI optional, billed by Anthropic), [6] (stop-paying: hosting stops, data exported/handed over). Appended so indices 0–3 stayed stable → b3 green with no edits. QA PASS, w3-hosting-explanation.test.mjs.
- **What worked:** APPENDING new faq.items (not inserting) keeps b3's index-based assertions green — the right pattern for adding FAQ entries. Since /pricing renders <Faq/>, FAQ content satisfies "rendered on /pricing" criteria without a separate pricing block.
- **What failed:** nothing.
- **Remember next run:** W4 must mirror faq.items[4..6] Q/A into CONTENT.md (b4 substring-matches the Q strings). pricing.html contains 12 pre-existing em-dashes from the site.ts metadata tagline "bcns — Custom software..." in <head>/RSC flight data — NOT content copy; always scope em-dash checks to `content.ts` source or `git diff`, never the full rendered HTML.

## 2026-07-19 — dev-team-auto — W4 CONTENT.md mirror
- **Outcome:** DONE — 1 build attempt, QA PASS (light track, no review, branch dev-team/model-migration-run, commit 2e5cbde)
- **What happened:** Sonnet engineer mirrored all W1–W3 changes into CONTENT.md: setup/monthly/seats field docs, refreshed prices, 7 FAQ entries (0–6), cross-check table 77→80. QA wrote a registry-key-path completeness diff (74 live leaf paths vs 81 CONTENT.md **Field:** entries) — clean both directions; apparent mismatches are notation/empty-array artifacts, not orphans. w4-content-mirror.test.mjs (20 subtests) passes.
- **What worked:** Enumerating live siteContent leaf paths via strip-types and diffing against CONTENT.md's **Field:** entries is a stronger completeness gate than the substring-based b4 test. Section 1 (W-series) fully done.
- **What failed:** nothing.
- **Remember next run:** CONTENT.md documents free-string copy fields "by purpose" not verbatim, so W2-style value rewrites needed no CONTENT.md value change — only NEW fields (setup/monthly/seats) and NEW faq entries required mirror edits. howItWorks.items[].step is documented only in the cross-check table (pre-existing), not a per-item **Field:** block — fine, b4 covers it. Section 2 (A1–A4) is next: A1 @bcns/app-core package (flag:money), A2 templates/hosted-web (flag:security), A3 ADR, A4 repo docs.

## 2026-07-19 — dev-team-auto — A1 @bcns/app-core package
- **Outcome:** DONE — 1 build + Opus review + 1 Opus fix pass (full track, flag:money, branch dev-team/model-migration-run, commit 99b0b94)
- **What happened:** flag:money → ran 2 parallel Opus design sketches; both converged on cents-as-integer source-of-truth. Picked design B (staged site-drift plan + correct model id claude-haiku-4-5). Opus engineer built packages/app-core (pricing/subscription/anthropic/index), 24 tests. QA added 20 edge tests (44 total). Opus review: 1 Important (PRICING not deep-frozen — runtime-mutable shared constant) + 2 Minor (formatUsd rounding, no NaN guard). Opus fixer deep-froze PRICING, made formatUsd render exact cents (149_99→$149.99) while keeping 149_00→$149, added finite guard. 54 tests green.
- **What worked:** New package = copy packages/ui shape exactly (source-only, exports ./src/index.ts, tsconfig +noEmit:true, eslint re-export). Tests via tsx (already in workspace) with explicit && chain in `test` script (bare glob mis-expands). DI seam (ByokDeps.ClientCtor) makes @anthropic-ai/sdk fully mockable with zero network. Design tournament caught the stale model-id (design A had claude-3-5-haiku; correct is claude-haiku-4-5).
- **What failed:** Engineer left PRICING compile-time-Readonly only (runtime mutable) — recurrence of the shared-constant-mutation class. Global learning added.
- **Remember next run:** A2 (templates/hosted-web) consumes @bcns/app-core. CRITICAL: templates/* is OUTSIDE the pnpm-workspace glob (apps/* + packages/* only) — `workspace:*` deps won't resolve in templates/hosted-web unless the glob is extended. The analyze-report flagged this as an A2 decision: keep it a clone-only starter (documented default) vs make it an installable member. app-core exports: PRICING, INCLUDED_SEATS, PER_SEAT_CENTS, formatUsd, monthlyCharge, setupFeeCents, decideAccess, decideFromEvent, StripeSubscriptionEvent, createAnthropicClient, MissingApiKeyError, DEFAULT_MODEL. Site pricing still hardcodes strings in content.ts (W1) — future follow-up to derive from formatUsd (not this run).

## 2026-07-19 — dev-team-auto — A2 templates/hosted-web scaffold
- **Outcome:** DONE — 1 build + Opus security review + 1 Opus fix pass (full track, flag:security, branch dev-team/model-migration-run, commit 3a11c62)
- **What happened:** Opus engineer scaffolded @bcns/hosted-web-template (Next.js App Router, TS strict), added `templates/*` to pnpm-workspace glob so workspace:* deps resolve. Opt-in AI via AI_ENABLED, Stripe webhook route→app-core decideFromEvent, .env.example placeholders, Dockerfile+DEPLOY.md. QA live-smoke (real dev server on :3100, all routes 200, webhook decisions correct). Opus security review: 1 Important — webhook FAILED OPEN even with STRIPE_WEBHOOK_SECRET set (processed unauthenticated input, returned misleading signatureVerified:true). Opus fixer made it fail-closed (501 when secret set; honest signatureVerified:false/mode:"unverified-dev" when unset). 19/19 tests.
- **What worked:** Live-smoke on the real server caught nothing extra here but is the right gate for a route item. The security review's trust-boundary lens ("would an unauthenticated POST reach the decision?") caught the auth-bypass that QA's happy-path tests passed. Template test runner must be `tsx --test` (added tsx devDep) — raw node ESM can't follow app-core's extensionless re-exports.
- **What failed:** (1) Engineer built the webhook stub fail-OPEN — a security anti-pattern in a clonable template. (2) PROCESS: first A2 QA agent died on an API error (FailedToOpenSocket) after 26 tool calls, leaving qa-report stale + an uncommitted engineer-report edit; also the A2 engineer-report was never committed with c348e04 and was lost on `git checkout` — had to reconstruct it. LESSON: agents must COMMIT their report file, not just write it to the working tree.
- **Remember next run:** templates/* is now IN the workspace glob (installable member). Webhook stub is fail-closed — real Stripe sig verification (stripe.webhooks.constructEvent) is Needs-Nate before prod. dt-* agents leave their *-report.md UNCOMMITTED (working-tree only) — orchestrator should commit them with the outcome, and never `git checkout` a report file expecting the latest agent's version to survive. A dev-server smoke agent must run the server in background with a bounded poll + always kill it.
