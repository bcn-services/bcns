# Dev-team memory log

## Standing notes

**Repo layout / commands**
- Packages are `@bcn-services/*` (web, ui, config, app-core, tenant, data-client), never `@nseluga/*` or `@bcns/*`. Workspace globs: `apps/*`, `packages/*`, `platform`. `templates/` is README-only and NOT a workspace member.
- Use bare `pnpm` from the root (pnpm 11 self-switches to the pinned 9.15.0); `corepack pnpm lint/typecheck/build/test` fail on pnpm 11 (turbo's child `pnpm` refuses under corepack). Root `pnpm lint` / `pnpm typecheck` work (verified 2026-10-06, 10/10 tasks).
- Root `pnpm test` = `turbo run test` (depends on `build`, `cache: false`) then `test:docs`, `test:infra`, `test:new-app`. Web alone: `pnpm --filter @bcn-services/web test` (no build) or `cd apps/web && pnpm test`. Test script is `node --experimental-strip-types --test __tests__/*.mjs` (flag REQUIRED: tests import `lib/content.ts` directly); the glob picks up new `.mjs` tests with no list edit. Node 22.14.
- Packages/apps with HARD-CODED test file lists (a new test file does nothing until listed): `packages/tenant`, `apps/connect`, `apps/sb`, `apps/_template`. `apps/mcp` = `tsc && node --test tests/*.test.mjs`.
- `packages/tenant/dist` (and `packages/data-client/dist`) must be built before `apps/connect` / `apps/sb` tests (21 connect tests fail without it); turbo `test` builds it. Run a nested vitest via `process.execPath` + `node_modules/vitest/vitest.mjs`, not bare `pnpm` (no corepack in the child).
- `rm -rf apps/web/.next` before web tests, or `b3-copy-wiring` / `past-work-card-links` fail on a stale `.next`. CI excludes web tests.
- `pnpm start` / `pnpm dev` in apps/web hardcode `-p 3000`: call `next start -p <free>` directly and kill by PID (`lsof -ti tcp:$PORT`); `pkill -f "next start"` misses the `next-server` process. A dt-* agent that starts a dev server backgrounds it with a bounded poll and always kills it.
- `~/bcns-client-delucas` (DeLuca's app) and `~/bcns-client-l2detailz` (L2 Detailz) are separate repos; nothing for them lands here.
- A branch touching `.github/workflows` must be pushed with `GITHUB_TOKEN= git push` (keyring token has the workflow scope). `sed -i` on macOS needs `''` (BSD).
- Docs under `apps/sb/**` or `apps/connect/**` trigger deploy-app (restarts hub/SB/MCP): put docs elsewhere when a restart is unwanted. Scope convention docs per app (web = Tailwind, sb/_template = plain CSS).

**Test suites**
- `apps/web`: 98 tests / 98 pass / 0 fail / 0 skip with a build; without a build 87 pass + 11 skip (loud `⚠️` + `# SKIP`) and 0 fail, the correct clean-tree result (verified 2026-10-06). `b2`/`b3` are script-style files with their own counters ("Results: N passed"); their assertions do NOT move node:test's TAP total.
- `b3-copy-wiring`, `w3-hosting-explanation`, `work-slug-page`, `past-work-*`, `case-study-screenshots` assert against `.next/server/app/*.html` and skip loudly when the build is absent.
- Built-HTML copy checks: strip tags first (`stripTags()` in `b3`; inline spans wrap accent words) and entity-decode (`&#x27;`/`&#39;`/`&quot;`/`&lt;`/`&gt;`, `&amp;` LAST) before comparing to registry strings. A built-HTML Python string check against `.next/server/app/*.html` is the right un-mocked gate for content changes.
- `[INPUT: ...]` tokens appear MID-string (`about.founders[1].bio`, `.credentials[0]`): scan by substring `/\[INPUT:[^\]]+\]/g`, never whole-string. Derive token allowlists and per-field assertions from `siteContent` / `Object.entries(...)` at runtime; never hand-list them.
- When weakening an assertion, mutation-test it (blank the guarded field, confirm red, restore). Mutate via `cp` backups and verify restores with `shasum -c`; NEVER `git checkout --` a file with uncommitted work.
- The registry has NO `problemSolution`, `deliveryModels`, `aboutFounder` (intentional; successor `siteContent.about` + `about.founders[]`). Never re-add them to make a test pass. Registry invariant: no string field ships empty.
- `reviews.items` is intentionally EMPTY (renders `holdingState`); `pastWork.items` holds `delucas` + `l2detailz`. Tests assert "non-empty items OR populated holdingState".
- `platform` vitest DB-backed files skip (with a printed message) when the local stack at `127.0.0.1:54322` is down; a green run without `supabase start` did not run them. On a machine too starved for the stack, platform-ci `test` on the PR is the database evidence (can flake on a Docker rate limit at "start local stack": `gh run rerun --failed`). vitest prints passing names in a failed job log, so a mutation is red only on a ` FAIL ` line naming the test.
- `apps/sb` suite is green (273 pass / 0 fail, 2026-10-06); needs tenant + data-client built; `DESIGN.md` copy is locked by qa-library tests.
- In `platform/test/worker.test.ts`, a fixture left `revoked` must have its client churned, or `health_one_row` fails. Keep decision logic pure (`decide()`) so most mutation checks run without a database. A mutation check that needs CI is handed to Nate as a patch file plus a wizard step, not pushed by an agent.
- Docs items: add an ACCURACY criterion to QA ("does the doc match what was actually built?"), run a fact-check against the real workflows/ports/sources, and sweep sibling surfaces for stale echoes. An ADR gets a committed string-presence check (`docs/architecture/__tests__/`, run by `test:docs`).

**Content conventions**
- `apps/web/lib/content.ts` is the single source of truth for copy; `apps/web/CONTENT.md` mirrors it 1:1 (`w4-content-mirror` covers pricing/FAQ, `b4-content-md` the rest; a new field needs its own gate). CONTENT.md's "Total registry fields: N" (122 on 2026-10-06) is re-derived by script from the cross-check table, never hand-incremented.
- APPEND new `faq.items` (never insert); `b3` asserts by index.
- Scope em-dash / copy greps to `content.ts` source or `git diff`, not rendered HTML. En-dash (`–`) in shell grep silently mismatches: use Python for exact-string checks with Unicode range chars. `apps/web/scripts/readability-check.py` exists for copy passes (FK grade).
- DeLuca's and L2 Detailz are real businesses: never invent their copy; fill only confirmed detail.
- Optional `PastWorkItem.link` is live data (renders as a sibling anchor below the card): do not remove it. The card's case-study `<Link>` wraps the Card; the external link stays OUT of it.
- Case-study images: `apps/web/lib/case-study-images.ts` is a map of STATIC `.png` imports keyed by registry `screenshots[].src` (a bad `src` then fails the build; `caseStudyImage()` throws on a miss). Adding a screenshot = registry entry + static import there; the reverse-drift test in `work-slug-page.test.mjs` gates both directions and also asserts the literal source string `item.screenshots.length > 0` in `app/work/[slug]/page.tsx` (restructuring that guard reds the suite). Tests read that module as SOURCE TEXT (regex), never import it (`--experimental-strip-types` cannot load `.png`). `sharp` is a direct `apps/web` dep; zero `next/image` warnings requires it.
- `/work/[slug]`: single `getCaseStudy(slug)` feeds `generateStaticParams` / `generateMetadata` / page; `dynamicParams = false`. macOS/APFS is case-insensitive: a case-variant slug serves 200 from the lowercase prerendered file and corrupts it on write-back; it 404s on Linux/Vercel. Verify with `/work/NoPe` (no colliding file) before believing a code bug; NEVER make slug lookup case-insensitive.
- New pages reuse `components/reveal.tsx` (`Reveal`, reduced-motion no-op) and `components/motion/`, and `PageHead`/`kit.tsx` heading helpers (`as="h1"` for single-topic pages); do not invent a second motion vocabulary. Interactive card/link focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` (`ring-offset-background` is REQUIRED, else the offset is white on dark). Every overlay layer needs `pointer-events-none`. Header layout changes: check 768-820px, not just 375 and 1280.
- `__tests__/a2-fix-verification` passes on a clean tree.
- Browser captures: Claude-in-Chrome `computer` screenshot returns JPEG ~1491-1512x812 with no format option: convert with `sips -s format png <jpg> --out <png>` (`sips -Z 1400` if over budget); no pngquant/optipng/ImageMagick/PIL here. `resize_window` silently no-ops, so mobile is proved structurally (say so, do not claim a visual check). Real mouse clicks are intermittently undelivered when Chrome is not OS-frontmost (`document.visibilityState === "hidden"`): pair every real-click check with a CDP `document.elementFromPoint()` sweep. Photographic shots exceed 400KB as PNG: use flat UI. A sonnet QA can take before/after screenshots using a temp detached worktree of origin/main on a free port (e.g. 3151).

**Platform / hub / worker gotchas**
- `@bcn-services/app-core` exports pricing (`PRICING`, `INCLUDED_SEATS`, `PER_SEAT_CENTS`, `formatUsd`, `monthlyCharge`, `setupFeeCents`), `decideAccess`, `decideFromEvent`, `createAnthropicClient`, `DEFAULT_MODEL`, plus health / storage / webhooks. Site pricing still hardcodes strings in `content.ts`.
- Hub Shopify card: `shopifyControl` in `apps/connect/lib/sources.ts`. A hub Reconnect button for a stored shop needs a new api view/RPC exposing `connector_schedule.config->>'shop'` (a migration); `api.shopify_shop_mismatch(p_shop)` tests "is the stored shop X" without exposing it.
- Health rows come only from worker `computeHealth`; any "derive state from tokens" fix lives in `data.*` functions or the worker (tokens are unreachable from `api`).
- `data.messages.kind` is unconstrained text, so a seed typo is silent. A new enum value goes in its own migration file.
- `platform/scripts/gcp-setup.sh`: job env/secrets are create-time only (deploy-worker's `jobs update` never touches them); new vars need their own opt-in `--update-*` step (like 6b QuickBooks). Never `--set-*` on a live job. Gate a step needing a not-yet-existing secret behind exists-checks and skip-with-message. Test the script with a fake-gcloud stub on PATH under `env -i`, piping y/n answers.
- A public Edge Function (`--no-verify-jwt`, e.g. `signup`) needs its own secret gate; a hub env switch does not keep it dark. GoTrue checks duplicate addresses before password strength, so answering 400 on `weak_password` leaks whether an address exists. A notice keyed on `verifyOtp type=email` needs an `email_confirmed_at` freshness check. The "Confirm signup" template must link `token_hash` with `type=email` to reach `/auth/confirm`.
- `~/bcns-client-l2detailz/.claude/worktrees/demo-seed/.env.local` POINTS AT PRODUCTION (live Supabase URL, anon + service-role keys, pooler `DATABASE_URL`). A local run that must not touch client data overrides all four with EMPTY strings (never `unset`; Next repopulates absent keys): `NEXT_PUBLIC_SUPABASE_URL="" NEXT_PUBLIC_SUPABASE_ANON_KEY="" SUPABASE_SERVICE_ROLE_KEY="" DATABASE_URL="postgresql://nateseluga@localhost:5432/l2detailz_test" pnpm dev`. With Supabase blanked the admin gate degrades OPEN in dev. Demo fixture there (branch `worktree-demo-seed`, not on `main`): `DEMO_SEED=1 bash supabase/local-test/run.sh`; `\quit` exits 0, so assert rows landed; demo rows prefixed `d0c…`/`d0b…`/`d0a…`; synthetic `Confirmed Cust`/`Declined Cust`/`Pending Cust`/`Probe Customer` rows also sit in `l2detailz_test` (check shot edges). Open there: `app/_components/BannerFrame.tsx` ships a PUBLIC iframe with `sandbox="allow-same-origin allow-top-navigation-by-user-activation"` (security finding, needs its own item); 7 pre-existing test failures at `ce076bf`; baseline `489/475/9/5` with a `.next` build, `475/463/7/5` without; `tests/banners-behavioral.test.mjs` live sandbox pair silently no-op-PASSES without a build.
- `~/bcns-client-delucas`: `computeMonthPnl(month, txs)` does NOT filter by month, hand it a pre-sliced month bucket. Vite `define` in `electron.vite.config.ts` beats shell env and `.env` for `import.meta.env.*`: use it to hard-pin a dev-only flag off for production. Demo fixture bounds are hand-typed (guard: `% 1000 === 0` + 25,000-cent minimum span): keep bound edits under review. `better-sqlite3` ships compiled for Node 20 and the machine runs Node 22: rebuild it or every DB-backed suite fails on a fresh clone.

**Process**
- dt-* agents write `*-report.md` to the working tree but usually do NOT commit it: the orchestrator `git add .claude/dev-team/` with the outcome commit and never `git checkout`s a report. Put "write your report to `.claude/dev-team/<name>.md` as well as returning it" in every dt-* spawn prompt. Agents commit despite "do NOT commit": expect a feature commit and add reports/PLAN/PROGRESS on top. Revert unrequested repo edits after review (a reviewer once edited STANDARDS.md).
- Parallel-group branches conflict only on `.claude/dev-team/*-report.md` (add/add): resolve `--theirs`, not a real overlap.
- Orchestrator adjudicates the handed-down baseline/premise FIRST (run every file individually, before/after a build; run the base-commit suite before QA; grep the env file; probe the premise) and prescribes a narrow design in the engineer prompt. Re-measure QA's scariest finding personally before accepting FAIL or the fixer's explanation. A resumed item is not restarted: read `.claude/dev-team/*-report.md` for the loop position. Apply one-token findings inline.
- Every IPC/handler accepting a key/value pair needs an explicit ALLOWED_KEYS allowlist (recurring gap across prior build items).
- Under auto mode an agent's `git push` of a new feature branch or throwaway `mutation/*` branches is refused: do not route around it.
- Probe injection (append a throwing `test()` to each file, confirm total and fail count move) is the honest proof a test glob ran every file: `node --test` TAP names only script-style files.
- Monitors return instantly: wait via a background until-loop.

## Recent runs

## 2026-10-01 — dev-team-auto — P3 hygiene (stale comments, env docs, workflow header, SSO cookie tests)
- **Outcome:** DONE — 1 attempt — caution: no — team: dt-engineer sonnet/high, dt-qa sonnet/high, dt-review opus/high — branch chore/hygiene-comments-sso-tests, commit 0dc2ddc, PR #91
- **What happened:** Comment/doc fixes plus a new packages/tenant sign-out cookie test driven through the real tenantMiddleware with a stubbed fetch. QA PASS, review PASS with one Important (overclaiming test header), fixed inline.
- **What worked:** Probing every SHOPIFY_APP_HANDLE reader first; mutation checks on cp backups; filtering the workflow diff for non-# lines.
- **What failed:** none. First `git push` was rejected (PAT lacks workflow scope).
- **Remember next run:** A branch touching .github/workflows must be pushed with `GITHUB_TOKEN= git push` (keyring token has the workflow scope). packages/tenant tests are a hard-coded list in package.json. apps/sb has 2 pre-existing failures (agent.test.mjs, shared-mode.test.mjs).

## 2026-10-01 — dev-team-auto — P7 QuickBooks worker env wiring
- **Outcome:** DONE — 1 attempt — caution: no — team: dt-engineer sonnet/high, dt-qa sonnet/high, dt-review opus/high — chore/quickbooks-worker-env, de5e833, PR #90, CI green
- **What happened:** Probed the premise first. Job env and secrets are applied only at job create; deploy-worker's `jobs update` never touches them. A missing secret ref would break the create, so QuickBooks became its own opt-in step 6b using `--update-*`.
- **What worked:** A fake-gcloud stub on PATH under `env -i`, driving the real script with piped y/n answers. QA mutated copies of the script, never the live file.
- **What failed:** Nothing blocking. Review: 4 Minor applied, 1 pre-existing Important in step 6 parked. Reviewer edited STANDARDS.md despite being no-edit; reverted — revert unrequested repo edits after review.
- **Remember next run:** gcp-setup.sh job env/secrets are create-time only; new vars need their own opt-in `--update-*` step. Never `--set-*` on a live job. Gate a step needing a not-yet-existing secret behind exists-checks and skip-with-message.

## 2026-10-01 — dev-team-auto — P4 platform test flake + seed typo (PR #96), P5 SB audit fixes (PR #97)
- **Outcome:** both DONE — caution: no — team: dt-engineer sonnet/high, dt-qa sonnet/high, dt-review opus/high — 0380f7a, f1b7b73
- **Remember next run:** Run a nested vitest via `process.execPath` + `node_modules/vitest/vitest.mjs`, not a bare `pnpm` (no corepack in the child). `data.messages.kind` is unconstrained text, so a seed typo is silent. apps/sb tests need packages/tenant and data-client built or 3 files fail; DESIGN.md copy is locked by qa-library tests. On a machine too starved to run the local stack, platform-ci `test` on the PR is the database evidence; it can flake on a Docker rate limit at "start local stack" (`gh run rerun --failed`).

## 2026-10-01 — dev-team-auto — P2 worker: revoked token never overwritten (PR #98), P9 paid-period end (local branch, held)
- **Outcome:** P2 DONE, P9 parked unpushed — caution: yes — team: dt-engineer opus/high, dt-qa opus/high, dt-review opus/high — 2656ce0; feat/shopify-paid-period-end ad52348
- **What happened:** P2 put `and status <> 'revoked'` on three token UPDATEs (the review added the successful-refresh one). P9 stores the paid-through date and lets the worker end access; its database tests never ran.
- **What failed:** No usable local database all night (half-migrated stack on an 8 GB machine under load). Under auto mode an agent's `git push` of a new feature branch and of throwaway `mutation/*` branches was refused; neither was routed around.
- **Remember next run:** In worker.test.ts a fixture left revoked must have its client churned, or health_one_row fails. Keep decision logic pure (`decide()`), so most mutation checks run without a database. A mutation check that needs CI is handed to Nate as a patch file plus a wizard step, not pushed by an agent. vitest prints passing test names in a failed job's log, so a mutation counts as red only on a ` FAIL ` line naming the test.

## 2026-10-01 — dev-team-auto — P1 owner self-service sign-up, dark (PR #99)
- **Outcome:** DONE — 2 attempts — caution: yes — team: dt-analyze sonnet/high, dt-engineer opus/high, dt-qa opus/high, dt-review opus/high — feat/signup-pending, 459a889
- **What happened:** Hub `/signup` → public `signup` Edge Function → `api.signup_create_client` (pending client + owner, capped 10/hour) → `/pending` until bcns activates by hand. Review returned CHANGES (2 Important); fix pass, delta QA PASS, delta review APPROVE.
- **What worked:** Pure handler with injected deps, so most mutation checks ran with no database. Proving the switch-off case by test (login page differs only by the gated link).
- **What failed:** The first build gated only the hub page: a `--no-verify-jwt` function is live the moment it deploys. The hosted steps missed the "Confirm signup" template and the SMTP gate.
- **Remember next run:** A public Edge Function needs its own secret gate; a hub env switch does not keep it dark. GoTrue checks duplicate addresses before password strength, so answering 400 on `weak_password` leaks whether an address exists. A notice keyed on `verifyOtp type=email` needs an `email_confirmed_at` freshness check. The "Confirm signup" template must link `token_hash` with `type=email` to reach `/auth/confirm`. A new enum value goes in its own migration file.

## 2026-10-06 — fable — Item 2 — MCP directory readiness
- **Outcome:** DONE — 1 attempt — caution: no — team: dt-engineer (sonnet, high), dt-review (opus, high) — feat/mcp-directory, 883e3a2 (PR #121, CI green)
- **What happened:** The premise probe found `TOOL_TITLES` already present and only 2 tools. The real gaps were the silent `?? tool.name` fallback (which kept mutation 1 green) and the missing `annotations.title`. Built an apps/web setup page at `/services/connect/setup` and a seed script that dry-runs by default, with pure seeded generators and an injected fake db.
- **What worked:** Prescribing a narrow design in the engineer prompt after probing. Keeping the platform seed test free of `./helpers`, so it runs without the local stack. The engineer validated the upsert conflict targets against a throwaway Postgres with every migration applied.
- **What failed:** none. The reviewer edited STANDARDS.md without being asked, and the orchestrator reverted it.
- **Remember next run:** Report hygiene puts `.claude/dev-team/*-report.md` in info/exclude, so commit reports with `git add -f`. `mcpTools()` now throws when a tool has no `TOOL_TITLES` entry, so a new MCP tool needs a human title. The seed's demo marker lives in `data.clients.notes`. The Vercel Ignored Build Step cancelled the preview on a PR that touched `apps/web`. The macOS shell has no `timeout` command.

## 2026-10-06 22:10 — fable — Item 3: Hub first-run checklist + Connect your AI page
- **Outcome:** DONE — 1 attempt — caution: no (ui: true) — team: dt-engineer (sonnet high), dt-qa (sonnet high), dt-review (opus high) — feat/hub-first-run, eab3d5b
- **What happened:** Owner-only 4-step checklist on hub home (pure `lib/first-run.ts`) + `/access` Claude/ChatGPT walkthrough, copy button, 3–5 starter questions per connected source. Step 4 needed a new RPC `api.ai_last_used_at()` over `data.mcp_tool_calls`; QA PASS first try, review 0C/0I/5M.
- **What worked:** Orchestrator probed the "connected Claude/ChatGPT" premise before spawning and prescribed the exact RPC + registries, so the engineer converged in one pass; QA's extra mutations (smoke member, viewer, all-done hide, owner gate) all went RED.
- **What failed:** none. Signed-in hub render is impossible locally (no stack, no env): behavioral QA is redirects + structural only.
- **Remember next run:** MCP OAuth is stateless; the only "AI is connected" signal is `data.mcp_tool_calls`, reachable from the hub only via `api.ai_last_used_at()`. A new api RPC needs entries in data-client `RPC_NAMES`, `database.types.ts`, and `platform/test/helpers.ts` RPC_ARGS (catalog `rpc_every_write_scoped`); an `expect: 'none'` RPC returning a non-uuid string lands in tenant.test's `acmeCreated::uuid[]` cleanup (safe only by sort order — harden). Only `api` is exposed by PostgREST.

## 2026-10-06 — fable — Item 7 — QuickBooks on /data
- **Outcome:** DONE — 1 attempt — caution: no — team: dt-engineer (sonnet, high), dt-qa (sonnet, high), dt-review (opus, high) — feat/qbo-data-view, 84121f7
- **What happened:** Added a QuickBooks Expenses view to `DATA_VIEWS` via a per-view `attrs` allow-list (select `alias:attributes->>k`, search `attributes->>k.ilike`) and `Column.minorDigits` for money. Connect 314→323; QA verified syntax against a real local PostgREST v16. Review 0C/0I/1M. PR #123, CI green after one rerun of an unrelated apps/sb `next/font` Google Fonts fetch flake.
- **What worked:** Orchestrator premise probe found two traps before the build (records_v1 has no `currency` column, so `currencyKey` must map through attrs too; QBO `amount_cents` is ×100 for every currency, unlike the hub's currency-digit scale) and prescribed the narrow design. QA standing up a throwaway PostgREST binary + local Postgres (no `supabase start`) proved the query syntax a fake can't.
- **What failed:** none. Reviewer wrote unrequested rules into STANDARDS.md; left uncommitted (the orchestrator's overwrite of it was refused by auto mode).
- **Remember next run:** `records.attributes` keys reach the hub only through a view's `attrs` allow-list; money from a worker that stores fixed cents needs `minorDigits: 2`. `defaultPins` only covers Shopify/Meta — new sources' stats are catalog-only until pinned. Tell dt-review "no repo edits, STANDARDS.md included". CI `apps` job can fail on apps/sb `next/font` Google Fonts fetch (`Cannot read properties of null (reading '1')`): `gh run rerun --failed`.

## 2026-10-06 22:40 — fable — Item 6 Docs cleanup
- **Outcome:** DONE — 1 attempt — caution: no — team: dt-engineer (sonnet, high), dt-review (opus, high) — chore/docs-cleanup, e3c27b1 (PR #124, CI green)
- **What happened:** Fixed the stale overnight PR list and the paused/pending wording in platform-v1.md, the "five sources" comment in sources.ts, and the echoes in DESIGN.md and NOTES.md. Review found 0C/0I/4M; the one-word Minor was applied inline.
- **What worked:** Pulling the PR ground truth (`gh pr list --state all`) before the engineer spawn and putting it in the prompt. Running grep sweeps with the patterns written into the report.
- **What failed:** The engineer said its report was "in the commit", but info/exclude had blocked it, so the orchestrator added it with `git add -f`.
- **Remember next run:** Docs status lists (open/merged PRs) go stale with every merge, so date-stamp any status section ("checked YYYY-MM-DD"). `.claude/dev-team/*-report.md` needs `git add -f`; don't trust an agent's "report committed".

## 2026-10-06 — fable — Item 4: client break emails (feat/break-emails)
- **Outcome:** DONE in 4 attempts (the build plus 3 fix rounds; the last Important was fixed inline using the reviewer's own copy). PR #125, CI green.
- **What happened:**
  - The build was clean. The reviews kept finding problems in the email copy and the reply routing:
    - The stale copy over-promised.
    - Replies went to bot@.
    - Then replies went to alerts@, which a bot parses.
    - The copy promised a follow-up nobody is set up to send.
  - The reviewer also edited STANDARDS.md without being asked; that edit was reverted.
  - A stray `git add -f` committed `platform/node_modules`; the final review caught it, and it was untracked in a new commit.
- **What worked:**
  - Pure decision functions (`clientBreakNotices`, `ownerRecipients`) kept all 3 mandatory mutation checks runnable locally.
  - The DB case stayed CI-only.
  - A prod SELECT confirmed no break was live before deploy.
- **What failed:** each copy fix created the next honesty problem, because the copy promised what the system doesn't do.
- **Remember next run:**
  - `BCNS_ALERT_EMAIL`/alerts@ is parsed by a bot, so it is never a client `reply_to`; bot@ is the default from.
  - Client email copy promises only what the code does.
  - Use `git add -f` with exact paths only; never on a directory.

## 2026-10-06 23:05 — fable — Item 5: Weekly digest email
- **Outcome:** DONE — 2 attempts — caution: no — team: dt-engineer (sonnet, high), dt-review (opus, high), dt-engineer (sonnet, xhigh), dt-review delta (opus, high) — feat/weekly-digest, d595e0f (PR #127)
- **What happened:** Built `lastWeek`/`weeklyDigest`/`digestEmail`/`raiseWeeklyDigests` in `platform/worker/src/health.ts`. A new tick step `weeklyDigests` runs before `alerts`, and `sendPending` routes `weekly_digest` through item 4's owner-only send. Review found the money scale wrong for currencies that don't use 2 decimals. One xhigh fix round, then a clean delta review. CI green first time.
- **What worked:** Probing prod before building: the inventory-only tenant changed the no-data rule. Pure decision functions let both mandatory mutations go red locally on exactly one named test. Resuming the original reviewer for the delta review was cheap and kept its context.
- **What failed:** The first build divided minor units by Intl's fraction digits (JPY 100× too high). Its JPY test fed a raw value that locked in the bug.
- **Remember next run:** Worker money is always `round(amount*100)` whatever the currency (`minor()` in `connectors/index.ts`): format with `/100`, never Intl `maximumFractionDigits`. Hub `currencyDigits` still has that bug. "No data" over `daily_summary_v1` must ignore inventory/conversion-only rows (one prod tenant has only those). The convergence-loop hygiene `git rm --cached` of `*-report.md` on a stacked branch stages deletion of the parent item's tracked reports: unstage them and name this item's reports `item<N>-*-report.md`. Intl prints `KWD 12.340` with a U+00A0 no-break space.

## 2026-10-06 — fable — Item 1: Stripe self-serve Checkout + payment gate
- **Outcome:** DONE — 2 attempts + 1 CI fix round — caution: yes — team: dt-engineer (opus/high, opus/xhigh), dt-qa (sonnet/high, sonnet/xhigh), dt-review (opus/high, opus/xhigh) — feat/stripe-gate — PR #126
- **What happened:** Built hub verify → stripe-webhook Edge Function re-verify → service_role RPC (shop-redact pattern); pure decideBilling with byte-identical Deno copy + drift test; grace expiry via worker tick. Review round 1 found 2 Important (double subscription on slow webhook / grace; Shopify App Store install shown Pay); round 2 closed both, 0C/0I. First CI run red: two platform DB tests pinned the old paused-403 hook and the service_role api allowlist; updated to the new spec, delta review 0C/0I/0M, CI green.
- **What worked:** Prescribing the shop-redact write pattern up front; keeping every guard pure so mutation checks run without a DB; reviewer running SQL guards in a scratch postgres; byte-identity test for the Deno copy.
- **What failed:** Attempt 1 missed Stripe-side idempotency (pending owner can pay twice before the webhook lands) and the Shopify hand-off → /signup path (no token exists before activation, so the token-based exemption can't see it). Local gates could not see the DB-backed platform tests that pin hook output and api grants.
- **Remember next run:** Hub webhooks must live under `/api/webhooks/*` (middleware matcher exempts only that prefix). `.claude/dev-team/*-report.md` is in the repo .gitignore: `git add -f` reports. A "who is exempt" rule keyed on post-activation data cannot see a pending user; carry an intent marker through login/signup. Stripe search is eventually consistent (~1 min): pair a pre-Checkout lookup with a webhook-side duplicate alert. Changing `custom_access_token_hook` or granting service_role on a new `api.*` function → update `platform/test/catalog.test.ts` hook_mints_claims and the N1 allowlist in `rpc-record-shop-redact.test.ts` in the same change; they skip locally and only fail in CI. A red `apps` job can be a Google Fonts fetch flake in apps/sb; read the log before fixing, and confirm connect's test count ran on the rerun.

## 2026-10-06 23:59 — fable — item 8 Source settings
- **Outcome:** DONE (PR #128, CI green) after the build and 2 fix rounds. The final dt-review was 0C/0I/0M.
- **What happened:**
  - Attempt 1 built the hub page, 4 api RPCs, data-client wiring and docs. Review found 2 Important: the folderCheck window went back to "pending", and an empty or unshared new Drive folder would tombstone, and 30 days later purge, every media row.
  - Fix round 1 added a worker guard in run.ts, outside connectors/*.
  - Delta review found the guard was too broad: it covered Monday and Meta, where the unshared case already errors upstream and tombstones heal. Fix round 2 scoped it to `media` only.
  - The DB-backed tests first ran in CI and passed first time: 38 files / 398.
- **What worked:**
  - Security-definer read functions instead of api views (those views are security_invoker over internal tables with no grants).
  - A dedicated `last_reset_at` column for the hourly limit. `updated_at` is bumped by a touch trigger, so it can't be used.
  - Refusing a reset while a sync holds the lease, so the reset isn't overwritten.
  - Pure SQL-text vitest assertions as the local mutation harness for migrations.
  - A read-only prod count probe before shipping the guard. It confirmed no live source would flip to error.
  - Running delta QA and delta review in parallel on a small diff. The reviewer used a `git archive` copy so QA's mutations couldn't affect its results.
- **What failed:**
  - The attempt-2 engineer started colima and a local Supabase stack against the brief; it was stopped afterwards.
  - The first worker guard covered every full-list table without checking which tombstones actually lose data. That cost a third round.
  - I left the objective and learnings block out of two parallel spawn prompts and had to relay it by SendMessage.
- **Remember next run:**
  - Before adding a guard against a destructive path, check which tables are actually lossy (media `purge_after`) and which sources already fail upstream, and scope the guard to those tables.
  - Build the spawn prompt from a file that already includes the objective, guardrails and learnings, so none of them gets dropped.

## 2026-10-07 07:40 — fable — Item 9 Source disconnect
- **Outcome:** DONE — 2 attempts (+2 copy-only follow-ups) — caution: yes — team: dt-engineer (opus high → xhigh), dt-qa (sonnet high), dt-review (opus high), delta dt-review (opus xhigh) — feat/source-disconnect, 993f6d1, PR #129
- **What happened:** Extended api.disconnect_source (new migration 20261007000500) and worker disconnect.ts to meet/drive/monday/meta, with per-source upstream revoke and one generalised hub route. Review's one Important was copy promising "keeps syncing" for a Google sibling that wasn't connected; the delta review raised two copy Minors; the orchestrator caught Monday copy that ignored pasted API tokens.
- **What worked:** probing prod first (a boolean equality of token columns, never values) settled the meet/drive sharing question. A pure DB-free `revokeUpstream` let mutation check 1 run locally. QA mocked `@bcn-services/tenant` in require.cache to get a behavioural signed-in-member route test with no refactor. CI's platform-ci ran the DB-backed cases green on the first push.
- **What failed:** the engineer's first owner-check mutation was caught only by a source-text test (ownerSession and memberSession both return null when signed out). Copy that depends on another source's state was wrong in two edge cases (sibling not connected, health read failed).
- **Remember next run:**
  - Google's revoke endpoint kills the whole user+app grant, so meet/drive need a sibling rule.
  - Monday tokens arrive via the app flow or a pasted personal API token, both stored as `monday_personal`; copy must cover both.
  - Copy derived from another card's status needs a true-either-way fallback when the read fails.
  - A hub route owner-check mutation needs a signed-in-member test, not a no-session test.
  - On a stacked branch, name reports `item<N>-*-report.md` and skip the `git rm --cached` hygiene.
