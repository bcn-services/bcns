# Deploy — connect (bcns Connect hub)

`connect.bcn-services.com` — the client-facing hub. Same droplet pipeline as
every other app in `apps/`: `.github/workflows/deploy-app.yml` already lists
`connect` in its push paths and its matrix, so a push to `main` builds the Next
standalone bundle, rsyncs it to `/srv/connect/releases/<sha>/`, flips
`/srv/connect/current`, restarts `bcns-app@connect`, health-checks
`/api/health`, and rolls back on failure. The droplet never builds.

Connect differs from a client app in exactly two ways:

- It is **multi-tenant read-only through RLS** — every query runs as the signed-in
  user through the `api` views. It never holds a service-role key.
- Two **Edge Functions** (`invite-member`, `mint-agent-login`) carry the two
  privileged writes. They live in the platform project, not on the droplet.

## Prerequisites

- Droplet onboarded for this slug: `infra/onboard-client.sh connect 3102 connect.bcn-services.com`
  → Unix user `connect`, `/srv/connect/{releases,current}`, `/srv/connect/env`
  (mode 600), nginx vhost, unit `bcns-app@connect`.
- DNS: `connect.bcn-services.com` A record → droplet IP (no Cloudflare proxy). TLS is a Let's Encrypt cert issued by `infra/onboard-client.sh` (HTTP-01 webroot, auto-renewed by certbot).
- Repo secrets already in place for the other apps: `GH_PACKAGES_TOKEN`,
  `DEPLOY_HOST`, `DEPLOY_SSH_KEY` (key for the `connect` user).

## `/srv/connect/env`

| Var | Value |
|---|---|
| `PORT` | `3102` |
| `HOSTNAME` | `127.0.0.1` (nginx is the only thing in front of it) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cnsxbglhredokjbvudfd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | platform anon key (Supabase `get_publishable_keys`) |
| `RESEND_API_KEY` | optional — "Request connection" emails |

**Never** `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` in this file. The hub
has no code path that reads either, and the service-role key would defeat the
RLS that is the entire tenant boundary.

Every optional var may be absent: with no `RESEND_API_KEY` the request-connection
form degrades to a `mailto:` link instead of failing, and with no Supabase URL
`/api/health` reports `platform: "unconfigured"` and still returns 200. A missing
key never fails a build or a test.

Shopify / Meta / Monday credentials are **not** hub env vars — they are connector
secrets in `data.source_tokens`, owned by chunk 5. Nothing here reads them.

## Morning steps (not run by this branch)

Both require an authenticated `supabase` CLI and are run by hand from `~/bcns`,
once this branch merges. **Always pass `--workdir platform`:** the migrations
live in `platform/supabase/`, and run from the repo root the CLI finds none and
reports "Remote migration versions not found". That is a wrong working
directory, not drift. Never answer it with `supabase migration repair`.

```bash
# 1. Schema — two migrations in this chunk.
#    20260916000100_clients_app_url.sql   adds data.clients.app_url + republishes api.client_v1
#    20260916000200_add_member_rpc.sql    adds api.add_member (see note below)
supabase db push --workdir platform --project-ref cnsxbglhredokjbvudfd

# 2. Edge Functions.
supabase functions deploy invite-member mint-agent-login --workdir platform --project-ref cnsxbglhredokjbvudfd
```

Order matters: `mint-agent-login` reads `api.client_v1` and both functions call
`api.add_member`, so push the migrations first.

### Why `api.add_member` exists

`service_role` has `BYPASSRLS` but **no `USAGE` on schema `api` or `data`**, and
PostgREST is exposed on `api` only — so a service-role client in an Edge Function
cannot write `data.memberships` at all. The functions therefore use the service
role *only* for the GoTrue Auth admin API (invite / create / update a user) and do
every database write with the **caller's own JWT** through
`api.add_member(target_user_id, member_role)`, a security-definer RPC that takes
the tenant from the JWT and re-checks the owner role in SQL. Granting `service_role`
rights on `data` would have been the smaller diff and a much larger blast radius.

### Known ceiling: invite frequency

Nothing in `invite-member` caps how often an owner can invite. The only limit is
GoTrue's project-wide email rate limit (Auth → Rate Limits in the dashboard), so a
hostile owner could make the platform mail arbitrary addresses from the bcns
sending domain up to that ceiling. Accepted for v1 (owners are hand-onboarded
clients); add a per-client counter in `api.add_member` if that ever changes.

### Edge Function secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into every function by the platform — nothing to set. The service-role key appears
only in `platform/supabase/functions/_shared/deps.ts`, read from `Deno.env`.

## Monitoring

UptimeRobot HTTP monitor on `https://connect.bcn-services.com/api/health`, 5-min
interval. It probes the platform's `/auth/v1/health` with no credentials — 200
`{"ok":true,"platform":"connected"}` when the platform answers, 503 when it does
not. An unauthenticated probe is deliberate: an uptime check that needed a login
would page on an expired password rather than on a real outage.

## Verifying a release by hand

```bash
curl -fsS https://connect.bcn-services.com/api/health
journalctl -u bcns-app@connect -f
ln -sfn /srv/connect/releases/<old-sha> /srv/connect/current && sudo systemctl restart bcns-app@connect  # rollback
```
