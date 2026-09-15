# Deploy — hosted-web

Documentation only. Target stack per `hosting-reference.md` (the platform
reference in `~/os/knowledge/library/bcns/`): a shared **DigitalOcean Droplet**
running one **systemd unit per client app under that client's own Unix user**,
fronted by **Cloudflare**, with a per-client **Supabase** project for Postgres,
auth, and file storage. No containers, no PM2. **The droplet never builds** —
CI builds the standalone bundle and ships it as an artifact; releases are
versioned directories switched by symlink, so rollback is instant.

Server-side scripts (droplet bootstrap, client onboarding, the
`bcns-app@.service` unit, nightly pg_dump backups) live in the `bcns`
monorepo under `infra/` — one copy per droplet, not per client repo.

## Prerequisites

- The shared DO droplet, provisioned by `infra/bootstrap.sh` (SSH-key-only
  auth, unattended security upgrades, UFW restricting web traffic to
  Cloudflare IPs — mirror it in the free DO cloud firewall — fail2ban,
  Node 22 + pnpm, nginx terminating TLS with a Cloudflare Origin CA cert,
  the `bcns-app@.service` unit installed, DO resource alerts on). This client
  onboarded by `infra/onboard-client.sh <slug> <port> <domain>` (creates the
  `<slug>` Unix user, `/srv/<slug>/` dirs, env file at mode 600, the nginx
  vhost proxying `<domain>` → the app's port, enables the unit).
- A **Supabase project for this client** (project-per-client is the tenant
  isolation model) → gives you `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- A Cloudflare zone (per-client subdomain or the client's own domain via
  CNAME), proxied (orange-cloud), "Full (strict)" TLS.
- (Optional) An Anthropic API key if the AI feature is opted in
  (`AI_ENABLED=1` + `ANTHROPIC_API_KEY`).
- Repo Actions secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY` (key for the
  `<slug>` user), `SUPABASE_DB_URL` (this client's project), and repo
  variable `CLIENT_SLUG`. Note: the workflows install `@bcn-services/*` with the
  default `GITHUB_TOKEN` — each private package must grant this repo read
  access (package settings → manage Actions access), or swap in an
  org-scoped PAT secret.

## Shared-platform mode (`DATA_SOURCE=shared`)

For clients on the bcns-data shared platform instead of their own project.
Everything above applies except the Supabase project and its secrets.

- **No client Supabase project.** Onboard the client on the platform with
  bcns-data `onboard`; it prints the client's smoke user login once.
- **`/srv/<slug>/env`:** `DATA_SOURCE=shared`, `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` of the **platform** project, and
  `HEALTH_EMAIL`/`HEALTH_PASSWORD` = the smoke user. Never
  `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL`: `/api/health` returns 503 if
  the service key is present, so the deploy rolls back.
- **Repo:** variable `DATA_SOURCE=shared`; no `SUPABASE_DB_URL` secret. CI skips
  the shadow stack and `db push`. Delete `supabase/migrations/`.
- **Health:** `/api/health` signs in as the smoke user and reads its client row,
  so it fails if the platform, auth, or this client's tenant is broken.
- **Rotating the smoke password** (bcns-data `rotate-smoke`) must also update
  `HEALTH_PASSWORD` in `/srv/<slug>/env` and restart `bcns-app@<slug>`.
  Otherwise health fails and the next deploy rolls back.

## SB checklist (shared mode, slug `sb`)

Tick each before the first deploy. Nothing here is scheduled or deployed by
the repo.

- **Platform:** client `sb` on bcns Connect (hosted project
  `cnsxbglhredokjbvudfd`), smoke user `smoke+sb@bcn-services.com`. No agent
  user in v1 (CLIENT.md, Shape).
- **Droplet:** `infra/onboard-client.sh sb <port> <domain>` → Unix user `sb`,
  `/srv/sb/{releases,current}`, `/srv/sb/env` (mode 600), unit
  `bcns-app@sb`.
- **`/srv/sb/env`:**

  | Var | Value |
  |---|---|
  | `PORT` | the port given to `onboard-client.sh` |
  | `DATA_SOURCE` | `shared` |
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://cnsxbglhredokjbvudfd.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | platform anon key (Supabase `get_publishable_keys`) |
  | `HEALTH_EMAIL` / `HEALTH_PASSWORD` | smoke user |
  | `AGENT_EMAIL` / `AGENT_PASSWORD` | the smoke user again (`pnpm briefing` signs in as it); re-set both pairs after `rotate-smoke` |
  | `AI_ENABLED` | `1` once SB approves the cap, else unset |
  | `ANTHROPIC_API_KEY` | SB's own key (BYOK) |
  | `AI_MONTHLY_BUDGET_USD` | the cap SB approved; unset = no AI calls |

  Never `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL`.
- **DNS (Cloudflare):** `<domain>` (a subdomain, or SB's own domain via
  CNAME) → droplet IP, proxied, TLS "Full (strict)".
- **UptimeRobot:** HTTP monitor on `https://<domain>/api/health`, 5-min
  interval, alert to ops. It fails if the smoke login breaks.
- **CI (repo `bcn-services/bcns-client-sb`):** secrets `GH_PACKAGES_TOKEN`,
  `DEPLOY_HOST`, `DEPLOY_SSH_KEY` (key for user `sb`); variables
  `CLIENT_SLUG=sb`, `DATA_SOURCE=shared`. No `SUPABASE_DB_URL`.
- **Morning briefing (06:00 client-local).** `pnpm briefing` is a source
  script (`tsx scripts/briefing.ts`), and the standalone bundle in
  `/srv/sb/current` has no `scripts/`. It runs from a checkout owned by `sb`:

  ```bash
  # as sb, once; repeat the pull + install after each deploy
  git clone https://github.com/bcn-services/bcns-client-sb /srv/sb/src
  cd /srv/sb/src && git checkout <deployed sha> && corepack pnpm install --frozen-lockfile --prod
  ```

  `@bcn-services/*` are private packages, so the install needs a read token
  in `sb`'s `~/.npmrc`. Then a systemd timer (no PM2), in the client's
  timezone (`client_v1.timezone`; the example uses New York). systemd applies
  DST from the zone:

  ```ini
  # /etc/systemd/system/bcns-briefing@.service
  [Service]
  Type=oneshot
  User=%i
  WorkingDirectory=/srv/%i/src
  EnvironmentFile=/srv/%i/env
  ExecStart=/usr/bin/corepack pnpm briefing

  # /etc/systemd/system/bcns-briefing@.timer
  [Timer]
  OnCalendar=*-*-* 06:00:00 America/New_York
  Persistent=true
  [Install]
  WantedBy=timers.target
  ```

  Enable with `sudo systemctl enable --now bcns-briefing@sb.timer`. Check it
  with `systemctl list-timers bcns-briefing@sb.timer` and
  `journalctl -u bcns-briefing@sb`. A failed briefing exits 1 after printing
  the Daily Financial Report, so it shows as a failed unit.

## Steps

1. **Supabase** — create the client's project. Schema is applied only by CI:
   the `migrate` job in `.github/workflows/deploy.yml` runs on every deploy
   (push is idempotent — a no-op when no new migrations) and every migration
   must pass the **shadow-database gate** (a throwaway `supabase start` stack
   replays all migrations from zero and runs the test suite, including the
   RLS forbidden-read tests) before `supabase db push` touches the real
   project. The deploy job runs only after migrate succeeds, so code can
   never go live ahead of its schema. Never hand-run SQL in the dashboard.
2. **Env** — on the droplet, the client's env vars live in
   `/srv/<slug>/env`, owned by the `<slug>` user, mode 600. Per-client secret
   separation is kernel-enforced: each app runs as its own user and cannot
   read another client's files. The service-role key bypasses RLS —
   server-only, never in client-side code.
3. **App** — push to `main`. `.github/workflows/deploy.yml` builds the Next
   standalone bundle in CI, rsyncs it to
   `/srv/<slug>/releases/<sha>/`, flips the `/srv/<slug>/current` symlink,
   restarts `bcns-app@<slug>` (a ~1s restart gap — accepted at our scale),
   health-checks, and rolls itself back if the health check fails. Manual
   rollback = point `current` at the previous release and restart:

   ```bash
   ln -sfn /srv/<slug>/releases/<old-sha> /srv/<slug>/current
   sudo systemctl restart bcns-app@<slug>
   ```

   Logs: `journalctl -u bcns-app@<slug> -f`.
4. **Cloudflare** — point the client's subdomain at the droplet (proxied).
   Confirm the origin firewall only accepts Cloudflare IPs, and that signed
   /private content is never publicly cached (`Cache-Control: private`).
5. **Monitoring** — UptimeRobot monitor on `https://<domain>/api/health`
   (checks real DB connectivity, 503 on failure); Sentry project tagged with
   the client slug, PII scrubbing + per-project rate limit on before go-live.

## Notes

- No secrets in the repo or artifact; everything is injected via env at
  runtime. The app boots and serves 200 with every key absent, so a
  misconfigured env fails soft (feature-by-feature) rather than crashing.
- CI pins Node 22 to match the droplet — keep them in lockstep.
- Inbound webhooks (payment processor, SMS provider, accounting) are
  per-client additions: wire real signature verification into the seams in
  `lib/webhooks.ts` — the default verifier is fail-closed and rejects
  everything.
- Nightly `pg_dump` of every client project lands in the BCNS DO Spaces
  bucket (30-day retention) via `infra/backup.sh` — server-side cron, nothing
  to configure per repo. Signed contracts, when this app grows an e-sign
  flow, must be dual-written to that bucket at signing time.
