# bcns-data — Requirements

Shared data platform every bcns data client runs on. SB (Saunaboy Command Center) is client #1.
Produced by a grill session 2026-09-11/12; Fable designs against this document. Anything not here is
a design-session call, not a requirement.

## Purpose

bcns sells a per-client dashboard on top of connectors that read a client's own systems (Shopify,
Meta Ads, Monday.com, Google Meet notes, …). The dashboard is priced per deal; the connectors are
the asset. Client #1 pays for a connector once; every later client on that source costs rows, not
code. The platform therefore has one job: make the marginal cost of client #2+ near zero, and never
let a per-client decision leak into shared infrastructure.

Economics this must hold: one Supabase Pro project ($25/mo) + one scale-to-zero worker (~$0–5/mo)
+ one Spaces bucket ($5/mo) ≈ fixed regardless of client count. SB pays $100/mo. Every requirement
below is checked against "does this stay near-fixed at 1,000 clients."

## Decided

Each with its one-line why. Re-open only on a concrete failure.

**Platform shape (2026-09-15; plan and chunks in `bcn-services/bcns` → `docs/architecture/platform-v1.md`)**
- One repo: this codebase merges into `bcn-services/bcns` as `platform/` + `packages/data-client`,
  with the hub, MCP server and Deluxe client apps under `apps/`. *Atomic changes across schema,
  client, hub and apps; agent sessions see the whole system; the UI kit already lives there.*
- One domain: `connect.bcn-services.com` (hub), `mcp.bcn-services.com`, `<slug>.bcn-services.com`
  per client app. Marketing stays on Vercel and only links to the hub. *Product on the real brand;
  hub down never takes the site down.*
- One login: Supabase session cookie on `.bcn-services.com`. *No second sign-in between hub and app.*
- One process per app (own unit, port, memory cap, deploy). Never per-client modules in one
  process. *A crash or bad deploy stays inside one app.*
- Thin hub, no token entry: pasted credentials stay a bcns CLI task. *A token form is the one
  frontend that adds risk without adding self-serve.*
- v1 = OAuth connect flows built and the Shopify, Meta and Monday apps submitted. A source's
  Connect button goes live as its approval lands; before that it requests a connection from bcns.
  *Third-party review is calendar-bound; the build is not.*
- Agent and software access = hub credential page + hosted MCP server over `api.*_v1`. No own REST
  facade. *PostgREST is already the endpoint; MCP is the plug agents accept.*
- The merge changes no behaviour in any of the three repos, proven against baselines captured
  first. *Everything works today.*

**Tenancy and access**
- One shared Supabase project; `client_id` on every row; RLS is the tenant boundary. *One schema,
  one migration, one project to back up; isolation is a policy, not a database.*
- Dashboard users are Supabase Auth users of the shared project. A `memberships(user_id,
  client_id, role)` table, surfaced as JWT custom claims `client_id` and `role` by an auth hook.
  RLS compares the claim. *One comparison per policy, no subquery per row.*
- Roles: `member` (read all, upload/tag media, trigger dashboard actions) and `owner` (also
  add/remove users). No viewer role, no per-panel permissions. *SB's reference shows no admin
  surface; add roles when a client needs one.*
- ~~No platform frontend~~ (superseded 2026-09-15 by the thin hub above). Still true: no
  self-signup; bcns creates the first owner. The hub's owner invites the rest through an Edge
  Function holding the service role. *Self-signup is a sales step, not a product step.*
- bcns pastes source credentials into a token table readable only by the service role.
  *Onboarding is a bcns task; a token UI is a frontend.*
- Service-role key lives only in the platform worker and on bcns's machine. Dashboards hold the
  anon key + user JWT. *Service role bypasses RLS.*

**Data shape**
- Pipeline: source → one raw table → normalize → canonical → versioned views.
- Canonical set: `customers`, `jobs`, `messages`, `money`, `media`, `products`, `daily_metrics`,
  `records` (catch-all: `kind` + `attributes` jsonb). `attributes` jsonb on every canonical table.
