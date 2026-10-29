# HQ — bcns's internal command center

Decided 2026-10-26 with Nate. v1 (items 1-7) went live 2026-10-27; v2 (PRs #181-#186 plus #188 G Leads + Pitch and this docs PR, #187 H) adds the board, deliverables, uptime, calendar, per-user MCP tokens and the money model. Cutover from the old pipeline is Nate-run. Decision log:
`/Users/nateseluga/bcns/.claude/orchestrator/drafts/hq/decisions.md` (Q8-Q19 below). Package
`@bcn-services/hq`, slug `hq`, port 3105, `https://hq.bcn-services.com`.

## Context

Nate and Brandon ran sales and ops from a Google Sheet, a tracker artifact, a daily digest email,
and the `bcns-internal` pipeline (Cloud Scheduler -> GitHub Actions `clock.yml` -> jobs, plus a
laptop launchd pull). Tasks lived in three places and Claude had no safe way to work them.

## Decision

| Decision                                                                                                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| One new app, `apps/hq`, in this monorepo (Q8, Q11, Q18). Not a Connect tenant: single tenant, no `EXPECTED_CLIENT_ID`, no `@bcn-services/{tenant,data-client,app-core,ui}`.                                                                                                                                                                                                                                     | Same model as Technology Associates: custom build, own login, roles admin/staff.                                                                   |
| Own Supabase auth and DB (Q8, Q9): project `knmgyxlrhjxaydliucbs`, the former `bcns-internal` database. Pipeline tables (`businesses`, `events`, ...) are the starting schema; migrations 0001-0026 are copied byte-for-byte, `0027_hq.sql` and `0030_stage_times.sql` are v1, `0031`-`0035` are v2.                                                                                                            | Keeps the lead history; keeps HQ out of the client platform's blast radius.                                                                        |
| Access = a `profiles` row (`is_hq()`), anon key only. No service-role key and no platform `DATABASE_URL` in HQ (`scripts/check-env.ts` fails the build on `SUPABASE_SERVICE_ROLE_KEY`, on any `DATABASE_URL`, and on a `NEXT_PUBLIC_SUPABASE_URL` that is not the HQ project or a local stack). Admin-only actions use `is_admin()` (v2).                                                                       | A leaked HQ key cannot reach client data; staff cannot approve money or stage changes.                                                             |
| Claude works HQ through an MCP server inside the app at `/mcp` (Q14a-e), second connector "bcns HQ". Claude acts as the connecting user, never deletes, and can only _propose_ lead-stage, finance and client-field changes; an admin approves in the UI (keys a / r). Approve is not an MCP tool.                                                                                                              | Stage moves, finance numbers and billing fields are the writes that must not come from an LLM unattended.                                          |
| Jobs run as systemd units on the shared droplet (Q10, Q16): `source` and `qualify` timers (v1), plus `deliverable` (every minute) and `uptime` (every 5 minutes) in v2. HQ itself never runs an LLM: pitch and quote are queued `deliverables` rows that a job turns into files with the requester's `claude` token. Onboard stays dropped; digest, touch, personalize, poll, notify and heartbeat are dropped. | Kills Cloud Scheduler, GH Actions clock, the PAT and launchd. `qualify` keeps one `claude -p` call per lead on Nate's subscription token ($0 API). |
| Platform ops reads go through a read-only Postgres role `hq_ops_ro` on four metadata-only views in schema `ops` (Q17).                                                                                                                                                                                                                                                                                          | Ops view of Connect tenants without a service role in HQ.                                                                                          |
| Cutover (Q19): build against the live DB while the old pipeline runs, one parallel week with Brandon, then switch the old schedulers off and archive `bcns-internal`. The Sheet is out entirely (no import; the D2 check below only compares).                                                                                                                                                                  | Nothing is switched off until Brandon has worked a full week in HQ.                                                                                |

## Architecture

- **App.** Next 14 App Router, standalone build, `bcns-app@hq` on port 3105 behind nginx (certbot cert). Views: Today (by handle: Nate = needs-you list, fires and the track board with a hint-bar footer; Brandon = calls due, a progress rail with ring, best day, streak, week chart and recent wins, and the calendar), Leads (sheet-type grid, inline outcome, Pitch steps, #188), Work, Clients, Numbers. Public paths only `/login /reset /signout /api/health /mcp /authorize /token /register /.well-known/*`; middleware is fail-closed. `/files/[...path]` is session- and profile-gated.
- **Leads load.** The `/leads` grid is one slim `businesses` query (`LIST_COLS`: no `research` jsonb, `count: estimated`, so "of about N" when the page is full) plus one small `calls` select for the Last-call column (`loadLastCalls`). It builds no per-lead detail. Selecting a lead (debounced 120ms for j/k) calls the `loadDetail` server action (`app/(app)/leads/detail.tsx`), which reads that lead's full row, calls, notes and links as the session user and returns the Details and Calls bodies; the drawer shows "Loading…" until they arrive and refetches whenever the page re-renders (a logged call, note or save). Today (Brandon) still builds its few details eagerly.
- **Auth.** Supabase Auth email + password, host-only cookies (separate from Connect), 30-day max-age, hardened by `lib/cookie-options.ts`. Signups are off in the dashboard; a session without a `profiles` row is denied. "Forgot password" calls `resetPasswordForEmail`; the mail lands on the public `/reset` page, which needs the redirect allow-list and SMTP in step 12. Login errors name the email ("no HQ account for ...", "wrong password for ...", "HQ is not configured"). Anon-key clients with RLS gated by `is_hq()`; the admin gate is `is_admin()` (`profiles.role = 'admin'`). Deletes are revoked at the grant level; `decide_proposal()` is the only update path for `proposals` and `finance_inputs`.
- **Database region.** HQ project is us-west-2, droplet is nyc3 (about 70 ms round trip). Accepted.
- **Work and board.** Migration 0035: `tracks` (`name` unique, `area`, `client_slug`, `column` now/next/wait/done, `done_at` required when done) and `tasks.track_id`; RLS by `is_hq()`, select/insert/update only. **Tracks are fixed:** Software, Outreach, Marketing, Clients, Ops (`FIXED_TRACKS` in `lib/tracks.ts`). No create or delete: `createTrack` and a rename in `updateTrack` refuse any other name, and there is no `create_track` tool; new work is a task under one of the five (no `track_id` still lands on Miscellaneous). `pnpm --filter @bcn-services/hq seed-tracks` (dry run; `--apply` with `HQ_SEED_EMAIL`/`HQ_SEED_PASSWORD`) inserts any missing fixed track in Now, idempotent by name. Pre-existing tracks (the eight `seed-gtm` GTM tracks, anything else) are folded into the five by hand-run SQL and parked in Done so they fall off the board after 7 days; do not rerun `seed-gtm` after that, it re-inserts the GTM tracks by name. The Done column shows tracks done within 7 days. `buildBoard` adds a synthetic, never-stored "Miscellaneous" card (id `unassigned`, last in Now) for open tasks with no `track_id`; `list_board` returns it and Today's no-steps filter still applies. On Today (Nate) the card holds his untracked queue and waiting steps; done orphans are excluded, unlike tracked steps. Today (Nate)'s board is a derived queue, `todayQueue(tasks, me, today)` in `lib/tasks.ts` (nothing is pulled in per day): his open tasks split into queue (no `waiting` status and empty `waiting_on`; due within 7 days soonest first, then oldest `created_at`; cap 8), waiting (status `waiting` or a `waiting_on`; uncapped) and done in the last 7 days. All three go to `buildBoard`, so each lands in its track's lane (or the Miscellaneous card); the cap is on the queue only. Header: `n up · n waiting · n done`; empty board shows "Nothing up. Add a task or assign yourself one on Work." `TrackBoard`/`TrackCard` are shared by Work and Today (Nate). Work: left list (420px) grouped Unassigned / Nate / Brandon / Claude with Search, Any track and Any client filters; `n` opens New task; the right side is the board, and opening a task replaces it with "← Board" (Esc closes). The Lists tab UI is gone (`?tab=lists` still resolves). Tasks carry `client_slug` and `track_id`.
- **Deliverables.** Migration 0032 `deliverables` (`slug`, `kind` pitch/quote, `status` queued/running/done/failed, `requested_by`, `feedback`, `paths`, `error`). Signed-in users may select and insert (status `queued`, `requested_by` themselves); only the `hq_jobs` role updates. `hq-deliverable.timer` fires `hq-job@deliverable` every minute and takes one row per run (`jobs/deliverable.mjs`): Claude runs with the requester's token and a prompt that fences the untrusted data, and may only write `clients/<slug>/demo/{demo-a,demo-b,demo-c,demo}.html` plus `video-guide.md` (pitch, via os `skills/demo/SKILL.md`) or `clients/<slug>/quote/<DATE>-<slug>.{md,html,pdf}` (quote, via `skills/quote/SKILL.md`) in the os clone at `HQ_OS_DIR` (`/srv/hq/os`). A non-LLM guard discards any change outside `clients/<slug>/` and fails the row. Then the job commits as `bcns-hq <hq@bcn-services.com>` (`hq: demo|quote for <slug>`) and `git push`es over SSH with the `os-deploy-key` credential, `StrictHostKeyChecking=yes` against `/srv/hq/jobs-state/known_hosts`, hooks and fsmonitor nulled, `GIT_DIR`/`GIT_COMMON_DIR` pinned. It hashes `.git/config`, `.git/info/`, `.git/commondir` and the hooks listing before and after; a change fails the row, stops all git, and writes `/srv/hq/jobs-state/git-meta-changed`, after which every run refuses until Nate inspects the clone and deletes that file. A dirty clone with no other row running is discarded (reset to upstream, `clean -ffdxq`); a `running` row older than 30 minutes is failed ("stale run"). The clone is never pulled, so a non-fast-forward push fails the row and Nate refreshes the clone by hand. `CLAUDE_TIMEOUT_MS` is 18 minutes inside the unit's 25-minute `TimeoutStartSec`. The Pitch UI that inserts the rows (steps: call went well -> 3 prototypes, each opened in a new tab from `/files/...` -> pick + feedback -> final deck (View / PDF via browser print) -> consult booked -> quote, with status chips from the row status) is #188 (G). The Files-tile deliverable buttons on Clients did not ship in v2 (follow-up: the Clients page links to the lead drawer's Pitch tab instead).
- **Uptime.** `jobs/uptime.mjs` under its own `hq-uptime.service` (not `hq-job@`: the template needs the credentials files; no creds, no os clone, `DynamicUser` with `SupplementaryGroups=hq` to enter `/srv/hq`, `MemoryMax=256M`, `TimeoutStartSec=2min`) and `hq-uptime.timer` (`OnCalendar=*:0/5`, Persistent). It GETs `https://<slug>.bcn-services.com/api/health` for sb, connect, mcp, hq and ta (10 s timeout, no redirects), writes `uptime_checks(target, ok, status, latency_ms, checked_at)` (0034), prunes at 7 days. A dead app is a row with `ok=false`, not a job error. View `uptime_status`.
- **Clients.** 320px list with search and All / Down / Watch / Healthy, grouped with a why-line and the $rate; detail grid App + connectors / Money / Work / Files + links. Health is derived (`lib/clients/health.ts`): red = app check failed or a connector `auth_failed`/`error`; amber = stale connector, uptime job quiet over 20 minutes, no payment this month for a Mercury-billed client, overdue invoice, or an unreadable check; green otherwise. No grace period (amber on the 1st). Edit is admin-only and covers exactly seven fields (`monthly_rate_cents, billing_source, mercury_customer_id, aliases, repo_url, launch_date, notes`; aliases one per line); staff see no Edit (0034 makes clients insert/update admin-only, so the old staff Edit stops working by design). "+ Task for this client" creates a task with `client_slug`. "Their app" links only for `sb` and `technology-associates` (hard-coded `APPS` map).
- **Calendar.** `lib/calendar.ts`: a Google service account signs an RS256 JWT with `node:crypto` (scope `calendar.readonly`), lists the next 7 days of `GOOGLE_CALENDAR_ID`, and each person sees events whose attendees include their profile email. "Join Meet" uses `hangoutLink` (only `https://meet.google.com`). Memoised 60 s. Unset env shows a "calendar not connected" panel and never throws. Env names: `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`.
- **Per-user MCP tokens.** `POST /mcp`, OAuth in the app (`lib/mcp/oauth.ts`), copied from `apps/mcp` but against HQ's Supabase. HQ issues its **own opaque bearer tokens** and never hands the Supabase JWT to the client. v2 persists them in `mcp_tokens` (0031): the key is an HMAC-SHA256 of the token under the server-only `MCP_TOKEN_KEY` (at least 32 characters; unset = `/mcp` answers 503, fail closed), kinds access and refresh, `payload` holds the Supabase session, RLS on with no policy and `revoke all`. Access goes only through security-definer functions: `mcp_token_store` (authenticated, `is_hq()`, own user, expiry at most 90 days, payload at most 8 KB, prunes, keeps the newest 100 rows per user), `mcp_token_lookup` and `mcp_token_revoke` (anon + authenticated), `mcp_token_revoke_user` (authenticated). Refresh TTL is 30 days; an access token expires 30 s before its Supabase JWT. PKCE S256 and stateless dynamic client registration are kept. Only auth codes (60 s) and the known-IP set stay in process memory, so a restart costs an in-flight sign-in at most and **tokens survive deploys**; "one HQ process" now matters only for codes and rate buckets. Allowed redirects: exactly `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`, plus loopback `http://localhost` / `127.0.0.1` on any port. Sign-out revokes the user's MCP tokens.
- **MCP tools (17).** `list_tasks get_task create_task update_task add_task_note list_board move_track update_track search_leads get_lead log_lead_note add_link get_client propose_client today propose_lead_stage propose_finance`. No approve, decide or delete tool. `get_lead` strips phone, email and person-name keys (including `owner_name`). `create_task` takes `client_slug` and `track_id`; `update_task` takes `owner`, `client_slug` and `track_id`. **Done rule:** an admin (`profiles.role`) may close or reassign any task; staff may close or reassign only their own, claude's and unowned tasks, otherwise the call is refused naming the owner (reassigning is gated like closing). **Actor** is the OAuth profile: writes carry `via='mcp'` and the audit shows "Claude (<handle>)". `propose_client` files a pending proposal of kind `client` limited to the seven Clients fields above; an admin approves it through `decide_proposal`.
- **Proposals.** `propose_*` writes a pending row; Today shows before -> after; a/r call `decide_proposal`, which raises 42501 for non-admins (the UI hides a/r for staff). A stale proposal (lead already moved) leaves the lead unchanged. A trigger sets `proposals.old` and `via` server-side (`via='mcp'` only when the request carries `X-HQ-Via: mcp`).
- **Jobs.** `apps/hq/jobs/` (plain Node 22 ESM, only dependency `postgres`; not a pnpm workspace member, outside turbo and CI). `source` Mon-Fri 11:00 UTC walks the trade x town grid on Places API (New); `qualify` hourly 08-20 UTC at :15 fetches sites, scores fit (code signals, then the `claude` CLI), promotes to `call_due` up to 50 per day; `deliverable` and `uptime` are above. Every run writes `events(job, kind='run')` (uptime logs failures only). Places budget is counted from `places_call` events against `BCNS_PLACES_MONTHLY_CAP` (default 950); an unreadable count stops the run. Units in `infra/`: `hq-job@.service` (template for source, qualify, deliverable), `hq-source.timer`, `hq-qualify.timer`, `hq-deliverable.timer`, `hq-uptime.service`, `hq-uptime.timer`. The template runs `DynamicUser=yes` with `SupplementaryGroups=hq`, `MemoryMax=384M`, `CPUQuota=50%`, `HOME=/srv/hq/jobs-state/claude-home` and `LoadCredential` for `claude-nate`, `claude-brandon`, `os-deploy-key` (see M2). Jobs connect as the `hq_jobs` Postgres role once Nate switches `jobs.env`.
- **Platform ops.** Migration `platform/supabase/migrations/20261027000100_hq_ops_ro.sql`: login role `hq_ops_ro` (3 connections, 5 s statements) with SELECT on `ops.connector_health`, `ops.connector_runs_7d`, `ops.tickets_open`, `ops.clients` (names, slugs, status, timestamps; no error text, no tokens, no record data). HQ connects through `PLATFORM_OPS_URL` and forces `sslmode=verify-full` whatever the URL says (L6); every read fails soft to "unavailable".
- **Fires seam.** `lib/fires.ts` merges `lib/fires-tasks.ts` (due and waiting tasks) and `lib/fires-ops.ts` (connector status, job failures in 24 h, urgent tickets, ops tasks due in 7 days). A fire's stable `key` becomes `tasks.alert_key`, so `c` on Today creates one Claude task per alert; a unique partial index on open `alert_key` (0031) makes `createOpsTask` return the winner on a race. `today` over MCP omits connector and job fires (they need a cookie session).
- **Money.** `lib/money.ts`, Stripe (restricted read-only key) and Mercury (read-only token), plain fetch, memoised 10 minutes (a failure retries after 1), fail soft. MRR = Mercury clients (`clients.billing_source = 'mercury'`, `monthly_rate_cents`, no `churn_date`) plus active Stripe subscriptions that are not cancelling (`cancel_at_period_end` or `cancel_at` excluded and listed as "cancels <date>"). A client's paid state is matched by `clients.mercury_customer_id`, falling back to an exact-name entry in `aliases` (0033; the fuzzy `nameMatches` is gone). Mercury's Accounts and Transactions API is free on every plan; the Invoicing API needs a **paid Mercury plan**, so invoices stay behind `MERCURY_INVOICING=1` (off by default) and a 403 shows as an error chip with the message. Mercury has no recurring-series API (its invoice object has no series field), so with a rate set only a payment of exactly `monthly_rate_cents` counts as the month's payment; one-time invoices still count toward lifetime revenue. Numbers tabs: Money, Sales funnel, Ops, Unit economics; the `ASSUMPTIONS` constants live in `lib/finance.ts`.
- **Late stages.** The old hourly tick still acts on `replied / quoting / won` during the parallel week, so HQ refuses those moves (UI and MCP) unless `HQ_LATE_STAGES=1`. Set it only at cutover.

## Security review fixes (as shipped)

From `/Users/nateseluga/bcns/.claude/orchestrator/notes/hq-review-2026-10-27.md`. All in migration 0031 unless named.

- **H1** `decide_proposal` raises 42501 unless `is_admin()` (security definer, execute to authenticated only); the UI hides approve/reject for staff. 0034 extends it to kind `client` and makes `clients` insert/update admin-only.
- **H2** Direct `finance_inputs` insert/update is revoked from `authenticated` and the policies are admin-only; writes go through `decide_proposal`.
- **M1** `jobs/lib/claude.mjs` gives the CLI no tools for `qualify` (`--tools ""`) and only `Read,Glob,Grep,Write,Edit` for deliverables (`--permission-mode dontAsk --allowedTools`), with `--strict-mcp-config` and `--setting-sources ""`. The child env is only `PATH`, `HOME`, `CLAUDE_CODE_OAUTH_TOKEN`; the token is read from `$CREDENTIALS_DIRECTORY/claude-<handle>` and an unknown handle is refused before spawn. Needs the claude CLI at 2.1.312 or later.
- **M2** `infra/hq-job@.service`: `DynamicUser=yes`, `SupplementaryGroups=hq`, `LoadCredential` for the two Claude tokens and the deploy key, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`, `UMask=0002`, `MemoryMax=384M`, `OOMPolicy=continue`, `CPUQuota=50%`; `/srv/hq/os` is read-only except `clients/`, `.git` and `/srv/hq/jobs-state`. Jobs use the dedicated `hq_jobs` role (grants in the 0032 and 0034 footers, step 16), not the owner connection. Not shipped: `CapabilityBoundingSet`, `SystemCallFilter`, `PrivateDevices`, `ProtectKernel*` and `RestrictAddressFamilies` (neither this unit nor `hq-uptime.service` sets them).
- **M3** `jobs/lib/fetch-page.mjs` validates the address at connect time (`guardedLookup`), which closes the DNS-rebinding gap, and the blocklist is wider (198.18/15, 224/4, 240/4, 64:ff9b::, hex `::ffff:`, CGNAT) and refuses localhost, `.internal` and metadata hostnames.
- **L1** `events` update is revoked (append-only); `proposals.old` and `via` are set by a server-side trigger.
- **L2** Shipped as a test only: `platform/test/hq-ops-ro.test.ts` checks the role attributes and a privilege matrix (SELECT on `ops.*` only, nothing elsewhere; named exceptions are the PUBLIC-extension objects `extensions.pg_stat_statements*`, `net.http_request_queue`, `net._http_response`). The migration is unchanged. If pg_net is ever enabled on the platform project it gives PUBLIC, so `hq_ops_ro`, rights on `net.*` (absent today).
- **L3** `ops.tickets_open` subjects are capped at 80 characters on the HQ read path (`ticketRow` in `lib/ops.ts`).
- **L4** `next.config.mjs` sets on every page except `/authorize` (which sets its own CSP): `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self' data:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and `Strict-Transport-Security: max-age=31536000`. Cookies go through `hardenCookie()`: HttpOnly, SameSite=Lax, Secure in production, host-only.
- **L5** Tokens persist as an HMAC-keyed hash, not plain sha256 (a review round found an anon lookup returning the stored session; the key fixed it). ChatGPT redirects were dropped, and sign-out revokes the user's tokens.
- **L6** `lib/ops.ts` `verifyFullUrl()` forces `sslmode=verify-full`. That needs `NODE_EXTRA_CA_CERTS` pointing at the Supabase root CA (step 13) or the ops panel shows "unavailable"; `failureReason()` logs a hint. The jobs `DATABASE_URL` uses `verify-full` too.
- **Also.** `/files/[...path]` serves only under `HQ_OS_DIR/clients`: it refuses `..`, absolute and encoded traversal, NUL and dotfiles, requires the realpath to stay inside, caps files at 25 MB, and sends `Content-Security-Policy: sandbox` and nosniff. The role split (D3) is enforced.

## Consequences

- HQ is additive on the DB (new tables, grants, one recreated view), but 0027 also revokes `anon` on all public tables and default privileges, and recreates `selectable_businesses` as `security_invoker`. The old jobs read that view over a direct Postgres connection, which these changes do not touch (not exercised against the live project).
- One process is still needed for OAuth auth codes and rate buckets (in memory), but no longer for tokens. Scaling to two instances could drop an in-flight sign-in. Acceptable at two users.
- The deliverables job pushes to the `bcns-os` repo with a write deploy key and runs `claude` with the requester's subscription token (Brandon's needs his own Pro/Max plan). The os clone on the droplet goes stale (never pulled) and is refreshed by hand.
- Finance for non-cold channels still takes spend and hours as inputs (`finance_inputs`); Claude may only propose them, and only an admin approves.
- `0030_stage_times.sql` adds `businesses.consult_done_at` / `won_at` (stamped by trigger, backfilled) and makes `finance_snapshots` insert-only. It is idempotent.
- A merge that touches `apps/hq/**` redeploys sb, connect, mcp and hq together (`deploy-app.yml`), so the Nate-run steps below put everything a deploy needs on the droplet and in the database **before** the merge.
- `apps/hq/jobs` is outside turbo, lint and `pnpm test`: run `(cd apps/hq/jobs && npm install --no-package-lock && npm test)` by hand.
- Two applied bcns-internal migrations carry a bcns mailbox alias (`0025`) and `rls.sql` carries test addresses; a repo-wide contact grep over `apps/hq` hits only those. Leave 0025 (applied); swapping `rls.sql` to `example.invalid` is optional.

## Nate-run steps, in order

Everything below is run by Nate. Secrets are typed by Nate and never pasted into a Claude window; this document lists variable **names** only. `<droplet>` is `root@104.236.20.89` (`bcns-web-apps-nyc`, nyc3). Steps 1-9 are v1 and ran on 2026-10-27; they stay as reference with the lines v2 made false patched. Steps 10-24 are v2; steps 25-31 add the two-way ticket sync (post-v2, each marked pending until Nate runs it).

**Order.** A merge that touches `apps/hq/**` deploys immediately (all four apps), so the order is: **pre-merge** steps 10-17, **merge** step 18, **post-merge** steps 19-21. This supersedes the earlier "db push after merging" order: a deploy that lands before its migration or its env breaks `/work` (0035), `/mcp` (503 without `MCP_TOKEN_KEY`) and the new hq-job units (missing credentials).

Laptop commands run from a checkout of the integration branch `hqv2-int` (`/Users/nateseluga/bcns-w-hqv2`) or the last stacked PR branch `hqv2-pages` (#186), after `pnpm install --frozen-lockfile`: the Supabase CLI only sees migrations on disk, and 0031-0035 reach `main` only at step 18.

**Stacked PRs.** #181 A security + MCP tokens, #182 C money, #183 B jobs + deliverables, #184 E work + board + MCP tools, #185 D clients + uptime, #186 F login + Today + calendar; then #188 G Leads + Pitch; then this docs PR (#187 H). Merge in exactly that order, with `--merge` (a squash breaks the PRs stacked on it).

### 0. Already done

`scripts/new-app.sh hq 3105` ran: `apps/hq` exists and `infra/ports.txt` has `hq 3105`. Do not run it again. v1 (steps 1-9) is live: DNS, 0027 and 0030, `hq_ops_ro`, two profiles (nate admin, brandon staff), keys, droplet onboard, the deploy workflow edit (#179: `hq` in the push paths and matrix, `jobs/` copied, `npm install --omit=dev` in the activate step), the source and qualify timers, and the connector. Step 21 (the GTM seed) was left unconfirmed in the v1 go-live log.

Steps 1-9 below are the v1 go-live (done 2026-10-27), kept as reference; v2 is step 10 onward.

### 1. DNS (do first, propagation and certbot need it) — done 2026-10-27 (v1 go-live)

Squarespace -> Domains -> `bcn-services.com` -> DNS Settings -> Add record: type `A`, host `hq`, data `104.236.20.89` (TTL: Custom 300). Squarespace asks for a Google re-verify per session. Check:

```bash
dig +short hq.bcn-services.com        # must print 104.236.20.89 before step 6
```

### 2. HQ database (project `knmgyxlrhjxaydliucbs`) — done

```bash
supabase link --workdir apps/hq --project-ref knmgyxlrhjxaydliucbs
supabase migration list --workdir apps/hq          # READ THIS BEFORE PUSHING
```

Expected: 0001-0026 present in both Local and Remote; 0027 and 0030 Local only (0028 and 0029 do not exist, by design). Stop and do not push if **any of 0001-0026** is Local only: bcns-internal recorded some of 0023-0025 by hand, and `db push` would re-run it. Never re-run `0026_no_email_pool.sql` (it moves leads back to `no_email`). Do not run `migration repair` to get past it; bring the list back to a Claude session first. Otherwise:

```bash
supabase db push --workdir apps/hq --dry-run       # must list exactly 0027 and 0030
supabase db push --workdir apps/hq
```

Details: `apps/hq/supabase/README.md`.

### 3. Platform database: `hq_ops_ro` (project `cnsxbglhredokjbvudfd`) — done

v2 forces `sslmode=verify-full` in code whatever the URL says, so the URLs below use it; HQ needs `NODE_EXTRA_CA_CERTS` (step 13).

```bash
supabase link --workdir platform --project-ref cnsxbglhredokjbvudfd   # only if platform/supabase/.temp/project-ref is missing in this checkout (a bare .temp/ dir is not linked)
supabase db push --workdir platform --dry-run      # expect 20261027000100_hq_ops_ro.sql (plus anything else genuinely unapplied: read it)
supabase db push --workdir platform
```

Then set the role's password by hand. Generate it (no `%`, `#`, `@`, so it is URL-safe) and copy it to the clipboard:

```bash
openssl rand -hex 24 | pbcopy
```

Platform dashboard -> SQL Editor (project `cnsxbglhredokjbvudfd`), type, pasting the password between the quotes:

```sql
alter role hq_ops_ro password '<paste>';
```

Build `PLATFORM_OPS_URL` for step 6. The droplet probably has no IPv6, so use the session pooler (platform dashboard -> Connect -> Session pooler shows the host). The user carries the project ref, otherwise "Tenant or user not found":

```
postgresql://hq_ops_ro.cnsxbglhredokjbvudfd:<password>@<pooler-host>:5432/postgres?sslmode=verify-full
# direct (IPv6 only, fails from a host without IPv6):
postgresql://hq_ops_ro:<password>@db.cnsxbglhredokjbvudfd.supabase.co:5432/postgres?sslmode=verify-full
```

### 4. HQ dashboard: signups off, two users, two profiles — done

HQ project `knmgyxlrhjxaydliucbs` in the Supabase dashboard:

1. Authentication -> Sign In / Providers -> Email: enabled, password sign-in on (confirm this; the local stack cannot test it). Turn **off** "Allow new users to sign up". `is_hq()` requiring a `profiles` row is only the backstop.
2. Authentication -> Users -> Add user -> Create new user, "Auto Confirm User" ticked: Nate (`nseluga@bcn-services.com`) and Brandon (his bcns business email). Type the passwords there.
3. SQL Editor, run once (replace the placeholder with Brandon's business email; business emails only):

```sql
insert into profiles (id, email, display_name, handle, role)
select id, email, 'Nate', 'nate', 'admin' from auth.users where email = 'nseluga@bcn-services.com';

insert into profiles (id, email, display_name, handle, role)
select id, email, 'Brandon', 'brandon', 'staff' from auth.users where email = '<brandon-business-email>';

select handle, role from profiles order by handle;   -- expect exactly two rows
```

### 5. Keys from other consoles (free routes first) — done

- **Google Places (paid past the free tier):** Google Cloud console -> APIs & Services -> Credentials -> Create credentials -> API key. Restrict: API restrictions = "Places API (New)" only; Application restrictions = IP addresses = `104.236.20.89`. Also set a budget alert (Billing -> Budgets & alerts). Becomes `GOOGLE_PLACES_API_KEY`. Cutover-month cap: HQ counts only its own `places_call` events, so set `BCNS_PLACES_MONTHLY_CAP` to **950 minus the Places calls bcns-internal already made this month** (read them in the key's project: APIs & Services -> Places API (New) -> Metrics), or leave 950 and start the HQ `source` timer on the 1st. Google bills any overage. Alternative that avoids double sourcing: pause `clock-source` in Cloud Scheduler (step 24) the day you enable `hq-source.timer`; the other old ticks keep running.
- **Stripe:** Dashboard -> Developers -> API keys -> Create restricted key; permissions Subscriptions: Read, Charges: Read, everything else None. Becomes `STRIPE_KEY`.
- **Mercury:** Settings -> API Tokens -> new token, **Read Only**. Becomes `MERCURY_KEY`. The Transactions API is free. Leave `MERCURY_INVOICING` unset: Invoicing needs a paid Mercury plan, Nate decides whether to pay.
- **Sentry (optional):** a Sentry project for HQ (or reuse sb/mcp's) -> Settings -> Client Keys (DSN). Becomes `SENTRY_DSN`. Errors only; unset = off.
- **HQ database URL for jobs:** HQ dashboard -> Connect -> Session pooler, user `postgres.knmgyxlrhjxaydliucbs`, with the database password (Project Settings -> Database -> Reset database password if unknown). Becomes `DATABASE_URL` in `jobs.env` only. Use the session pooler (port 5432), not the transaction pooler (6543): the jobs use prepared statements.

### 6. Droplet: onboard HQ — done

```bash
scp infra/onboard-client.sh infra/ports.txt infra/hq-job@.service infra/hq-source.timer infra/hq-qualify.timer root@104.236.20.89:/root/
ssh root@104.236.20.89
```

On the droplet (DNS from step 1 must already resolve, or certbot fails and rolls back):

```bash
cd /root && ./onboard-client.sh hq 3105 hq.bcn-services.com
```

That creates user `hq`, `/srv/hq`, a seeded `/srv/hq/env` (mode 600), a sudoers rule limited to `systemctl restart bcns-app@hq`, the nginx vhost, a Let's Encrypt cert, and enables the unit. Then:

```bash
# CI deploy key: the same public key CI already uses for the other apps
install -d -o hq -g hq -m 700 /srv/hq/.ssh
install -o hq -g hq -m 600 /srv/sb/.ssh/authorized_keys /srv/hq/.ssh/authorized_keys

# jobs env file (the old claude-home dir is unused since v2: HOME is /srv/hq/jobs-state/claude-home, step 15)
install -d -o hq -g hq -m 700 /srv/hq/claude-home
install -o hq -g hq -m 600 /dev/null /srv/hq/jobs.env

# nightly pg_dump of the HQ database (session pooler URL, same one as jobs.env DATABASE_URL)
nano /etc/bcns/backup-dbs      # add one line:  hq=<session pooler URL>
```

Fill `/srv/hq/env` (`nano /srv/hq/env`; `NAME=value`, no quotes, no `export`). Names only:

| Name                            | Where the value comes from                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `PORT`, `HOSTNAME`              | seeded by `onboard-client.sh`; leave                                                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | HQ project -> Project Settings -> API (Project URL)                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | HQ project -> Project Settings -> API Keys (the anon / publishable key)                   |
| `HQ_PUBLIC_ORIGIN`              | `https://hq.bcn-services.com` (required: MCP issuer, never derived from the request Host) |
| `PLATFORM_OPS_URL`              | step 3                                                                                    |
| `STRIPE_KEY`, `MERCURY_KEY`     | step 5                                                                                    |
| `MERCURY_INVOICING`             | leave unset (set `1` only with a paid Mercury plan)                                       |
| `SENTRY_DSN`                    | step 5, optional                                                                          |
| `INSTINCT_URL`, `SENTRY_URL`    | optional dashboard links shown on Numbers                                                 |
| `HQ_LATE_STAGES`                | **unset** until cutover (step 24)                                                         |

Never put `SUPABASE_SERVICE_ROLE_KEY` or a platform `DATABASE_URL` in this file (the seeded `# DATABASE_URL=` comment is a template leftover; ignore it).

Fill `/srv/hq/jobs.env` (`nano /srv/hq/jobs.env`). Names only:

| Name                                                              | Where the value comes from                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                                                    | HQ session pooler URL, step 5                                   |
| `GOOGLE_PLACES_API_KEY`                                           | step 5                                                          |
| `BCNS_PLACES_MONTHLY_CAP`                                         | step 5 (default 950)                                            |
| `SOURCE_CELLS_PER_RUN`, `QUALIFY_BUDGET_MS`, `CALL_TASKS_PER_DAY` | optional tuning; defaults are fine (`CALL_TASKS_PER_DAY` is 50) |
| `CLAUDE_CODE_OAUTH_TOKEN`                                         | superseded by v2: credentials files, step 15; do not set        |

v2: the Claude token no longer lives in `jobs.env`; install the CLI and create the credentials in step 15. Without the CLI or a token `qualify` still runs, scoring by code signals alone.

### 7. Deploy workflow edit, then merge (first deploy) — done

Merged as #179: `deploy-app.yml` has `apps/hq/**` in `on.push.paths` and `hq` in the matrix, copies `apps/hq/jobs` into the release, and runs `npm install --omit=dev --no-package-lock` there before the symlink flips. Nothing to redo. The smoke test it used is in step 19.

### 8. Timers (needs a deployed release at `/srv/hq/current`) — done; v2 adds two more in step 19

```bash
ssh root@104.236.20.89
cp /root/hq-job@.service /root/hq-source.timer /root/hq-qualify.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start hq-job@qualify                       # one run by hand first (oneshot: blocks until done)
journalctl -u hq-job@qualify -n 40 --no-pager        # expect no error and no oom-kill
systemctl show hq-job@qualify -p Result,MemoryPeak   # Result=success; MemoryPeak under the 384M cap (blank = old systemd, grep the journal for oom instead)
```

Confirm the run row in the HQ SQL Editor: `select created_at, detail from events where job = 'qualify' and kind = 'run' order by created_at desc limit 3;`. Note this promotes real leads to `call_due` (up to 50 per day). Then:

```bash
systemctl enable --now hq-source.timer hq-qualify.timer
systemctl list-timers 'hq-*'
```

If a fire exits 1 with no run row, check `cd /srv/hq/current/jobs && ls node_modules/postgres` (the deploy's npm step).

### 9. Connect Claude to HQ — done; reconnect once after v2 (step 19)

claude.ai -> Settings -> Connectors -> Add custom connector -> name `bcns HQ`, URL `https://hq.bcn-services.com/mcp`. Sign in with your HQ email and password when it redirects to `/authorize`. The os skill `/hq` drives it (`~/os/skills/hq/SKILL.md`).

**Claude Code.** No separate setup: claude.ai connectors load into Claude Code on the same account. After connecting in claude.ai, `claude mcp list` shows `claude.ai bcns HQ - Connected`, and the 17 tools (12 before v2; `create_track` removed with the fixed track set) appear as `mcp__claude_ai_bcns_HQ__*` (verified 2026-10-28: `today`, `list_tasks`, `create_task`, `update_task`). Signed out shows `! Needs authentication`; in Claude Code run `/mcp`, pick `claude.ai bcns HQ`, Authenticate, sign in at `/authorize`. Do not also add a user-scope `claude mcp add ... hq`: it is a second, redundant sign-in for the same server.

### 10. Pre-merge checks (read-only; HQ SQL Editor, project `knmgyxlrhjxaydliucbs`)

```sql
select handle, role from profiles order by handle;   -- nate must be 'admin', brandon 'staff'
select alert_key, count(*) from tasks where alert_key is not null and status <> 'done' group by 1 having count(*) > 1;   -- must return no rows
```

If nate is not `admin`, set it once: `update profiles set role = 'admin' where handle = 'nate';` (0031 makes approve admin-only, so this is how Nate keeps approving). If the second query returns rows, close the duplicate tasks before step 11: the unique index on open `alert_key` in 0031 fails on duplicates.

### 11. HQ database: push 0031-0035 (before the merge)

```bash
supabase link --workdir apps/hq --project-ref knmgyxlrhjxaydliucbs     # only on a fresh checkout
supabase migration list --workdir apps/hq          # 0001-0030 in both columns; 0031-0035 Local only
supabase db push --workdir apps/hq --dry-run       # must list exactly 0031, 0032, 0033, 0034, 0035
supabase db push --workdir apps/hq
```

Order inside the push is by number, which is what 0034 needs (after 0031-0033). 0035 must be live **before #184 merges** or every task insert writes `track_id` and `/work` returns 500. 0033 must be live before #185 (the Clients select reads `mercury_customer_id, aliases`). #188 (G) adds no migration. Connectors sign out once, at the first v2 deploy (the token store moves from memory to the database); after that, tokens persist across deploys (step 19).

### 12. Supabase Auth settings (HQ project dashboard; before #186 merges)

1. Authentication -> Sessions (or Settings): JWT expiry 3600 (keep); refresh-token rotation on, reuse interval 10 s; inactivity timeout off.
2. Authentication -> URL Configuration: Site URL `https://hq.bcn-services.com`; Redirect URLs include `https://hq.bcn-services.com/**` (this covers `https://hq.bcn-services.com/reset`).
3. Authentication -> Email Templates -> Reset Password: the link must land on `https://hq.bcn-services.com/reset`.
4. Reset mail needs working SMTP for the HQ project. Supabase's built-in sender is free but heavily limited and historically only mails organization team members, so Brandon's reset may not arrive: confirm in the dashboard (Authentication -> SMTP). Free routes, in order: (a) skip email for Brandon and set his password by hand (Authentication -> Users -> his row -> reset or edit), (b) your existing Google Workspace SMTP, (c) a free-tier transactional sender such as Resend (check its current free limits first). Any paid SMTP plan is a fee: do not buy one for two users.

### 13. Droplet env (`/srv/hq/env`; values typed by Nate)

```bash
ssh root@104.236.20.89
nano /srv/hq/env      # NAME=value, no quotes; add the names below
```

| Name                                                             | Where the value comes from                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_TOKEN_KEY`                                                  | **set first.** `openssl rand -hex 32` on your laptop, pasted into `nano`. Server-only, at least 32 characters. Unset = `/mcp` answers 503. Rotating it signs every connector out once.                                                                                                                                                                                                                     |
| `NODE_EXTRA_CA_CERTS`                                            | path to a PEM of the Supabase root CA(s), e.g. `/srv/hq/supabase-ca.pem` (mode 644). Download it from the HQ and platform projects' dashboards (Project Settings -> Database -> SSL Configuration); if the two projects use different roots, concatenate both into one file. Without it the ops panel shows "unavailable" (L6). Also add the same line to `/srv/hq/jobs.env` (the jobs use `verify-full`). |
| `HQ_OS_DIR`                                                      | `/srv/hq/os`                                                                                                                                                                                                                                                                                                                                                                                               |
| `MERCURY_INVOICING`                                              | `1` **only if you buy the paid Mercury plan** that includes the Invoicing API. Free route: leave unset; billing status then falls back to the last matching incoming transaction plus the client's `billing_note`.                                                                                                                                                                                         |
| `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` | step 14. The private key is the PEM on one line with literal `\n` between lines.                                                                                                                                                                                                                                                                                                                           |

Also in `/srv/hq/jobs.env`: `HQ_OS_DIR=/srv/hq/os`. `/srv/hq/env` must also keep `NODE_OPTIONS=--dns-result-order=ipv4first` if it was set at go-live (Mercury and Places allow IPv4 only). Then `/srv/hq/env` stays `hq:hq`, mode 600 (the app reads it), and `/srv/hq/jobs.env` becomes root-owned: `chown root:root /srv/hq/jobs.env && chmod 600 /srv/hq/jobs.env`. systemd reads the unit's `EnvironmentFile` as root before dropping to the dynamic user, and this closes the app user's read of the jobs database password (M2).

### 14. Google Calendar (free)

Google Cloud console, the bcns project -> IAM & Admin -> Service Accounts -> create one (no roles) -> Keys -> Add key -> JSON; enable the Google Calendar API in APIs & Services. From the JSON, `client_email` becomes `GOOGLE_SA_EMAIL` and `private_key` becomes `GOOGLE_SA_PRIVATE_KEY`; type them into `/srv/hq/env` and delete the downloaded file. In Google Calendar, open the bcns calendar -> Settings and sharing -> Share with specific people: add the service-account email with "See all event details", and add Brandon. The calendar's ID (same page, "Integrate calendar") becomes `GOOGLE_CALENDAR_ID`. Brandon sees only events whose attendees include his HQ profile email.

### 15. Claude tokens, credentials, os clone (before the new `hq-job@` unit is installed)

All three credential files (`claude-nate`, `claude-brandon`, `os-deploy-key`) must exist before step 19 installs the new unit, or every `hq-job@` instance fails with 243/CREDENTIALS. `qualify` and cron work use Nate's token; a deliverable runs with its requester's handle token.

1. The claude CLI at 2.1.312 or later, as root on the droplet: `npm install -g @anthropic-ai/claude-code; claude --version`.
2. **Nate's token** (his existing subscription, no extra cost): in your own terminal run `claude setup-token`, then on the droplet:
   ```bash
   install -d -m 0700 -o root /srv/hq/creds
   install -m 0600 -o root /dev/stdin /srv/hq/creds/claude-nate      # paste token, Ctrl-D
   ```
3. **Brandon's token**: Brandon runs `claude setup-token` on his own machine. It needs his own Claude Pro or Max plan, which is a paid fee and his; there is no free route for his runs under Anthropic's terms. He types it at this prompt himself, never into a chat:
   ```bash
   install -m 0600 -o root /dev/stdin /srv/hq/creds/claude-brandon
   ```
4. **os deploy key and clone.** On the droplet, generate a key, register it, clone, then keep it only as a credential:
   ```bash
   ssh-keygen -t ed25519 -N '' -f /root/os-deploy-key -C hq-os-deploy
   cat /root/os-deploy-key.pub        # add as a deploy key WITH write access: GitHub -> bcn-services/bcns-os -> Settings -> Deploy keys
   install -m 0600 -o root /root/os-deploy-key /srv/hq/creds/os-deploy-key
   install -d -m 0755 /srv/hq/jobs-state
   ssh-keyscan github.com > /srv/hq/jobs-state/known_hosts           # pinned host key, StrictHostKeyChecking=yes
   ssh-keygen -lf /srv/hq/jobs-state/known_hosts                     # compare with the fingerprints on docs.github.com (GitHub's SSH key fingerprints)
   GIT_SSH_COMMAND='ssh -i /root/os-deploy-key -o IdentitiesOnly=yes -o UserKnownHostsFile=/srv/hq/jobs-state/known_hosts -o StrictHostKeyChecking=yes' git clone git@github.com:bcn-services/bcns-os.git /srv/hq/os
   shred -u /root/os-deploy-key /root/os-deploy-key.pub
   ```
5. Permissions the unit relies on (from the `hq-job@.service` header):
   ```bash
   git -C /srv/hq/os config core.sharedRepository group
   chown -R hq:hq /srv/hq/os
   mkdir -p /srv/hq/jobs-state/claude-home && chown -R hq:hq /srv/hq/jobs-state && chmod -R g+rwX /srv/hq/jobs-state
   find /srv/hq/jobs-state -type d -exec chmod g+s {} +      # qualify and deliverable run as different dynamic users
   chgrp -R hq /srv/hq/os/clients /srv/hq/os/.git && chmod -R g+rwX /srv/hq/os/clients /srv/hq/os/.git
   find /srv/hq/os/clients /srv/hq/os/.git -type d -exec chmod g+s {} +
   ```
6. `CLAUDE_CODE_OAUTH_TOKEN` no longer belongs in `jobs.env`: remove it if step 6 added it. `/srv/hq/claude-home` is unused now.

Recovery: if a deliverable run changes `.git` metadata the job writes `/srv/hq/jobs-state/git-meta-changed` and every later run refuses. Inspect `/srv/hq/os/.git/config`, `info/` and `hooks/`, then `rm /srv/hq/jobs-state/git-meta-changed`. If a run is SIGKILLed for memory: `systemctl edit hq-job@deliverable` and set `MemoryMax=768M`. The os clone is never pulled; after a non-fast-forward push failure, refresh it as root with the credential key (`GIT_SSH_COMMAND='ssh -i /srv/hq/creds/os-deploy-key -o IdentitiesOnly=yes -o UserKnownHostsFile=/srv/hq/jobs-state/known_hosts -o StrictHostKeyChecking=yes' git -c safe.directory=/srv/hq/os -C /srv/hq/os pull --ff-only`), then repeat the `chown` / `chgrp` / `chmod` lines of item 5.

### 16. The `hq_jobs` database role (HQ SQL Editor)

Jobs stop using the owner connection. Type a long random password where marked; this block is the 0032 footer plus the 0034 footer (no value is written down here):

```sql
create role hq_jobs login password '<type a long random password>' nobypassrls nosuperuser;
grant usage on schema public to hq_jobs;
grant select, insert, update on businesses, search_grid to hq_jobs;
grant select, insert on events to hq_jobs;
grant usage, select on sequence events_id_seq to hq_jobs;
grant select, update on deliverables to hq_jobs;
grant select on profiles, clients to hq_jobs;
create policy jobs_all    on businesses  for all    to hq_jobs using (true) with check (true);
create policy jobs_all    on search_grid for all    to hq_jobs using (true) with check (true);
create policy jobs_select on events      for select to hq_jobs using (true);
create policy jobs_insert on events      for insert to hq_jobs with check (true);
create policy jobs_select on deliverables for select to hq_jobs using (true);
create policy jobs_update on deliverables for update to hq_jobs using (true) with check (true);
create policy jobs_select on profiles    for select to hq_jobs using (true);
create policy jobs_select on clients     for select to hq_jobs using (true);
grant select, insert, delete on uptime_checks to hq_jobs;
create policy jobs_select on uptime_checks for select to hq_jobs using (true);
create policy jobs_insert on uptime_checks for insert to hq_jobs with check (true);
create policy jobs_delete on uptime_checks for delete to hq_jobs using (true);
```

Check, in the same editor (read-only; the editor's `postgres` user is not a member of `hq_jobs`, so `set role hq_jobs` fails there, and never test with a `delete`):

```sql
select has_table_privilege('hq_jobs','businesses','select')      as biz_select,                    -- true
       has_table_privilege('hq_jobs','businesses','delete')      as biz_delete_should_be_false,    -- false
       has_table_privilege('hq_jobs','finance_inputs','select')  as finance_should_be_false,       -- false
       has_table_privilege('hq_jobs','uptime_checks','insert')   as uptime_insert,                 -- true
       has_table_privilege('hq_jobs','uptime_checks','update')   as uptime_update_should_be_false; -- false
```

The jobs `DATABASE_URL` for step 19 is the session pooler with the project-ref suffix on the user, otherwise "Tenant or user not found":

```
postgresql://hq_jobs.knmgyxlrhjxaydliucbs:<password>@<pooler-host>:5432/postgres?sslmode=verify-full
```

### 17. Clients refresh (HQ SQL Editor)

Mercury customer ids come from the Invoicing API (the paid plan, step 13). On the droplet, read the key without printing it:

```bash
export MERCURY_KEY=$(grep '^MERCURY_KEY=' /srv/hq/env | cut -d= -f2-)
curl -4 -s -H "Authorization: Bearer $MERCURY_KEY" https://api.mercury.com/api/v1/ar/customers | head -c 3000
unset MERCURY_KEY
```

If it returns 403 (no paid plan), skip the ids and put the payer name exactly as it appears on the client's incoming Mercury transactions into `aliases` through the Edit form (one per line). Without invoicing, payments match only that transaction counterparty name; with `MERCURY_INVOICING=1` the customer id matches invoices. Free route (default), no customer id:

```sql
update clients set billing_source='mercury', monthly_rate_cents=10000 where slug='technology-associates';
update clients set billing_source='mercury', monthly_rate_cents=11000 where slug='sb';
```

Paid plan only (`MERCURY_INVOICING=1`), instead of the two lines above:

```sql
update clients set billing_source='mercury', mercury_customer_id='<TA id from Mercury /ar/customers>', monthly_rate_cents=10000 where slug='technology-associates';
update clients set billing_source='mercury', mercury_customer_id='<SB id>', monthly_rate_cents=11000 where slug='sb';
```

(The Technology Associates row's slug is `technology-associates`.) After the deploy, add the Technology Associates notes through the Clients page Edit form (admin only): ATB rebuild $3,000 unpaid; INV-4 $1,000 due Dec 1.

### 18. Merge (pre-merge steps 10-17 done first)

Per PR, in this order: #181, #182, #183, #184, #185, #186, #188 (G Leads + Pitch), then this docs PR (#187 H). A docs-only PR matches no deploy path, so H deploys nothing.

```bash
GITHUB_TOKEN= gh pr ready 181 -R bcn-services/bcns
GITHUB_TOKEN= gh pr merge 181 --merge -R bcn-services/bcns
# repeat for 182 183 184 185 186, then 188, then 187 (this PR, H)
GITHUB_TOKEN= gh run watch -R bcn-services/bcns
```

Each `apps/hq` merge redeploys sb, connect, mcp and hq. The workflow's concurrency group keeps only the newest pending run (`cancel-in-progress: false`), so rapid merges collapse and every deploy builds the merge-commit tree: the end state is the same. If only hq needs a redeploy: `GITHUB_TOKEN= gh workflow run deploy-app.yml -f slug=hq -R bcn-services/bcns`. The deploy does not install systemd units; step 19 does.

### 19. After the merge

```bash
scp infra/hq-job@.service infra/hq-source.timer infra/hq-qualify.timer infra/hq-deliverable.timer infra/hq-uptime.service infra/hq-uptime.timer root@104.236.20.89:/root/
ssh root@104.236.20.89
cp /root/hq-job@.service /root/hq-*.timer /root/hq-uptime.service /etc/systemd/system/
systemctl daemon-reload
```

Switch `DATABASE_URL` in `/srv/hq/jobs.env` to the `hq_jobs` URL from step 16, and make sure it also has `NODE_EXTRA_CA_CERTS` and `HQ_OS_DIR`. Run each job once by hand before enabling its timer:

```bash
systemctl start hq-job@qualify;     journalctl -u hq-job@qualify -n 40 --no-pager
systemctl start hq-uptime.service;  systemctl show hq-uptime.service -p Result     # Result=success
journalctl -u hq-uptime -n 20 --no-pager
systemctl show hq-job@qualify -p Result,MemoryPeak       # Result=success; under the 384M cap
systemctl enable --now hq-source.timer hq-qualify.timer hq-deliverable.timer hq-uptime.timer
systemctl list-timers 'hq-*'                             # must list all FOUR timers
```

The qualify run promotes real leads (up to 50 per day). In the HQ SQL Editor: `select target, ok, status, checked_at from uptime_checks order by checked_at desc limit 10;` shows sb, connect, mcp, hq and ta. A pitch or quote button press (#188) inserts a `deliverables` row; the `hq-deliverable` timer picks it up within a minute, and `journalctl -u hq-job@deliverable` shows the run.

Smoke test:

```bash
curl -s https://hq.bcn-services.com/api/health                      # {"ok":true,"app":"hq"}
curl -si -X POST https://hq.bcn-services.com/mcp | head -3          # 401 with a WWW-Authenticate header (no bearer: refused before any token lookup)
curl -si -X POST -H 'Authorization: Bearer probe' https://hq.bcn-services.com/mcp | head -1   # 401 = MCP_TOKEN_KEY set; 503 = unset or token store down
curl -sI https://hq.bcn-services.com/login | grep -i 'content-security-policy\|strict-transport'
curl -s https://hq.bcn-services.com/.well-known/oauth-protected-resource   # names hq.bcn-services.com
```

Sign in at `https://hq.bcn-services.com/login` as Nate and as Brandon, and try "Forgot password" once. **Reconnect each Claude connector once** (claude.ai -> Settings -> Connectors -> bcns HQ, or `/mcp` in Claude Code): 0031 dropped the old in-memory tokens. After that, tokens persist across deploys and restarts; reconnect only when a call returns 401.

### 20. os: the `/hq` skill (an os edit; Nate-run)

In `~/os/skills/hq/SKILL.md`, replace the line-14 note that every HQ deploy or restart drops the tokens with "tokens persist across deploys; reconnect only on a 401", and list the new tools (`add_task_note`, `list_board`, `move_track`, `update_track`, `propose_client`). Also replace the done rule at line 18 ("only on tasks owned by claude; HQ refuses done on a human's task"), which is stale: an admin may close any task, staff only their own and claude's. Add no `claude mcp add` line: step 9 says claude.ai connectors already load into Claude Code. The orchestrator rule change in `~/os/agents/window-orchestrator.md` stays out of v2.

### 21. Seed the GTM tracks (optional; idempotent)

The v1 go-live log did not confirm the first seed. Check in the HQ SQL Editor: `select count(*) from tasks where source = 'tracker';` (13 expected after v1). `seed-gtm` now imports the Build Map tracks by name, adds list items only if none exist, and back-fills `track_id` on tracker tasks, so a re-run is safe. Dry run, then apply with values typed at the prompt:

```bash
pnpm --filter @bcn-services/hq seed-gtm
export NEXT_PUBLIC_SUPABASE_URL=https://knmgyxlrhjxaydliucbs.supabase.co
read -rs "NEXT_PUBLIC_SUPABASE_ANON_KEY?anon key: "; export NEXT_PUBLIC_SUPABASE_ANON_KEY
export HQ_SEED_EMAIL=nseluga@bcn-services.com
read -rs "HQ_SEED_PASSWORD?password: "; export HQ_SEED_PASSWORD
pnpm --filter @bcn-services/hq seed-gtm --apply
unset NEXT_PUBLIC_SUPABASE_ANON_KEY HQ_SEED_PASSWORD
```

(zsh syntax.)

### 22. Monthly finance freeze (dropped in v2)

The v1 "Freeze <month>" button went with the Numbers rebuild (#182); nothing reads or writes `finance_snapshots` now. No action. Drop the table in a later migration if it stays unused.

### 23. Parallel week with Brandon

Old pipeline stays on (Cloud Scheduler, launchd, digest); `HQ_LATE_STAGES` stays unset. Checklist:

- [ ] Brandon signs in to HQ and works the call pool from Today (no Sheet, no digest) for a full week, 5 working days.
- [ ] Every outcome he logs shows in Leads; the done-count moves.
- [ ] Nate approves at least one proposal with `a` and rejects one with `r`; a stage change from Claude arrives only as a proposal, and Brandon (staff) cannot approve.
- [ ] `hq-source.timer` and `hq-qualify.timer` fired each weekday: Numbers -> Ops shows the runs, no failures; `hq-uptime.timer` shows no red target.
- [ ] Places calls this month are under the cap (Numbers -> Ops).
- [ ] `/srv/hq/env` still `600` owned by `hq`; `/srv/hq/jobs.env` still `600` owned by `root`.
- [ ] Weekly finance computes itself; spot-check one week against the old numbers.
- [ ] D2 check run (below) and every row is `ok`, or the exceptions are understood.
- [ ] Brandon agrees to switch off.

**D2: Sheet vs HQ (handed, not run).** Export the Sheet's Leads tab as CSV, import it into a scratch table `sheet_import` (HQ dashboard -> Table editor -> New table -> Import CSV, every column text), run the two queries below in the SQL Editor, then `drop table sheet_import;`.

```sql
-- D2: Sheet (Leads tab) vs HQ. Run in the HQ SQL editor after importing the Leads tab
-- as CSV into a scratch table `sheet_import` (Table editor -> New table -> Import CSV,
-- every column text). Read-only against businesses/calls; drop sheet_import afterwards.

-- 1. Row counts (join key = Places place_id, present in both)
select
  (select count(*) from sheet_import)                                                 as sheet_rows,
  (select count(*) from sheet_import s join businesses b on b.place_id = s.place_id)  as in_hq,
  (select count(*) from sheet_import s
     where not exists (select 1 from businesses b where b.place_id = s.place_id))    as sheet_only,
  (select count(*) from businesses where stage <> 'sourced')                          as hq_worked;

-- 2. Latest call per business, Sheet vs HQ (problems first)
with last_call as (
  select distinct on (business_id) business_id, at, outcome,
         count(*) over (partition by business_id) as hq_calls
  from calls
  order by business_id, at desc
)
select s.business_name, s.place_id,
       nullif(s.call_count, '')          as sheet_calls,
       nullif(s.last_contact, '')::date  as sheet_last,
       s.last_outcome                    as sheet_outcome,
       coalesce(c.hq_calls, 0)           as hq_calls,
       c.at::date                        as hq_last,
       c.outcome                         as hq_outcome,
       case
         when b.id is null                                    then 'MISSING IN HQ'
         when nullif(s.last_contact, '') is null              then 'ok (never called)'
         when c.at is null                                    then 'NO HQ CALL'
         when nullif(s.last_contact, '')::date > c.at::date   then 'SHEET NEWER'
         else 'ok'
       end                               as status
from sheet_import s
left join businesses b on b.place_id = s.place_id
left join last_call  c on c.business_id = b.id
order by (case when b.id is null or c.at is null or nullif(s.last_contact, '')::date > c.at::date then 0 else 1 end), s.business_name;
```

### 24. Cutover

Do in this order, same day.

- [ ] Allow late stages and restart (tokens persist, so connectors stay signed in):
  ```bash
  ssh root@104.236.20.89 "echo 'HQ_LATE_STAGES=1' >> /srv/hq/env && systemctl restart bcns-app@hq"
  ```
- [ ] Pause Cloud Scheduler in GCP project `bcns-leads`, region `us-central1` (console: https://console.cloud.google.com/cloudscheduler?project=bcns-leads -> select every `clock-*` job -> Pause). The jobs are `clock-poll` (hourly tick: poll, pitch, quote, onboard, notify, qualify), `clock-source` (source + heartbeat), `clock-personalize` (the 12:30 UTC digest) and possibly `clock-touch`; list first, then pause each name that appears:
  ```bash
  gcloud scheduler jobs list --project bcns-leads --location us-central1
  gcloud scheduler jobs pause <name> --project bcns-leads --location us-central1
  ```
- [ ] Digest stopped: it ran from `clock-personalize` via `clock.yml`; confirm no email arrives the next weekday at 12:30 UTC.
- [ ] Disable the GitHub Actions clock (which also carries the heartbeat job):
  ```bash
  GITHUB_TOKEN= gh workflow disable clock.yml -R bcn-services/bcns-internal
  ```
- [ ] Unload the laptop pull and stop it returning at next login:
  ```bash
  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.bcns.leads-pull.plist
  mv ~/Library/LaunchAgents/com.bcns.leads-pull.plist ~/Library/LaunchAgents/com.bcns.leads-pull.plist.disabled
  launchctl print gui/$(id -u)/com.bcns.leads-pull     # must fail with "Could not find service"
  ```
- [ ] Sheet and tracker artifact: leave read-only, stop opening them. `/leads` (os skill) is retired or shrunk to a CLI over HQ, Nate's call.
- [ ] After one quiet week: delete the paused Cloud Scheduler jobs (`gcloud scheduler jobs delete <name> --project bcns-leads --location us-central1`), revoke the GitHub PAT (GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> the token with resource owner `bcn-services` and Actions read/write on `bcns-internal` -> Delete), then archive:
  ```bash
  GITHUB_TOKEN= gh repo archive bcn-services/bcns-internal --yes
  ```
  The Supabase project stays: it is HQ's database.

### 25. Tickets: platform database, `hq_tickets` role (project `cnsxbglhredokjbvudfd`) — done 2026-10-29

Two-way ticket sync (`jobs/tickets.mjs`, PRs: A HQ job + 0036, B HQ UI/MCP resolution stacked on A, C platform migration + Connect view, D TA migration). **Migrations first, merges after**: steps 25-27 push, step 28 onward merges. Laptop commands run from a checkout of the C branch `ticket-sync-platform` (the CLI only sees migrations on disk), after `pnpm install --frozen-lockfile`:

```bash
supabase link --workdir platform --project-ref cnsxbglhredokjbvudfd   # only if platform/supabase/.temp/project-ref is missing
supabase db push --workdir platform --dry-run      # expect only the ticket-resolution migration (tickets.resolution, ops.hq_tickets_pull / hq_ticket_resolve, role hq_tickets); read anything else
supabase db push --workdir platform
```

Set the role's password by hand. Generate (URL-safe: no `%`, `#`, `@`) and copy it:

```bash
openssl rand -hex 24 | pbcopy
```

Platform dashboard -> SQL Editor, typing the password between the quotes:

```sql
alter role hq_tickets password '<paste>';
```

`PLATFORM_TICKETS_URL` for step 29 (session pooler; the user carries the project ref, otherwise "Tenant or user not found"):

```
postgresql://hq_tickets.cnsxbglhredokjbvudfd:<password>@<pooler-host>:5432/postgres?sslmode=verify-full
```

Check (read-only, same editor): `select has_function_privilege('hq_tickets','ops.hq_tickets_pull()','execute'), has_table_privilege('hq_tickets','data.tickets','select');` is `true, false`.

### 26. Tickets: Technology Associates database — done 2026-10-29

Take the TA project ref and pooler host from the TA Supabase dashboard (Connect -> Session pooler); nothing here looks them up. Merge the TA PR `hq-tickets` (migration 0016; the TA CI runs it on a shadow stack, and `deploy.yml` applies it with `supabase db push` on the merge to `main`):

```bash
GITHUB_TOKEN= gh pr ready <n> -R bcn-services/bcns-client-technology-associates
GITHUB_TOKEN= gh pr merge <n> --merge -R bcn-services/bcns-client-technology-associates
GITHUB_TOKEN= gh run list --workflow deploy.yml -L 1 -R bcn-services/bcns-client-technology-associates   # green: 0016 is applied
```

Then, in the TA dashboard SQL Editor, type the password (generate it as in step 25):

```sql
alter role hq_tickets password '<paste>';
```

`TA_TICKETS_URL` for step 29:

```
postgresql://hq_tickets.<ta-project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=verify-full
```

If `hq_tickets` does not exist after the deploy, or 0016's header lists hand-run grants (TA migrations grant nothing, `DEPLOY.md`), run those lines in the same editor first.

### 27. HQ database: push 0036 and grant `hq_jobs` on `tasks` — done 2026-10-29

From a checkout of `ticket-sync-job` (PR A), after steps 11 and 16:

```bash
supabase migration list --workdir apps/hq          # 0036 Local only
supabase db push --workdir apps/hq --dry-run       # must list exactly 0036
supabase db push --workdir apps/hq
```

0036 adds `tasks.resolution` and `tasks.synced_at`. Its footer is hand-run SQL (HQ SQL Editor); without it every `tickets` run fails "permission denied":

```sql
grant select, insert, update on tasks to hq_jobs;
create policy jobs_select on tasks for select to hq_jobs using (true);
create policy jobs_insert on tasks for insert to hq_jobs with check (true);
create policy jobs_update on tasks for update to hq_jobs using (true) with check (true);
```

Check: `select has_table_privilege('hq_jobs','tasks','insert') as ins, has_table_privilege('hq_jobs','tasks','delete') as del_should_be_false;` is `true, false`.

### 28. Merge the HQ PRs A then B — done 2026-10-29

A touches `apps/hq/**`, so the merge redeploys sb, connect, mcp and hq (step 18). B is stacked on A (its base is `ticket-sync-job`), so after A merges, retarget B to `main` and confirm before merging it, otherwise B merges into the dead branch and never reaches `main`. Merge A **without** `--delete-branch`: deleting the base auto-closes B, and GitHub refuses to reopen or retarget a closed PR whose base is gone (#191 died this way; #201 replaced it). Delete `ticket-sync-job` after B is in. Always `--merge`, never squash:

```bash
GITHUB_TOKEN= gh pr ready <A> -R bcn-services/bcns && GITHUB_TOKEN= gh pr merge <A> --merge -R bcn-services/bcns
GITHUB_TOKEN= gh pr edit <B> --base main -R bcn-services/bcns
GITHUB_TOKEN= gh pr view <B> --json baseRefName -R bcn-services/bcns     # must say "main"
GITHUB_TOKEN= gh pr ready <B> -R bcn-services/bcns && GITHUB_TOKEN= gh pr merge <B> --merge -R bcn-services/bcns
curl -s https://hq.bcn-services.com/api/health     # {"ok":true,"app":"hq"}
```

Rekey the open tasks the old fire button made (`ops:ticket:<id>`), or the job opens a duplicate `ticket:platform:<id>` beside each. Run this in the HQ SQL Editor after A is deployed (the old code keeps making `ops:ticket:` keys until then) and **before the first `systemctl start hq-job@tickets` in step 29**, since that manual start creates the duplicates as well as the timer. The id starts at character 12, after the 11-character prefix `ops:ticket:`. The `not exists` guard skips a row whose `ticket:platform:<id>` task is already open, which the unique index `tasks_alert_key_open_idx` would otherwise reject:

```sql
select count(*) from tasks where alert_key like 'ops:ticket:%' and status <> 'done';
update tasks set alert_key = 'ticket:platform:' || substr(alert_key, 12)
  where alert_key like 'ops:ticket:%' and status <> 'done'
    and not exists (select 1 from tasks t2
      where t2.alert_key = 'ticket:platform:' || substr(tasks.alert_key, 12) and t2.status <> 'done');
select count(*) from tasks where alert_key like 'ops:ticket:%' and status <> 'done';   -- rows the guard skipped
```

Mark any task the last query still counts done by hand (its ticket already has an open `ticket:platform:` task). Done tasks keep their old key; a later fire for those ticket ids makes a fresh task, which is the pre-sync behaviour.

### 29. Droplet: the `tickets` timer — done 2026-10-29

Done with a one-off wizard (`~/.claude/skills/wizard`): it generated each `hq_tickets` password, put the `alter role` statement on the clipboard for the project's SQL editor, probed the login through the session pooler, then wrote both URLs to `jobs.env` over ssh stdin. Nothing secret crossed a transcript. Session pooler host for both projects is `aws-0-us-east-1.pooler.supabase.com`; `aws-1-…` answers "tenant/user not found". First real run: `{"pulled":7,"created":5,"closed":0,"pushed":0,"failed":[]}`.

```bash
scp infra/hq-tickets.timer root@104.236.20.89:/root/
ssh root@104.236.20.89
cp /root/hq-tickets.timer /etc/systemd/system/
```

Append the two URLs from steps 25 and 26 to `/srv/hq/jobs.env` by typing them in an editor (`nano /srv/hq/jobs.env`; variable names only here, values never in a transcript): `PLATFORM_TICKETS_URL=` and `TA_TICKETS_URL=`. The file stays `600` owned by root. A missing name just skips that source with one log line. Run once by hand, then enable:

```bash
systemctl daemon-reload
systemctl start hq-job@tickets
journalctl -u hq-job@tickets -n 50 --no-pager      # {"pulled":N,"created":N,...,"failed":[]}
systemctl enable --now hq-tickets.timer
systemctl list-timers 'hq-*'                       # five timers now
```

### 30. Merge the platform / Connect PR (C) — done 2026-10-29

After steps 25 and 29 (the function and role exist and the job runs). C touches `apps/connect/**`, so it redeploys sb, connect and mcp:

```bash
GITHUB_TOKEN= gh pr ready <C> -R bcn-services/bcns && GITHUB_TOKEN= gh pr merge <C> --merge -R bcn-services/bcns
```

### 31. Tickets: live acceptance — in progress (first run 2026-10-29: 5 TA tickets became tasks; resolution round-trip not yet exercised)

- [ ] Submit a ticket in Connect (Support) and one in the TA app; within one timer run (15 minutes, or `systemctl start hq-job@tickets`) both appear in HQ Work as `Ticket: <subject>` tasks (owner nate, area ops, client set), with the ticket body in the task body.
- [ ] Run it again: no duplicate tasks.
- [ ] Mark one task done with a Resolution typed in the Work detail, and one through Claude's `update_task` with `resolution`. After the next run each client's own view shows the resolution (Connect Support: the reply under the ticket; TA: a `bcns` message) and the ticket is closed.
- [ ] Close a third ticket at the source: after the next run its HQ task is done with no push (journal shows `pushed` unchanged).
- [ ] Pressing the fire button on an urgent ticket in Numbers -> Ops opens (or returns) the same task the job made; it never makes a second one after the ticket is done.

### Rollback

HQ is additive on the DB, so the old pipeline can resume against it. Pause is reversible, delete is not, which is why step 24 pauses first.

```bash
GITHUB_TOKEN= gh workflow enable clock.yml -R bcn-services/bcns-internal
gcloud scheduler jobs resume <name> --project bcns-leads --location us-central1      # each paused job
mv ~/Library/LaunchAgents/com.bcns.leads-pull.plist.disabled ~/Library/LaunchAgents/com.bcns.leads-pull.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bcns.leads-pull.plist
ssh root@104.236.20.89 "sed -i '/^HQ_LATE_STAGES=/d' /srv/hq/env && systemctl restart bcns-app@hq && systemctl disable --now hq-source.timer hq-qualify.timer hq-deliverable.timer hq-uptime.timer"
```

If the repo was already archived: `GITHUB_TOKEN= gh repo unarchive bcn-services/bcns-internal --yes`. If the scheduler jobs were deleted, recreate them with `scripts/scheduler-setup.sh` in `bcns-internal`.

## After each HQ deploy

Connectors stay signed in: tokens persist in `mcp_tokens`, so a deploy, `systemctl restart bcns-app@hq` or a droplet reboot no longer signs "bcns HQ" out (reconnect only when a call returns 401, e.g. after rotating `MCP_TOKEN_KEY` or signing out of HQ). A password reset, or signing out of HQ, revokes every GoTrue session, so each MCP connector (claude.ai, Claude Code) must authenticate once afterwards; this is expected, not a bug. Re-check `curl -s https://hq.bcn-services.com/api/health` and that `systemctl list-timers 'hq-*'` still shows all the timers (source, qualify, deliverable, uptime, plus tickets once step 29 is done). A deploy never installs or changes systemd units; copy changed `infra/hq-*` files and `daemon-reload` by hand.

## Follow-ups and decisions left for Nate

- Branch rewrite, your call (or leave): commits `347b28d` and `fdd239d` carry an `Opus 5.5` Co-Authored-By trailer instead of `Fable 5.1`.
- PR #171's body miscounts Minors (says 7 fixed, 1 dropped; actual 8 fixed, 0 dropped). Fix with `GITHUB_TOKEN= gh pr edit 171 -R bcn-services/bcns --body-file <file>` or leave.
- "No answer" on a call sets the next contact +1 business day ET. For +2 change `n` in `nextBusinessDay` (`apps/hq/lib/leads.ts`).
- Open Minors on #174: an ops task shown only under Fires on Today cannot be marked done there (use Work); `taskFires` errors are silent; Today fetches proposals twice and 500s on one failed read; `listTasks` caps at 500.
- Open Minors from v2: the deliverable git guard cannot see a planted `.git` gitfile (the job is safe through pinned `GIT_DIR`; a tamper marker fails one queued row per tick); the Money month boundary is UTC (C); a staff member echoing an unchanged owner is refused, `update_task` cannot unassign, and a partial `seed-gtm` run does not back-fill (E).
- Today (Nate) reuses Work's simpler `TrackCard`; the prototype's card with progress bar, owner chip and "n of m" is not built. Your call.
- Process: `dt-review` edited `STANDARDS.md` against its read-only brief in two items (reverted). Suggested `~/os/agents/dt-review.md` line: "write only your report file; STANDARDS suggestions go in the report."
