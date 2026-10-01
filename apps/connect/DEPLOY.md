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
| `SHOPIFY_APP_HANDLE` | optional — the app's URL slug (`bcns-connect`, the top-level `handle` in `shopify.app.toml`); builds Shopify's plan-page URL. Unset, a Shopify-initiated install with no ACTIVE subscription ends on the hub's generic error page (`plan_handle_unconfigured`) instead of Shopify's plan page |
| `SHOPIFY_PARTNER_API_TOKEN` | optional, **secret** — Partner API client token, "Manage apps" only (Partner dashboard → Settings → Partner API clients). Set it on the droplet by hand; never paste it into chat or a commit |
| `SHOPIFY_PARTNER_ORG_ID` | optional — Partner organization id (`5179321` per `docs/architecture/w6a-shopify-submission.md`; confirm against the Partner dashboard URL) |
| `SHOPIFY_APP_GID` | optional — `gid://shopify/App/425274376193` (app id per the `shopify.app.toml` header; confirm) |

The three `SHOPIFY_PARTNER_*` / `SHOPIFY_APP_GID` vars work only as a set: with
any one unset the hub makes no Partner API call (it is asked only after a definitive
`none_active`, never for an ACTIVE or failed check), and a store that reinstalls
inside a billing period it already paid for is sent to Shopify's plan page (which
offers it nothing to approve). With all three set, that reinstall reconnects, and
the log says `shopify finish paid through <date>`; a refusal logs
`(none_active; partner: <reason>)`. The reason is a fixed code: `unconfigured`,
`no_shop_id`, `http_<status>` (a bad token or org id), `graphql_error` (most likely
the app GID or a missing permission), `malformed`, `no_subscription`,
`bad_end_time`, `period_ended`, `timeout` or `network_error`.

`SHOPIFY_APP_GID` must be the PUBLIC app's GID (bcns Connect), never the bridge
`bcns-data` app's. A reinstall during a free trial is deliberately not covered:
a trial means nothing was paid, and `trialEndsAt` is ignored, so it goes to the plan
page. The logged reason is `bad_end_time` if the Partner API returns the trial
subscription (its `currentBillingCycle` is expected to be null, per the code's assumption (the
test comment cites Shopify documentation); not confirmed live), or `no_subscription` if it returns
none.
The check costs a reinstall two extra calls (the
shop's id from the Admin API, then the Partner API), 5 s timeout each; a client
with an ACTIVE subscription makes neither.

Known limitation: nothing ends access when the paid period ends. The end time is
only logged, in `shopify finish paid through <date>`.

A tenant already bound to a different shop is refused before any of this
(`?error=shop-mismatch`, log `shopify finish rejected (shop_mismatch)`).

Log lines to grep in `journalctl -u bcns-app@connect` for a failed install:
`shopify finish rejected (<code>)`, `shopify finish sent to Shopify's plan page
(<why>) shop=<shop>`, `shopify finish paid through <ISO> shop=<shop>`, and
`shopify uninstall webhook registered` / `not registered (<reason>)`.

The token's backup is the macOS keychain item `bcns-shopify-partner-api-token`
(`security find-generic-password -s bcns-shopify-partner-api-token -w`). To re-set
it, put that value back on the `SHOPIFY_PARTNER_API_TOKEN=` line and restart
`bcns-app@connect`.

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

## Self-service sign-up (P1, shipped dark)

Two switches, both named `SIGNUP_ENABLED`:

- **The real switch:** the `signup` Edge Function secret. Unset (or anything but `1`) = the function
  answers `404 {"error":"not_found"}` to every request and creates nothing. The function is public
  (`--no-verify-jwt`), so this is what keeps sign-up off even if someone calls it directly.
- **The page switch:** `SIGNUP_ENABLED=1` in `/srv/connect/env` only shows `/signup` and the
  "Create account" link on `/login`. Unset = `/signup` 404s and `/login` is byte-identical to before.

Turning it on, in order:

1. Migrations, in order: `20261001000100_client_status_pending.sql` (enum value, own file),
   `20261001000200_signup_pending.sql` (hook pending branch + `api.signup_create_client`).
2. `supabase functions deploy signup --workdir platform --project-ref cnsxbglhredokjbvudfd --no-verify-jwt`.
   It also reads the platform-injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   Deployed without the secret it stays dark. Hand-check: `curl -s -o /dev/null -w '%{http_code}' -X POST
   https://cnsxbglhredokjbvudfd.supabase.co/functions/v1/signup` prints `404`.
3. Hosted Auth (dashboard):
   - "Confirm email" ON. Public sign-ups ("Allow new users to sign up") OFF: the function uses the
     admin API, and the `resend` (type=signup) it calls has no sign-ups-disabled check.
   - Redirect allow-list includes `https://connect.bcn-services.com/auth/confirm`.
   - Email template "Confirm signup": the link must be
     `https://connect.bcn-services.com/auth/confirm?token_hash={{ .TokenHash }}&type=email`
     (must be `type=email`; the default `{{ .ConfirmationURL }}` lands with no token_hash and shows
     link-expired, and no bcns notice is sent). Hand-check: the template preview shows that URL.
4. **Gate: custom SMTP (Resend) wizard done.** The default Supabase SMTP only delivers to team
   addresses, so a merchant would get no mail. Do not go past this step until it is done.
5. `supabase secrets set SIGNUP_ENABLED=1 --workdir platform --project-ref cnsxbglhredokjbvudfd`.
6. `SIGNUP_ENABLED=1` in `/srv/connect/env`, restart `bcns-app@connect`, confirm a new pid.
7. Hand-check: sign up with a non-team address. The confirmation mail reaches it, its link lands
   on `/pending`, and exactly one notice arrives at `BCNS_EMAIL`.

Switching off: `supabase secrets unset SIGNUP_ENABLED --workdir platform --project-ref cnsxbglhredokjbvudfd`,
then remove `SIGNUP_ENABLED` from `/srv/connect/env` and restart (confirm a new pid). The secret
alone stops new accounts; the hub var only hides the page.

A new owner lands on `/pending` until activated. Each confirmed sign-up mails `BCNS_EMAIL` once
(only when the address was confirmed within the last 10 minutes).

Activate (pending -> active only; anything else is refused). **First contact the owner at the
sign-up address** and confirm they made the account: anyone can sign up with someone else's
address and their own password, and activation is the only gate on that.

```bash
DATABASE_URL=... pnpm --filter @bcn-services/platform exec tsx scripts/activate-client.ts --slug <slug>
```

An address that already has an account gets the same answer and a re-sent confirmation mail (GoTrue
sends nothing to an already-confirmed address, and rate-limits re-sends per user); nothing is created.

Known v1 limits:

- Abuse bound: at most 10 pending clients per rolling hour across everyone (BCNS8). Over the cap
  the function deletes the new user, sends nothing, and answers like success, so the cap is
  silent to the visitor. Hand-check / alert: `signup_client_failed` with `code: "BCNS8"` in the
  `signup` function logs means real sign-ups are being dropped.
- Over the cap, each request still creates and then deletes a GoTrue user (no mail).
- Timing: a new address takes measurably longer to answer than an existing one, so existence can
  be inferred by timing. Accepted for v1.