- New-data rule: fits → map; doesn't fit → `records`/`daily_metrics`; second client with the same
  `kind` → promote to canonical; never a per-client table; normalize only what a dashboard shows.
- Event-vs-aggregate rule: `money` holds cash events with an `external_id` (orders, refunds,
  payouts); `daily_metrics` holds anything reported per day (spend, impressions, CPC, sessions).
  A number is written once. Ad spend lives in `daily_metrics` only. *Two homes drift; every ads
  source reports aggregates, every commerce source reports events.*
- `daily_metrics` grain: `(client_id, source, day, entity_kind, entity_id, metric, value)`.
  Campaigns and creatives are entities.
- Money stored as integer minor units + ISO currency code per row.
- Time: `clients.timezone` per client; every day-bucketed row uses the client's local day; raw keeps
  source timestamps in UTC. *"Yesterday" must match what the owner sees in Shopify admin.*
- Scale: `client_id` leads every index and unique key; dashboards read only `api.*_v1` views; one
  raw table partitioned by month; upserts unique on `(client_id, source, external_id)`; connectors
  don't know their scheduler.
- Raw is kept forever in Postgres while the client is active. *Promoting a `records` kind to
  canonical needs history, and only raw has it; a normalize bug is fixed by re-running, not
  re-fetching (Meta allows 37 months back, Shopify rate-limits refetch).*

**Views (the platform ↔ dashboard contract)**
- `api.*_v1` views are additive-only: columns may be added, never removed or retyped. A breaking
  change is a new `_v2` view. `_v1` lives until no dashboard reads it (`dashboard_versions` row per
  client). Views are `security_invoker`. *One migration must never break N dashboards at once.*
- Every view exposes `client_id`, `source`, `updated_at`. *Dashboards filter, cache, and attribute
  without asking for a v2.*

**Writes**
- Dashboards write only through `api.*` RPCs and one RLS'd Storage bucket. Never base tables.
  *One versioned write door; RLS + validation in one place; client #2 reuses it.*
- Client-uploaded files (Content Library) and connector-pulled media (Meta creatives) share the
  `media` table, distinguished by `source`.
- `media` rows soft-delete, recoverable 30 days.

**Files**
- Supabase Storage in the shared project. Path `client_id/…`. RLS by claim. Signed URLs. 100 MB per
  file. Thumbnails generated once into a separate no-quota prefix; browsing never touches originals.
  *One RLS model is the whole security story; a second store doubles the forbidden-read surface.
  Migration to Spaces/own servers is expected at large client counts anyway.*
- Per-client monthly egress budget, enforced in the platform: `api.download_url(media_id)` logs the
  file size to `egress_ledger(client_id, month, bytes)`; the Storage SELECT policy on originals
  denies when the month's bytes exceed `clients.egress_quota_bytes` (default 20 GB). Dashboard shows
  "monthly download budget reached." Overage is a contract pass-through line. *Video stays allowed;
  a 6 TB month is a visible wall, not a bill bcns eats.*
- Platform cron alerts bcns at 80 % of the pooled Supabase egress allowance.

**Connectors and scheduling**
- Each connector declares defaults in code (`interval`, `backfill_depth`, rate limit). Onboarding
  copies them into `connector_schedule(client_id, source, interval, backfill_from, next_run_at,
  last_success_at, …)`; the row is the per-client override. *Never re-decide an interval at
  onboarding.*
- Defaults: hourly incremental pulls; Meta insights every 6 h; backfill 13 months; per-client
  `backfill_from` may go back to the source's ceiling (Meta 37 months, Shopify unlimited, Monday
  current state only, Meet notes as far as the Drive folder goes).
- Cron now, queue later. Worker = one Node process run as a **Cloud Run Job** on a **Cloud
  Scheduler** tick every 5 min (GCP project already used for bcns-internal), reading
  `connector_schedule` for what is due. *No platform frontend and no hand-written API means a
  droplet's only job was running a script on a timer; Cloud Run does that for ~$0 and needs no
  patching. Connectors don't know the scheduler, so moving hosts is a Dockerfile.*
- No droplet, no nginx, no always-on process for the platform.

