# HQ — bcns's internal command center

Decided 2026-10-26 with Nate; built on `feat/hq` (items 1-7), cutover is Nate-run. Decision log:
`/Users/nateseluga/bcns/.claude/orchestrator/drafts/hq/decisions.md` (Q8-Q19 below). Package
`@bcn-services/hq`, slug `hq`, port 3105, `https://hq.bcn-services.com`.

## Context

Nate and Brandon ran sales and ops from a Google Sheet, a tracker artifact, a daily digest email,
and the `bcns-internal` pipeline (Cloud Scheduler -> GitHub Actions `clock.yml` -> jobs, plus a
laptop launchd pull). Tasks lived in three places and Claude had no safe way to work them.

## Decision

| Decision                                                                                                                                                                                                                                                                            | Why                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| One new app, `apps/hq`, in this monorepo (Q8, Q11, Q18). Not a Connect tenant: single tenant, no `EXPECTED_CLIENT_ID`, no `@bcn-services/{tenant,data-client,app-core,ui}`.                                                                                                         | Same model as Technology Associates: custom build, own login, roles admin/staff.                                                                   |
| Own Supabase auth and DB (Q8, Q9): project `knmgyxlrhjxaydliucbs`, the former `bcns-internal` database. Pipeline tables (`businesses`, `events`, ...) are the starting schema; migrations 0001-0026 are copied byte-for-byte, `0027_hq.sql` and `0030_stage_times.sql` are HQ's.    | Keeps the lead history; keeps HQ out of the client platform's blast radius.                                                                        |
| Access = a `profiles` row (`is_hq()`), anon key only. No service-role key and no platform `DATABASE_URL` in HQ (`scripts/check-env.ts` fails the build on `SUPABASE_SERVICE_ROLE_KEY`).                                                                                             | A leaked HQ key cannot reach client data.                                                                                                          |
| Claude works HQ through an MCP server inside the app at `/mcp` (Q14a-e), second connector "bcns HQ". Claude acts as the connecting user, never deletes, and can only _propose_ lead-stage and finance changes; a human approves in the UI (keys a / r). Approve is not an MCP tool. | Stage moves and finance numbers are the two writes that must not come from an LLM unattended.                                                      |
| Jobs run as systemd timers on the shared droplet (Q10, Q16): `source` and `qualify` only. pitch/quote/onboard become HQ buttons that create Claude tasks; digest, touch, personalize, poll, notify and heartbeat are dropped.                                                       | Kills Cloud Scheduler, GH Actions clock, the PAT and launchd. `qualify` keeps one `claude -p` call per lead on Nate's subscription token ($0 API). |
| Platform ops reads go through a read-only Postgres role `hq_ops_ro` on four metadata-only views in schema `ops` (Q17).                                                                                                                                                              | Ops view of Connect tenants without a service role in HQ.                                                                                          |
| Cutover (Q19): build against the live DB while the old pipeline runs, one parallel week with Brandon, then switch the old schedulers off and archive `bcns-internal`. The Sheet is out entirely (no import).                                                                        | Nothing is switched off until Brandon has worked a full week in HQ.                                                                                |

## Architecture

