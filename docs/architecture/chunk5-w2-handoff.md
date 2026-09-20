# Chunk 5 / W2 → organizational handoff

Written 2026-09-18 at the end of the W2 build + `/wizard` session, for the window
that owns `chunk5-windows.md` sequencing. Everything below is verified against the
live repo, GitHub, DNS and the Shopify Dev Dashboard — not inferred from the plan.

---

## 1. What W2 shipped

**PR #36 — MERGED** 2026-09-18T20:32Z, squash sha `53f54a80`.
Self-serve Shopify OAuth, three GDPR webhooks, hub button behind a per-source flag.

Also landed and already applied to the hosted DB: migration
`20260918000100_attach_source_rpc.sql` (`data.attach_source` + `api.connect_source`),
so the OAuth callback and `platform/scripts/onboard.ts` share one upsert path.
The db push applied **four** pending migrations, not one — three older ones on
`origin/main` had never reached hosted.

`OAUTH_APPROVED_SOURCES` is deliberately unset. The gate defaults closed
(`apps/connect/lib/env.ts:43`), so the hub button still emails a request. Shipping
dark is intended until W6.

## 2. What the wizard completed

Agent half (live in Chrome, Work Profile, org `bcns`):

- Identified the app by client id `a87d4fe4…12bf` → **bcns Connect**, app `425274376193`,
  Dev Dashboard org **235106100** (not the Partner org id 5179321).
- W1's redirect URL and all 7 scopes read back **already correct** — changed nothing.
- **Found and fixed:** `embedded` was `true`. The hub has no App Bridge and no Shopify
  dependency, so Shopify admin would iframe a broken page and review would likely reject.
  Released **`bcns-connect-4`** with `embedded false`; read-back confirms.

Script half (run by Nate in his own terminal, confirmed healthy):

- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` → `apps/connect/.env.local`,
  GitHub secrets (backup only), and `/srv/connect/env` on the droplet.
- `bcns-app@connect` restarted; `https://connect.bcn-services.com/api/health`
  returns `{"ok":true,"platform":"connected"}` / HTTP 200.

## 3. Findings that change the plan

### 3a. The droplet is L2 Detailz's box, reused

`bcns-l2detailz`, **146.190.138.141**, SFO3, **1 GB RAM / 25 GB disk**, DigitalOcean
project `bcns-web-apps`. It was never provisioned for the platform. Chunk 1 ported the
*pipeline* onto a box that already existed for a client.

`bcns-app@.service` is a systemd template; `l2detailz`, `sb` and `connect` are three
instances on one host. `connect.bcn-services.com` and `sb.bcn-services.com` both
resolve to that IP, as does l2details.com.

Consequence for planning: platform deploys land on a box that also carries a client
site, on 1 GB of RAM. Nate has since said L2 Detailz is retired, which makes the
cleanup in §4b possible — and makes the box effectively the platform host.

There is **no backup droplet**. `bcns-web-apps-backups` is a Spaces *bucket*
(object storage, 20 items / 7.43 MiB) holding l2detailz Postgres dumps on 30-day
retention. `connect` and `sb` use hosted Supabase and its own backups; the bucket is
unrelated to this project.

### 3b. CI has not deployed since 2026-09-16 — BLOCKER

Last three `deploy-app` runs all failed, **including the one for PR #36**:

```
2026-09-18 failure  feat(connect): self-serve Shopify OAuth…   (sha 53f54a80)
2026-09-17 failure  docs(platform-v1): deferred chunk 9…
2026-09-16 failure  Merge pull request #31 from platform-v1
```

Root cause, from run 35391972655:

```
./app/login/actions.ts
Module not found: Can't resolve '@bcn-services/tenant'
```

`packages/tenant/package.json` resolves through `"main": "./dist/index.js"` and needs
`tsc` to emit `dist/`. `deploy-app.yml` runs only
`pnpm --filter "@bcn-services/$SLUG" build` (line 57) and never builds workspace
dependencies. Local builds pass only because a stale `packages/tenant/dist/` exists on
Nate's machine.

**Not caused by W2** — it predates the OAuth work by two commits. Sibling
`packages/app-core` avoids this by exporting `./src/index.ts` with no build step.

Net effect: **the hub now has Shopify credentials but is still running pre-OAuth code.**
Neither `sb` nor `connect` has received a deploy in three days.

### 3c. GDPR webhooks are registered in config but not deployed

The three compliance URLs cannot be set in the Dev Dashboard — neither the
create-version form nor App settings exposes them; the form points at
`shopify app config link`. Authored instead as
`apps/connect/shopify.app.toml` (**untracked**, mirrors `bcns-connect-4` plus
`[webhooks.privacy_compliance]`; all three URLs cross-checked against the real route
directories).