**Credentials**
- Token table: `(client_id, source, kind, secret, expires_at?, refresh_secret?, last_refreshed_at,
  status)`. Worker refreshes anything expiring within 24 h; refresh failure → `auth_failed`.
- Per-source credential checklist is an onboarding requirement: Shopify custom-app admin token;
  Monday personal token; Meta **system-user** token (never a user token: 60-day bomb); Google
  OAuth **registered in the client's own Workspace as an internal app**, created by bcns once with
  the client's admin login, consented by the owner or a role account (not an employee), refresh
  token pasted. *bcns-owned external app needs Google restricted-scope verification: weeks, and a
  7-day token expiry until then. Owning the registration grants nothing; the platform is bcns's
  regardless.*
- Meet notes is optional per client; fallback is the client dropping the doc into the Content
  Library.

**Health**
- Platform computes one status per `(client_id, source)` into a view: `ok` (last success within 2×
  interval), `stale` (missed 2+ runs, or last run wrote zero rows when history says it never does),
  `auth_failed` (401/403 or refresh failed), `error` (other), plus `last_success_at`, `last_error`.
  Dashboards render it, never compute it. *Every dashboard and every briefing read the same
  definition.*
- Alerts to bcns: `auth_failed` immediately; `stale` after 6 h.

**Churn**
- Cancel → `clients.status = churned`; scheduler skips, logins disabled, rows kept. Export on
  request. Hard delete only by a bcns-run script after 30 days. *Less work than export+delete at
  cancel, and reversible for a month.*
- Export = one script over `client_id`: CSV per canonical table, raw JSONL, original files.
- Supabase daily backups retain rows 7 days after hard delete; the contract says so.

**Dashboards and dashboard-side features**
- `bcns-app-template` gains a "data source: own project | shared platform" mode;
  `@nseluga/app-core` stays untouched. A new shared data-client package holds the shared-platform
  mode's client code.
- Briefing and Daily Financial Report are **SB dashboard features, not platform jobs**: code in
  SB's repo, Haiku, must render with AI off, per-client AI budget in dashboard config, email via
  Resend as a dashboard flag, daily tick = one Cloud Scheduler job hitting the dashboard's cron
  route at 06:00 client-local, "generate now" hits the same route. Reports persist through
  `api.save_record` with kind `briefing` / `daily_financial_report`. *Prompt, panel selection,
  AI bill, and sender are all per-client facts; the platform knows none of them.*
- Feature promotion rule (mirrors the data rule): a feature is built in the first client's repo;
  on the second client it is lifted into the shared package as an opt-in module and listed in
  TEMPLATE.md; the third client is config.

**Verification**
- Every platform PR runs forbidden-read tests on a shadow DB seeded with two clients: zero
  cross-client rows on every table, view, RPC, and Storage prefix; a test enumerates `pg_tables`
  and fails on any table without RLS + a `client_id` policy; a test fails on any `api.*` view that
  is not `security_invoker`.
- Each client has a smoke user; the dashboard's CI logs in as it after every template upgrade and
  asserts it reads only its own rows.

## Requirements

Checkable statements. "Must" = platform fails acceptance without it.

**Tenancy**
- R1. Every table in every schema has RLS enabled and a policy comparing `client_id` to the JWT
  claim. CI enumerates and fails otherwise.
- R2. A JWT without a `client_id` claim reads zero rows from every view and RPC.
- R3. `memberships` maps one user to exactly one `client_id`; a second row for the same user is a
  constraint violation.
- R4. Removing a membership row (or setting `clients.status ≠ active`) makes that user's next
  request return zero rows without a deploy.
- R5. The service-role key appears in no dashboard repo, build artifact, or env.

**Pipeline**
- R6. Every raw row carries `client_id`, `source`, `external_id`, `fetched_at`, `source_updated_at`,
  and the untouched source payload; partitioned by month of `fetched_at`.
- R7. Re-running normalize over existing raw is idempotent: same rows, same values, no duplicates.
- R8. Every canonical upsert is keyed `(client_id, source, external_id)`; a re-pull changes state
  once.