- **App.** Next 14 App Router, standalone build, `bcns-app@hq` on port 3105 behind nginx (certbot cert). Views: Today (content by handle: Brandon's call pool and done-count; Nate's tasks, needs-you, fires, clients, numbers strip), Leads (sheet-type grid, inline outcome), Work (tasks assignable to nate/brandon/claude, GTM tracks and lists), Clients (+ Billing), Numbers (weekly finance computed from data, monthly snapshots, Ops). Public paths only `/login /signout /api/health /mcp /authorize /token /register /.well-known/*`; middleware is fail-closed.
- **Auth.** Supabase Auth email + password, host-only cookies (separate from Connect). Signups are off in the dashboard; a session without a `profiles` row is denied. Anon-key clients with RLS gated by `is_hq()`. Deletes are revoked at the grant level; `decide_proposal()` is the only update path for `proposals`.
- **Database region.** HQ project is us-west-2, droplet is nyc3 (about 70 ms round trip). Accepted for v1.
- **MCP.** `POST /mcp`, OAuth in the app copied from `apps/mcp` but against HQ's Supabase. HQ issues its **own opaque bearer tokens** (random, mapped server-side to the Supabase session) and never hands the Supabase JWT to the client, because a `profiles` user can update `businesses.stage` directly under RLS, so "Claude can only propose" rests on this layer. Twelve tools, no approve, no decide, no delete: `list_tasks get_task create_task update_task search_leads get_lead log_lead_note add_link get_client today propose_lead_stage propose_finance`. `get_lead` strips phone, email and person-name keys (including `owner_name`). `update_task status=done` is refused unless the task is owned by claude. OAuth state (codes, clients, rate buckets, tokens) lives on `globalThis`: **one HQ process only**, and every restart signs connectors out.
- **Proposals.** `propose_*` writes a pending row; Today shows before -> after; a/r call `decide_proposal`. A stale proposal (lead already moved) leaves the lead unchanged.
- **Jobs.** `apps/hq/jobs/` (plain Node 22 ESM, only dependency `postgres`; not a pnpm workspace member). `source` Mon-Fri 11:00 UTC walks the trade x town grid on Places API (New); `qualify` hourly 08-20 UTC at :15 fetches sites, scores fit (code signals, then the `claude` CLI), promotes to `call_due` up to 50 per day. Every run writes `events(job, kind='run')`. Places budget is counted from `places_call` events against `BCNS_PLACES_MONTHLY_CAP` (default 950); an unreadable count stops the run. Units: `infra/hq-job@.service`, `infra/hq-source.timer`, `infra/hq-qualify.timer` (`MemoryMax=384M`, `CPUQuota=50%`, user `hq`, `HOME=/srv/hq/claude-home`).
- **Platform ops.** Migration `platform/supabase/migrations/20261027000100_hq_ops_ro.sql`: login role `hq_ops_ro` (3 connections, 5 s statements) with SELECT on `ops.connector_health`, `ops.connector_runs_7d`, `ops.tickets_open`, `ops.clients` (names, slugs, status, timestamps; no error text, no tokens, no record data). HQ connects through `PLATFORM_OPS_URL`; every read fails soft to "unavailable".
- **Fires seam.** `lib/fires.ts` merges `lib/fires-tasks.ts` (due and waiting tasks) and `lib/fires-ops.ts` (connector status, job failures in 24 h, urgent tickets, ops tasks due in 7 days). A fire's stable `key` becomes `tasks.alert_key`, so `c` on Today creates one Claude task per alert. `today` over MCP omits connector and job fires (they need a cookie session).
- **Money.** Stripe (restricted read-only key) and Mercury (read-only token), plain fetch, memoised 10 minutes, fail soft. Mercury's Accounts and Transactions API is free on every plan; the Invoicing API needs a **paid Mercury plan**, so invoices stay behind `MERCURY_INVOICING=1` (off by default). Billing status without it = last matching incoming transaction + `clients.billing_note`.
- **Late stages.** The old hourly tick still acts on `replied / quoting / won` during the parallel week, so HQ refuses those moves (UI and MCP) unless `HQ_LATE_STAGES=1`. Set it only at cutover.

## Consequences

- HQ is additive on the DB (new tables, grants, one recreated view), but 0027 also revokes `anon` on all public tables and default privileges, and recreates `selectable_businesses` as `security_invoker`. The old jobs read that view over a direct Postgres connection, which these changes do not touch (not exercised against the live project).
- Single process: scaling HQ to two instances breaks MCP sign-in. Acceptable at two users.
- Finance for non-cold channels still takes spend and hours as inputs (`finance_inputs`); Claude may only propose them.
- `0030_stage_times.sql` adds `businesses.consult_done_at` / `won_at` (stamped by trigger, backfilled) and makes `finance_snapshots` insert-only. Numbers reads them, so push 0030 **before** the first deploy. It is idempotent.
- `apps/hq/jobs` is outside turbo, lint and `pnpm test`: run `node --test apps/hq/jobs/test/*.test.mjs` by hand.
- Two applied bcns-internal migrations carry a bcns mailbox alias (`0025`) and `rls.sql` carries test addresses; a repo-wide contact grep over `apps/hq` hits only those. Leave 0025 (applied); swapping `rls.sql` to `example.invalid` is optional.

## Nate-run steps, in order

Everything below is run by Nate. Secrets are typed by Nate and never pasted into a Claude window; this document lists variable **names** only. Run laptop commands from `/Users/nateseluga/bcns-w-hq` (branch `feat/hq`, HEAD includes this doc) after `pnpm install --frozen-lockfile`: the Supabase CLI only sees migrations on disk in the checked-out branch, and the HQ migrations reach `main` only at step 7. `<droplet>` below is `root@104.236.20.89` (`bcns-web-apps-nyc`, nyc3); check `dig +short connect.bcn-services.com` returns the same IP first.

