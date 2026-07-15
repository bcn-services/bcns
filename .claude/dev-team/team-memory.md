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