- R9. Any source field a dashboard does not show stays in raw (or `attributes`) and is not a column.
- R10. Day-bucketed rows use `clients.timezone`; changing a client's timezone re-normalizes that
  client only.
- R11. `money` rows are events with `external_id`; `daily_metrics` rows are aggregates; no metric
  exists in both.
- R12. `daily_metrics` supports an entity dimension so per-campaign and per-creative series need no
  new table.

**Views and writes**
- R13. Dashboards have SELECT on `api.*` views only; no grant on base tables.
- R14. `api.*_v1` views only ever gain columns. A CI diff test fails on a removed or retyped column.
- R15. Every view exposes `client_id`, `source`, `updated_at`.
- R16. Every dashboard write is an `api.*` RPC or a Storage upload under `client_id/`; RPCs validate
  input and set `client_id` from the claim, never from the argument.
- R17. `api.save_record(kind, attributes, external_id?)` exists and is the generic write for any
  dashboard-produced artifact.
- R18. `media` supports `source ∈ {upload, meta, …}`, tags, set membership, and soft delete.

**Files**
- R19. Storage objects live under `client_id/…`; the SELECT policy compares the path prefix to the
  claim; a forbidden-read test attempts a cross-client signed URL and fails.
- R20. Per-file limit 100 MB, enforced in the bucket config and the upload RPC.
- R21. Thumbnails are generated at upload into a separate prefix with no egress accounting.
- R22. `api.download_url` records the object's size in `egress_ledger` before returning a URL; when
  the month's total exceeds `clients.egress_quota_bytes`, it returns a typed "budget reached" error
  and the Storage policy denies the original.
- R23. A platform job alerts bcns at 80 % of the pooled Supabase egress allowance.

**Connectors**
- R24. A connector is one module exposing: declared defaults, `backfill(from)`, `incremental(since)`,
  `refreshToken()` if the source needs it. It knows no scheduler.
- R25. `connector_schedule` is the only place intervals and backfill depth live per client; the
  worker runs whatever `next_run_at ≤ now()` and `clients.status = active`.
- R26. A connector failure for one `(client_id, source)` never delays another; each run is isolated
  and rate-limited per source.
- R27. Backfill of 13 months for an SB-sized Shopify store completes at onboarding without manual
  intervention (~260 API pages).
- R28. Worker runs as a Cloud Run Job triggered by Cloud Scheduler; a run has no state outside the
  database; two overlapping ticks do not double-process (per-row claim).

**Credentials and health**
- R29. Tokens are readable by the service role only; no view or RPC exposes them.
- R30. The worker refreshes any token with `expires_at` within 24 h; a failed refresh sets
  `auth_failed` and alerts bcns within the next tick.
- R31. The onboarding checklist names the credential type per source; a Meta user token or a
  bcns-org Google registration is a checklist failure.
- R32. `api.connector_health_v1` returns exactly one row per `(client_id, source)` with the status
  enum and timestamps; the dashboard's integrations page renders it verbatim.
- R33. `stale` and `auth_failed` produce a bcns notification (email) on the thresholds above.

**Churn and export**
- R34. `clients.status = churned` stops all pulls and logins at the next tick.
- R35. One script produces a client's full export (CSV per canonical table, raw JSONL, originals)
  from `client_id` alone.
- R36. Hard delete is a bcns-run script that refuses to run within 30 days of churn, with no
  pre-delete archive.

**Dashboard template (shared-platform mode)**
- R37. Template mode "shared platform" ships: login against the shared project, reads via
  `api.*_v1` only, writes via RPC only, `/health` that checks the platform (a view read), no
  `supabase/migrations/`, no service-role key.
- R38. Template builds and serves with no env vars and AI off, unchanged from today.
- R39. Dashboard CI logs in as the client's smoke user and asserts it reads only its own rows.

**Platform v1 (2026-09-15)**
- R40. Hub app at `connect.bcn-services.com`: sign in; sources with state and health
  (`connector_health_v1`, last pull); team (owner invites/removes, sets role); access page (mint or
  rotate an agent login, API URL, MCP URL, snippets); link to the client's app (`clients.app_url`).