### 0. Already done

`scripts/new-app.sh hq 3105` ran: `apps/hq` exists and `infra/ports.txt` has `hq 3105`. Do not run it again. Item PRs #171-#177 are draft and already merged into `feat/hq` locally; the one PR that matters is `feat/hq -> main` (step 7).

### 1. DNS (do first, propagation and certbot need it)

Squarespace -> Domains -> `bcn-services.com` -> DNS Settings -> Add record: type `A`, host `hq`, data `104.236.20.89` (TTL: Custom 300). Squarespace asks for a Google re-verify per session. Check:

```bash
dig +short hq.bcn-services.com        # must print 104.236.20.89 before step 6
```

### 2. HQ database (project `knmgyxlrhjxaydliucbs`)

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

### 3. Platform database: `hq_ops_ro` (project `cnsxbglhredokjbvudfd`)

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
postgresql://hq_ops_ro.cnsxbglhredokjbvudfd:<password>@<pooler-host>:5432/postgres?sslmode=require
# direct (IPv6 only, fails from a host without IPv6):
postgresql://hq_ops_ro:<password>@db.cnsxbglhredokjbvudfd.supabase.co:5432/postgres?sslmode=require
```

### 4. HQ dashboard: signups off, two users, two profiles

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

### 5. Keys from other consoles (free routes first)

- **Google Places (paid past the free tier):** Google Cloud console -> APIs & Services -> Credentials -> Create credentials -> API key. Restrict: API restrictions = "Places API (New)" only; Application restrictions = IP addresses = `104.236.20.89`. Also set a budget alert (Billing -> Budgets & alerts). Becomes `GOOGLE_PLACES_API_KEY`. Cutover-month cap: HQ counts only its own `places_call` events, so set `BCNS_PLACES_MONTHLY_CAP` to **950 minus the Places calls bcns-internal already made this month** (read them in the key's project: APIs & Services -> Places API (New) -> Metrics), or leave 950 and start the HQ `source` timer on the 1st. Google bills any overage. Alternative that avoids double sourcing: pause `clock-source` in Cloud Scheduler (step 13) the day you enable `hq-source.timer`; the other old ticks keep running.
- **Stripe:** Dashboard -> Developers -> API keys -> Create restricted key; permissions Subscriptions: Read, Charges: Read, everything else None. Becomes `STRIPE_KEY`.
- **Mercury:** Settings -> API Tokens -> new token, **Read Only**. Becomes `MERCURY_KEY`. The Transactions API is free. Leave `MERCURY_INVOICING` unset: Invoicing needs a paid Mercury plan, Nate decides whether to pay.
- **Sentry (optional):** a Sentry project for HQ (or reuse sb/mcp's) -> Settings -> Client Keys (DSN). Becomes `SENTRY_DSN`. Errors only; unset = off.
- **HQ database URL for jobs:** HQ dashboard -> Connect -> Session pooler, user `postgres.knmgyxlrhjxaydliucbs`, with the database password (Project Settings -> Database -> Reset database password if unknown). Becomes `DATABASE_URL` in `jobs.env` only. Use the session pooler (port 5432), not the transaction pooler (6543): the jobs use prepared statements.

### 6. Droplet: onboard HQ

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

# HOME for the claude CLI, and the jobs env file
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
| `HQ_LATE_STAGES`                | **unset** until cutover (step 13)                                                         |

Never put `SUPABASE_SERVICE_ROLE_KEY` or a platform `DATABASE_URL` in this file (the seeded `# DATABASE_URL=` comment is a template leftover; ignore it).

Fill `/srv/hq/jobs.env` (`nano /srv/hq/jobs.env`). Names only:

| Name                                                              | Where the value comes from                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                                                    | HQ session pooler URL, step 5                                   |
| `GOOGLE_PLACES_API_KEY`                                           | step 5                                                          |
| `BCNS_PLACES_MONTHLY_CAP`                                         | step 5 (default 950)                                            |
| `SOURCE_CELLS_PER_RUN`, `QUALIFY_BUDGET_MS`, `CALL_TASKS_PER_DAY` | optional tuning; defaults are fine (`CALL_TASKS_PER_DAY` is 50) |
| `CLAUDE_CODE_OAUTH_TOKEN`                                         | the `setup-token` output below                                  |

Install the `claude` CLI and mint the subscription token **as user `hq`** with that HOME, in your own terminal (the token prints to the screen):