Registering them needs `pnpm dlx @shopify/cli app deploy --path apps/connect`, which
**fails from a Claude session** — no TTY, so the CLI demands
`--allow-updates | --allow-deletes | --no-release` and the browser auth handshake has
nowhere to run. Must be run by Nate in his own terminal. Cuts `bcns-connect-5`.

### 3d. W3-local is not currently possible as written

W3's prompt says to start the hub locally. `HUB_BASE_URL` *is* env-overridable
(`apps/connect/lib/env.ts:47`), but Shopify only redirects to URLs registered on the
app, and the only registered one is
`https://connect.bcn-services.com/api/oauth/shopify/callback`. A local hub never
receives the callback.

Two ways through, and they are a real fork for this window:
- Fix 3b and test against the deployed hub — matches what ships.
- Add a tunnel URL (ngrok/cloudflared) to the app's redirect list and run local —
  faster log iteration, but proves a config that won't ship.

Verified as correct and needing no change: the middleware matcher exempts
`api/webhooks/` (Shopify calls those cookieless; a 307 would fail review) while
keeping the OAuth routes gated.

---

## 4. The two tasks to schedule

### Task A — fix the CI workspace build

Make `deploy-app.yml` build workspace dependencies before the app. One line.

- **Blocks:** W3 (deployed path), W6 (Shopify review hits the live URL), and every
  `sb` deploy. On the critical path.
- **Risk:** low. CI-only change, no runtime effect.
- **Caveat:** it is infra config, so per standing practice it gets an agent review
  before a real deploy.
- **Lazier alternative considered:** change `tenant` to export from `src` like
  `app-core`. Rejected as default because `tenant` is published to GitHub Packages
  (`files: ["dist"]`) and that would change what gets published.
- **First green deploy will be the first time W2's code reaches the droplet** — treat
  that deploy as a verification step, not a formality.

### Task B — droplet cleanup after L2 Detailz retirement

Not blocking. Four independent pieces, increasing risk:

1. **Rename** the droplet → `bcns-web-apps`. Cosmetic, free, zero downtime. Nothing in
   the pipeline reads the name.
2. **Decommission the `l2detailz` slug** — `systemctl disable --now bcns-app@l2detailz`,
   drop its nginx vhost and cert, archive `/srv/l2detailz`. This is where the real value
   is: reclaims RAM and disk on a 1 GB box. **Destructive — needs Nate's explicit
   confirm, not an unattended agent.** Check first whether a local Postgres is running;
   that would be the largest reclaim.
3. **Resolve the nightly backup job.** Its source DB may be gone, so it is likely failing
   against a healthchecks.io dead-man's switch. Decide deliberately; don't leave a broken
   cron. **Keep the Spaces bucket** — 7.43 MiB is rounding-error cost and it is client data.
4. **Revoke Spaces key `DO801NNTGHLFQJ8YPDRT`.** L2's index flags its secret as having
   appeared in a transcript. If the client is retired, revoke rather than rotate.

**Reprovisioning was considered and is not recommended:** rebuilding means redoing nginx
vhosts, certs, the `sb`/`connect` unix users, deploy keys, Node 22, the systemd template
and DNS — hours, on a box serving live traffic, to gain a different name. A DO resize is a
reboot rather than a rebuild and can be done any time if memory gets tight, so it does not
need pre-buying.

---

## 5. Ordering input

Dependencies, stated plainly so this window can sequence rather than take a recommendation:

- A blocks W3-deployed and W6. B blocks nothing.
- A and B touch the same host but not the same surfaces (A is CI config; B is
  systemd/nginx/DNS on the box). They can run in either order.
- Doing B2 *during* W3 would add noise to exactly the logs W3 exists to read. If both
  are in flight, finish one before W3 starts.
- B2 reclaims RAM on the box W3 will exercise. Only matters if `free -m` shows pressure —
  worth one look before deciding it's a prerequisite.
- 3c (Shopify CLI deploy) is independent of both A and B and needs Nate's terminal either
  way. It can happen any time before W3, and must happen before W6.
- The 3d fork (fix-and-deploy vs. tunnel) should be settled *before* W3 opens, because it
  changes what that session is told to do in its first step.

## 6. Explicitly not in scope

Deferred by decision during W2/wizard, all to W6: the Protected Customer Data request,
Submit for review, and setting `OAUTH_APPROVED_SOURCES=shopify`.

Untouched as instructed: the worker, the connectors, and `platform/worker/src/tokens.ts`.

Untracked files not to be committed blind — `apps/connect/shopify.app.toml` is mine and
needs a keep/drop decision; `REDESIGN_PROMPT.md`, `design-directions/`, the other
`chunk5-*.md` docs and `docs/architecture/declan-call-window.md` are Nate's.

Local checkout is still on branch `chunk-5-shopify-oauth` (HEAD `b8c41b9`), not `main`.