- R41. Session cookie domain `.bcn-services.com`; hub and every client app share one session.
- R42. Each app is its own process, port, unit and deploy job; a hub or app failure is invisible to
  the others and to the marketing site. A repo test forbids `apps/web` importing from platform code.
- R43. Privileged hub actions (invite, agent credential) run in Supabase Edge Functions that check
  the `owner` claim; the service-role key never reaches the droplet.
- R44. OAuth connect flows in the hub for Shopify (state + HMAC, three GDPR webhooks), Meta
  (`ads_read`, data-deletion callback) and Monday; tokens land in the existing token row; pasted
  tokens keep working; a source's button reads "Request connection" until its app is approved.
- R45. Hosted MCP server at `mcp.bcn-services.com` exposing data-client `agentTools()` over
  streamable HTTP; bearer Supabase access token; RLS is the only scope.
- R46. `packages/tenant` ships the cookie helpers and `requireMembership({ expectedClientId })`;
  client apps pin their tenant, the hub does not.
- R47. `apps/_template` + `scripts/new-app.sh <slug> <port>` stamp a shared-platform app inside
  the repo; own-project mode is gone.
- R48. Merge verification: `diff -r` per imported repo, equal test counts, empty `supabase db diff`,
  marketing preview HTML equal to the production baseline, worker image builds from the new path.

**SB defaults (config, not platform requirements)**
- Timezone America/New_York; report hour 06:00; email delivery on.
- Sources: Shopify (orders, products, inventory, sessions if exposed), Meta Ads (daily insights per
  campaign and per creative incl. creative image), Monday.com (one board, items + status), Google
  Meet notes (Gemini docs via Drive, optional).
- Content Library: any `member` uploads, tags, and deletes; creative sets are `media` set membership;
  bcns bulk-imports the existing folder by script at onboarding.
- Conversion rate: from Shopify if the plan exposes it, else orders ÷ sessions from `daily_metrics`;
  which one is a Shopify-plan fact confirmed at integration setup (quote already says so).
- Meta Top Performing Creative = highest ROAS creative in the selected window from `daily_metrics`
  joined to `media`.

## Out of scope

- A bcns staff admin UI and any token-entry form. bcns uses the Supabase dashboard, SQL and the
  CLI scripts. (The client-facing hub is in scope: R40.)
- A hand-written read/write API. PostgREST over `api.*` views and RPCs is the API; the MCP server
  (R45) is a transport over the same views, not a second API.
- QuickBooks, Klaviyo, TikTok, Amazon, or any source not listed for SB.
- An AI agent / free-form chat. Separate product, separately scoped.
- Write-back to any source.
- Briefing or reporting code in the platform.
- Archiving old raw partitions to Spaces (trigger noted below).
- Per-client droplets or any always-on platform server.
- Legacy one-off builds (Technology Associates, l2detailz) keep their own architecture.

## Still open

Only what was explicitly deferred.

- Archive raw partitions older than 13 months to Spaces as compressed JSONL. Trigger: ~100 SB-sized
  clients or raw > 50 GB.
- Migrate files to Spaces / own servers. Trigger: one client projected past 50 GB, or pooled egress
  alert firing monthly.
- Replace the cron loop with a queue (pg-boss). Trigger: a backfill or a noisy source delays other
  clients' pulls.
- Third role / per-panel permissions. Trigger: a client asks.
- Zero-row `stale` heuristic tuning after the first false alarm.
- Promotion of the briefing into the shared package. Trigger: second client wants one.
- ~~Shopify OAuth app~~ and ~~self-serve connect page~~: decided 2026-09-15, now R40 and R44.
- Own REST facade with API keys and per-call metering. Trigger: usage-based billing, or leaving
  Supabase.
- OAuth 2.1 on the MCP server (Supabase as auth server). Trigger: an agent product that cannot
  pass a bearer token.
- Google OAuth app with restricted-scope verification. Trigger: a second client on Drive/Meet.
- Flatten `platform/` into root `supabase/` and `worker/`. Trigger: the nesting costs a session.