```bash
npm install -g @anthropic-ai/claude-code           # as root; lands on the systemd default PATH
claude --version
sudo -u hq env HOME=/srv/hq/claude-home claude setup-token
# paste the printed token into /srv/hq/jobs.env as CLAUDE_CODE_OAUTH_TOKEN=...
```

Without the CLI or token `qualify` still runs, scoring by code signals alone.

### 7. Deploy workflow edit, then merge (first deploy)

`.github/workflows/deploy-app.yml` is outside the HQ run's scope, so this is your edit. Commit the edit on `feat/hq` before this step's merge:

```diff
-    paths: [apps/sb/**, apps/connect/**, apps/mcp/**, packages/**, package.json, pnpm-lock.yaml, .github/workflows/deploy-app.yml]
+    paths: [apps/sb/**, apps/connect/**, apps/mcp/**, apps/hq/**, packages/**, package.json, pnpm-lock.yaml, .github/workflows/deploy-app.yml]
...
-        slug: ${{ inputs.slug && fromJSON(format('["{0}"]', inputs.slug)) || fromJSON('["sb","connect","mcp"]') }}
+        slug: ${{ inputs.slug && fromJSON(format('["{0}"]', inputs.slug)) || fromJSON('["sb","connect","mcp","hq"]') }}
```

In step "Build (Next standalone)", after the `printf "require('./apps/%s/server.js');\n" ...` line, add the jobs copy (the timers run `node jobs/run.mjs` from the release root):

```diff
           printf "require('./apps/%s/server.js');\n" "$SLUG" > "$app/.next/standalone/server.js"
+          if [ "$SLUG" = hq ]; then cp -r "$app/jobs" "$app/.next/standalone/jobs"; fi
```

In step "Activate, health-check, prune", inside the `ssh ... "` script, immediately before `prev=\$(readlink ...)`, add the install (the job tree is not a pnpm workspace member and the Next standalone root does not expose `postgres`; without this every timer fire exits 1 and leaves no run row, only journald). This installs into the new release directory, which is `/srv/hq/current/jobs` once the symlink flips, and fails the deploy before the flip rather than after:

```diff
+            if [ -d /srv/$SLUG/releases/$GITHUB_SHA/jobs ]; then
+              (cd /srv/$SLUG/releases/$GITHUB_SHA/jobs && npm install --omit=dev --no-package-lock)
+            fi
             prev=\$(readlink /srv/$SLUG/current || true)
```

Then ship. `rsync --delete` replaces each release, so `npm install` reruns on every deploy by design.

```bash
# the feat/hq -> main draft PR is #178
GITHUB_TOKEN= gh pr ready 178 -R bcn-services/bcns
GITHUB_TOKEN= gh pr merge 178 -R bcn-services/bcns --squash   # or --merge to keep the item commits
```

The merge touches `pnpm-lock.yaml` and `packages/**`, so expect **sb, connect and mcp to redeploy and restart too**, plus hq. Watch it: `GITHUB_TOKEN= gh run watch -R bcn-services/bcns`. If only hq needs a redeploy later: `GITHUB_TOKEN= gh workflow run deploy-app.yml -f slug=hq -R bcn-services/bcns`.

Smoke test:

```bash
curl -s https://hq.bcn-services.com/api/health                      # {"ok":true,"app":"hq"}
curl -si -X POST https://hq.bcn-services.com/mcp | head -3          # 401 with a WWW-Authenticate header
curl -s https://hq.bcn-services.com/.well-known/oauth-protected-resource   # names hq.bcn-services.com
```

Then sign in at `https://hq.bcn-services.com/login` as Nate, then as Brandon.

### 8. Timers (needs a deployed release at `/srv/hq/current`)

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

### 9. Connect Claude to HQ

claude.ai -> Settings -> Connectors -> Add custom connector -> name `bcns HQ`, URL `https://hq.bcn-services.com/mcp`. Sign in with your HQ email and password when it redirects to `/authorize`. The os skill `/hq` drives it (`~/os/skills/hq/SKILL.md`).

### 10. Seed the GTM tracks (once)

Dry run first, no environment needed; it prints the tasks and list items it would insert:

```bash
pnpm --filter @bcn-services/hq seed-gtm
```

