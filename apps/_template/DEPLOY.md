# Deploy — apps/\<slug\>

Documentation only. Target stack per `docs/architecture/platform-v1.md`: the
shared DigitalOcean droplet running one **systemd unit per app**
(`bcns-app@<slug>`), fronted by nginx/certbot, reading the **one shared
Supabase platform project** — no per-app project. No containers. **The
droplet never builds** — CI builds the standalone bundle and ships it as an
artifact; releases are versioned directories switched by symlink, so
rollback is instant.

Server-side scripts (droplet bootstrap, client onboarding, the
`bcns-app@.service` unit, nightly pg_dump backups) live in this monorepo
under `infra/` — one copy per droplet, not per app.

## Prerequisites

- The shared DO droplet, provisioned by `infra/bootstrap.sh`. This app
  onboarded by `infra/onboard-client.sh <slug> <port> <domain>` (creates the
  `<slug>` Unix user, `/srv/<slug>/` dirs, env file at mode 600, the nginx
  vhost, enables the unit). Port comes from `infra/ports.txt`
  (`scripts/new-app.sh` appends the entry when the app is stamped).
- The client onboarded on the shared platform (`platform/` `onboard`
  script); it prints the client's smoke user login once.
- (Optional) An Anthropic API key if the AI feature is opted in
  (`AI_ENABLED=1` + `ANTHROPIC_API_KEY`).
- GitHub Actions: `.github/workflows/deploy-app.yml` (`workflow_dispatch`
  input `slug`, or a push touching this app's path) builds, ships, and
  health-checks the release.

## Env (`/srv/<slug>/env`, mode 600, owned by the `<slug>` user)

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` of the
**platform** project, `EXPECTED_CLIENT_ID` (this app's tenant pin), and
`HEALTH_EMAIL`/`HEALTH_PASSWORD` = the smoke user. Never
`SUPABASE_SERVICE_ROLE_KEY`: `/api/health` returns 503 if it's present, so
the deploy rolls back (`scripts/check-env.ts` also fails the build on it).

**`EXPECTED_CLIENT_ID` is required, and the middleware fails closed.** The
operator copies it by hand from `clients.id` in the platform project —
`scripts/new-app.sh` does not set it. With `NEXT_PUBLIC_SUPABASE_URL` set and
`EXPECTED_CLIENT_ID` unset or blank, `middleware.ts` denies every request:
browsers are sent to `/login?error=misconfigured`, `/api/*` gets a 500 JSON
body `{"error":"misconfigured"}`. `/api/health` sits outside the middleware
(matcher) and instead reports `{"ok":false,"reason":"tenant_pin_missing"}`
with 503, so the deploy workflow rolls the release back. An unset pin would otherwise admit any
signed-in member of any client (R39). With `NEXT_PUBLIC_SUPABASE_URL` also
unset — local dev with no platform — every request passes through as before.

**Rotating the smoke password** (`rotate-smoke`) must also update
`HEALTH_PASSWORD` in `/srv/<slug>/env` and restart `bcns-app@<slug>`.
Otherwise health fails and the next deploy rolls back.

## Steps

1. **Onboard on the platform** — no schema changes here; the platform
   (`platform/`) owns the schema for every app.
2. **Env** — write `/srv/<slug>/env` per above.
3. **App** — **before the first deploy**, add `<slug>` to
   `.github/workflows/deploy-app.yml`: both the `on.push.paths` list
   (`apps/<slug>/**`) and the `strategy.matrix.slug` array. Until then a push
   to `main` deploys nothing for this app and only `workflow_dispatch` with an
   explicit `slug` works. Then: push to `main`, or `workflow_dispatch` with
   `slug: <slug>`.
   `.github/workflows/deploy-app.yml` builds the Next standalone bundle in
   CI, rsyncs it to `/srv/<slug>/releases/<sha>/`, flips the
   `/srv/<slug>/current` symlink, restarts `bcns-app@<slug>`, health-checks,
   and rolls itself back if the health check fails. Manual rollback:

   ```bash
   ln -sfn /srv/<slug>/releases/<old-sha> /srv/<slug>/current
   sudo systemctl restart bcns-app@<slug>
   ```

   Logs: `journalctl -u bcns-app@<slug> -f`.
4. **DNS/TLS** — `<slug>.bcn-services.com` via `infra/onboard-client.sh`'s
   certbot mode.
5. **Monitoring** — UptimeRobot monitor on `https://<slug>.bcn-services.com/api/health`.

## Notes

- No secrets in the repo or artifact; everything is injected via env at
  runtime. The app boots and serves 200 with every key absent.
- CI pins Node 22 to match the droplet.
- Inbound webhooks (payment processor, SMS provider, accounting) are
  per-client additions: wire real signature verification into the seams in
  `lib/webhooks.ts` — the default verifier is fail-closed and rejects
  everything.
- Nightly `pg_dump` of the platform project lands in the BCNS DO Spaces
  bucket via `infra/backup.sh` — server-side cron, nothing to configure here.