Then apply. The values are typed at the prompt, never written to a file:

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://knmgyxlrhjxaydliucbs.supabase.co
read -rs "NEXT_PUBLIC_SUPABASE_ANON_KEY?anon key: "; export NEXT_PUBLIC_SUPABASE_ANON_KEY
export HQ_SEED_EMAIL=nseluga@bcn-services.com
read -rs "HQ_SEED_PASSWORD?password: "; export HQ_SEED_PASSWORD
pnpm --filter @bcn-services/hq seed-gtm --apply
unset NEXT_PUBLIC_SUPABASE_ANON_KEY HQ_SEED_PASSWORD
```

(zsh syntax.) It refuses a second run when any `source='tracker'` task exists.

### 11. Monthly finance freeze

Numbers, monthly table -> "Freeze <month>" button, in the first days of each month. Insert-only: a frozen month cannot be edited afterwards (0030 revokes UPDATE).

### 12. Parallel week with Brandon

Old pipeline stays on (Cloud Scheduler, launchd, digest); `HQ_LATE_STAGES` stays unset. Checklist:

- [ ] Brandon signs in to HQ and works the call pool from Today (no Sheet, no digest) for a full week, 5 working days.
- [ ] Every outcome he logs shows in Leads; the done-count moves.
- [ ] Nate approves at least one proposal with `a` and rejects one with `r`; a stage change from Claude arrives only as a proposal.
- [ ] `hq-source.timer` and `hq-qualify.timer` fired each weekday: Numbers -> Ops shows the runs, no failures.
- [ ] Places calls this month are under the cap (Numbers -> Ops).
- [ ] `/srv/hq/jobs.env` and `/srv/hq/env` permissions still `600` and owned by `hq`.
- [ ] Weekly finance computes itself; spot-check one week against the old numbers.
- [ ] Brandon agrees to switch off.

### 13. Cutover

Do in this order, same day.

- [ ] Allow late stages and restart (signs MCP connectors out, reconnect them):
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

### Rollback

HQ is additive on the DB, so the old pipeline can resume against it. Pause is reversible, delete is not, which is why step 13 pauses first.

```bash
GITHUB_TOKEN= gh workflow enable clock.yml -R bcn-services/bcns-internal
gcloud scheduler jobs resume <name> --project bcns-leads --location us-central1      # each paused job
mv ~/Library/LaunchAgents/com.bcns.leads-pull.plist.disabled ~/Library/LaunchAgents/com.bcns.leads-pull.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bcns.leads-pull.plist
ssh root@104.236.20.89 "sed -i '/^HQ_LATE_STAGES=/d' /srv/hq/env && systemctl restart bcns-app@hq && systemctl disable --now hq-source.timer hq-qualify.timer"
```

If the repo was already archived: `GITHUB_TOKEN= gh repo unarchive bcn-services/bcns-internal --yes`. If the scheduler jobs were deleted, recreate them with `scripts/scheduler-setup.sh` in `bcns-internal`.

## After each HQ deploy

MCP connectors must reconnect. OAuth state and the opaque tokens are in the HQ process, so every deploy or restart (including `systemctl restart bcns-app@hq` and a droplet reboot) signs "bcns HQ" out in Claude; reconnect it in Settings -> Connectors and sign in again. A refresh drops the old token pair immediately. Re-check `curl -s https://hq.bcn-services.com/api/health` and that `systemctl list-timers 'hq-*'` still shows both timers.

## Follow-ups and decisions left for Nate

- Branch rewrite, your call (or leave): commits `347b28d` and `fdd239d` carry an `Opus 5.5` Co-Authored-By trailer instead of `Fable 5.1`.
- PR #171's body miscounts Minors (says 7 fixed, 1 dropped; actual 8 fixed, 0 dropped). Fix with `GITHUB_TOKEN= gh pr edit 171 -R bcn-services/bcns --body-file <file>` or leave.
- "No answer" on a call sets the next contact +1 business day ET. For +2 change `n` in `nextBusinessDay` (`apps/hq/lib/leads.ts`).
- Open Minors on #174: an ops task shown only under Fires on Today cannot be marked done there (use Work); `taskFires` errors are silent; Today fetches proposals twice and 500s on one failed read; `listTasks` caps at 500.
- `createOpsTask` is check-then-insert; a UI plus MCP race on one alert can leave two open ops tasks. Fix: a partial unique index `tasks(alert_key) where status <> 'done'` in the next free migration number (0031).
- Board focus (#173 Minor): after a nav click, `j` selects a row but Enter still follows the focused link; `components/Board.tsx` should blur a focused a/button on j/k.
- Process: a dt-review run edited `STANDARDS.md` outside its scope (reverted). Suggested `dt-review.md` line: "no file edits under a RUN.md scope; STANDARDS suggestions go in findings only."
