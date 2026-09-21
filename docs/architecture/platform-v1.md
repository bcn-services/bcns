# Platform v1 — one repo, one domain, one login, one process per app

Decided 2026-09-15 with Nate. Supersedes the repo split in `hosted-web-model.md`, the
"no platform frontend" line in bcns-data `REQUIREMENTS.md`, and "The two repos" in
`~/os/knowledge/library/bcns/hosting-reference.md`. Shape diagram:
https://claude.ai/artifact/2fps5ZoTikL6WD8uyHfweS · progress map:
https://claude.ai/code/artifact/3e05b987-dbf3-4173-8bc3-8fb3789cf59c

## Decisions

| Decision | Why |
| --- | --- |
| One repo: `bcn-services/bcns` absorbs `bcns-data` and `bcns-client-sb` | Atomic changes across schema, data-client, hub, apps, marketing. Agent sessions see the whole system. UI kit, config and app-core already live here. Ends the `bcns-data` naming confusion. |
| One domain: `connect.bcn-services.com` (hub), `mcp.bcn-services.com`, `<slug>.bcn-services.com` per client app | Product lives on the real brand. Marketing stays a separate host (Vercel); the site links to the hub, it does not contain it. |
| One login: Supabase Auth session cookie on `.bcn-services.com` | Hub and every client app share a session without a second sign-in. |
| One process per app: own systemd unit, port, memory cap, deploy job | A crash, OOM or bad deploy stays inside one app. Never one process with per-client modules. |
| Thin hub | Sign in, sources + health, team, access (agent/software credentials), link to the client's app. No token-entry UI: pasted tokens stay a bcns CLI task. |
| v1 = built and submitted | OAuth connect flows built and the Shopify, Meta and Monday apps submitted for review. Each source's Connect button goes live as its approval lands; until then the button requests a connection from bcns. |
| Agent/software access = credential page + hosted MCP server | Supabase REST over `api.*_v1` is already the endpoint. The hub lets an owner mint an agent login; the MCP server is the plug agent products accept. Own REST facade deferred (trigger: usage billing or leaving Supabase). |
| SB inside as `apps/sb` | Runtime links (cookie, RLS, app URL) are identical either way; inside removes the publish-and-bump tax. Frozen `bcns-client-sb` stays deployable as fallback until SB is live on the platform. |
| Behaviour-preserving migration | Nothing in the three repos changes function during the merge. Every "unchanged" claim is backed by a baseline captured before the move. |
| Marketing never depends on Connect | No build-time import, no runtime call, separate host, separate deploy trigger. Hub down ⇒ site up. |
| Shopify's Connect button ships dark | Decided 2026-09-19. The OAuth flow merges and deploys before Shopify approves the app, but `OAUTH_APPROVED_SOURCES` is left **unset** in `/srv/connect/env` on the droplet — so every card stays on "Request connection" and nobody can start a handshake that would fail. The variable lives only on the droplet, never in the repo, so a deploy can never open the gate by accident. `w3-oauth-wizard.sh` carries both the check that it is closed and the one-line flip for when approval lands. |

## Target layout

```
bcns/
  apps/web          marketing (Vercel, unchanged)
  apps/connect      hub · connect.bcn-services.com
  apps/mcp          MCP server · mcp.bcn-services.com
  apps/sb           SB dashboard · sb.bcn-services.com
  apps/_template    stamp for the next Deluxe app (scripts/new-app.sh <slug>)
  packages/ui, config, app-core          (existing)
  packages/data-client                   (from bcns-data; workspace:*)
  packages/tenant                        session cookie helpers + membership middleware + EXPECTED_CLIENT_ID pin
  platform/         bcns-data as imported: supabase/, worker/, api/, scripts/, test/, fixtures/, docs/
  infra/            droplet scripts (existing) + ports registry + certbot per subdomain
```

`platform/` is imported whole first (zero path collisions, trivial `diff -r`). Flatten to root
`supabase/` and `worker/` only if it hurts later. `packages/data-client` is the one thing moved
out of `platform/` because apps import it.

## Chunks

Each chunk ends in a PR with its verification pasted in the body. Only Nate merges
(`! GITHUB_TOKEN= gh pr merge`). Hosted, DNS, dashboard and deploy steps are written as morning
wizard steps, not run unattended.

### 0. Baselines (before anything moves)
Capture from clean checkouts of `bcns`, `bcns-data`, `bcns-client-sb`:
- test command output and counts (bcns-data suite incl. RLS/forbidden-read on local Supabase; SB 247 tests; bcns lint/typecheck/test/build)
- `next build` route tables for `apps/web` and SB
- `packages/data-client/dist/index.d.ts` (public API) and `pnpm ls --depth 0` per package
- `supabase db diff` against hosted = empty; migration list
- `curl` HTML of every `bcn-services.com` route from production
Save under `docs/architecture/baselines/2026-09-15/`. Done when committed. This is the reference for every later "unchanged".

### 1. Repo merge, behaviour-preserving
- `git subtree add` bcns-data → `platform/` (history kept); move `platform/packages/data-client` → `packages/data-client`; bcns-data root `package.json` becomes workspace package `@bcn-services/platform`; its `pnpm-workspace.yaml` and lockfile go; root lockfile regenerated and `pnpm ls` diffed against baseline, any version drift pinned back.
- `git subtree add` bcns-client-sb → `apps/sb` (history kept); package `@bcn-services/sb`; port from env not `package.json`; `data-client` → `workspace:*`.
- Turbo tasks cover the new packages. CI: `platform-ci.yml` path-filtered to `platform/**`, `packages/data-client/**`; `deploy-worker.yml` paths → `platform/worker/**`; `deploy-app.yml` (input: app slug, path-filtered per app) ported from SB's workflow.
- Marketing isolation: Vercel Ignored Build Step = `git diff --quiet HEAD^ HEAD -- apps/web packages/ui packages/config packages/app-core package.json pnpm-lock.yaml`; build command builds `web` only (`turbo run build --filter=web...`); a repo test asserts `apps/web` imports nothing from `apps/*`, `packages/data-client`, `packages/tenant` or `platform/`, and contains no fetch to `*.bcn-services.com` subdomains.
- GCP: WIF attribute condition → `bcn-services/bcns`; re-run `platform/scripts/gcp-setup.sh` (Nate, wizard). GitHub secrets/vars for worker deploy and SB deploy re-created on `bcns`.
- Old repos: README pointer "moved to bcn-services/bcns/<path>"; `bcns-data` and `bcns-app-template` archived after the merge PR is green; `bcns-client-sb` frozen, not archived, until chunk 7 is live.
- `/new-client-repo` skill in `~/os` → `/new-client-app` (stamps `apps/<slug>`).
Verification: `diff -r` old repo vs new folder shows only the enumerated config files; test counts equal baseline; RLS suite green; `supabase db diff` empty (no migration in this PR); web preview deploy HTML equals baseline per route modulo build ids; worker image builds from the new path and a dry tick runs; isolation test green.
Constraint: private-repo Actions minutes are exhausted until 2026-10-01. Run the suites locally and paste results, or Nate raises the Actions spending limit above $0.

### 2. Domain and infra
- Squarespace DNS: A records `connect`, `mcp`, `sb` → droplet 146.190.138.141 (wildcard `*` if Squarespace allows it; verify). Nothing else on the zone moves; Workspace MX/SPF/DKIM/DMARC untouched. Vercel apex/www records untouched.
- TLS: certbot HTTP-01 per subdomain inside `onboard-client.sh` (cert path argument; l2details.com keeps its current cert). `infra/ports.txt` registry + collision check (l2detailz 3100, sb 3101, connect 3102, mcp 3103).
- Deploy: `bcns-app@<slug>` unit unchanged; artifact is the app's `next build` standalone output from the monorepo.
- Supabase Auth: site URL + redirect allowlist for `https://*.bcn-services.com/**` (Nate, dashboard). Cookie domain `.bcn-services.com` lives in `packages/tenant`.
- UptimeRobot per host.
Done when `https://connect.bcn-services.com/api/health` returns 200 from a placeholder app.

### 3. Shared packages and the stamp
- `packages/tenant`: `@supabase/ssr` cookie helpers with the parent-domain option; `requireMembership({ expectedClientId? })` middleware (hub: none; client apps: pinned = the EXPECTED_CLIENT_ID check).
- `apps/_template`: `bcns-app-template` reduced to shared-platform mode only (`DATA_SOURCE=shared`), consuming `packages/tenant` and `packages/data-client`; `scripts/new-app.sh <slug> <port>` stamps it. Own-project mode is dropped (legacy builds keep their own repos).
- data-client publish to GitHub Packages becomes manual and optional (external consumers only).
Done when SB and the hub skeleton build against `packages/tenant`, and a stamped hello app passes the R39 smoke check.

### 4. Hub `apps/connect`
Pages: `/login`; `/` sources with state (connected · needs bcns · coming soon) + health from `connector_health_v1` + last pull; `/team` members, invite, remove, role (owner only); `/access` create/rotate an agent login, API URL, anon key, MCP URL, copy-paste snippets (data-client, curl, Claude MCP config); "Open your dashboard" from a new `clients.app_url` column (one migration).
Privileged actions (invite user, mint agent login) run in Supabase Edge Functions holding the service role and checking the `owner` claim, so the service-role key never lands on the droplet.
Until a source's OAuth app is approved its button is "Request connection": one Resend email to bcns, and Nate runs the CLI path.
Brand from `packages/ui`. Marketing header gets a plain "Sign in" anchor to the hub.
Done when Nate signs in as the SB smoke user and sees 0 sources, health, team, access, and the SB link.

### 4b. Uploads repointed at Drive (targeted fix, no new surface)

Added 2026-09-17. Was in "Deferred, with triggers"; promoted to its own chunk because the direction
is decided, it is small, and it depends on nothing in 5–8. Runs after 4, in parallel with 5. Scope is
exactly the items below — one view migration, no new table, no new RPC, no OAuth, no UX pass (9).
- One migration, views only: `api.media_v1` gains `attributes` (it exposes `source` already but not
  `attributes`, so `web_view_link` is unreachable from an app today); `api.activity_v1`'s creative
  branch drops `where source = 'upload'` so Drive files reach the feed.
- `apps/sb/app/library/`: delete `UploadForm.tsx`'s browser-PUT-to-Storage flow and the
  `registerUpload` server action. Replace the affordance with a line pointing at the client's
  connected Drive folder.
- `apps/sb/app/library/page.tsx`: the `media_v1` select adds `source` and `attributes`, so Drive rows
  render. Download link branches: `api.download_url` for `source='upload'` (existing rows keep
  working), `attributes.web_view_link` for `source='drive'`.
- `apps/connect/lib/sources.ts`: add `drive` to `HUB_SOURCES` (lists 6 of 7 `data.source` values today).
  (Superseded 2026-09-19: `HUB_SOURCES` is now the five connectors only — see §9.)
- Leave in place: the `media` bucket and its policies (the Drive connector writes thumbs there),
  `api.register_upload` and `data.register_media` (still the service-role import path for
  `scripts/import-media`), `egress_quota_bytes`/`egress_ledger`/`download_tickets` (download
  accounting, not upload-specific). Nothing to reclaim — Storage bills actual bytes, not reservations.
Precondition: SB has a `sources` row for `drive` with a `folder_id`, or SB loses its only way to add
files. Check before merging; if absent, the PR states it and waits.
Done when `/library` lists Drive-sourced rows with a working link, no code path writes
`source='upload'`, the hub shows a Drive card, and `pnpm lint && pnpm typecheck && pnpm build` pass.

### 5. OAuth apps and connect flows (start day 1, calendar-bound)
- Shopify: Partner app to public-unlisted (or a new app); `/oauth/shopify/start` + `/callback` in the hub with state + HMAC; token written to the existing token row for that client; the three GDPR webhooks with HMAC verify; privacy/terms URLs (exist on the site); dev-store pass; submit for review.
- Meta: app with Facebook Login for Business, `ads_read`, long-lived token exchange → token row; data-deletion callback URL; business verification; app review submission.
- Monday: OAuth app (light review).
- Google: later. Internal-app path stays. Restricted Drive scope verification is its own project.
- Connector side: **not** the existing `refreshToken` hook — that was the plan, and it was wrong.
  Shopify's Admin API rejects non-expiring tokens outright (403), so `/callback` must request
  `expiring: "1"` (#38) and gets back an access token good for 3600s plus a refresh token good for
  7776000s (90 days). Shopify rotates the refresh token on **every** refresh, so both halves are
  written back each time. None of that plumbing existed: `api.connect_source` had no
  `p_refresh_secret` and no `p_expires_at`, a row with a NULL `expires_at` is invisible to the
  refresh path in `platform/worker/src/tokens.ts`, and `connectors/shopify.ts` defined no
  `refreshToken` at all. Building it took its own window — `chunk5-w35-token-refresh.md` (W3.5),
  shipped as #41. Meta and Monday have no `refreshToken` hook and correctly never will: their
  tokens do not expire. Pasted tokens unchanged; same `sources` row either way.
Done (v1 = built + submitted) — stated per source, because they no longer share a state:
- **Shopify: built.** Flow passes on a real dev store (W2, W3) and tokens are renewable (W3.5,
  #38/#41). Remaining: W5a's confirmed findings fixed, then submit in W6a.
- **Meta: not built.** Flow is W4. Submission (W6b) additionally waits on business verification —
  see §Calendar constraints, which now bottoms out at a business bank account.
- **Monday: not built.** Flow is W4, submission W6c, light review.
The hub flips a source's button from "Request" to "Connect" when its approval lands — by setting
`OAUTH_APPROVED_SOURCES` on the droplet, not by a deploy.

### 6. MCP server `apps/mcp`
Streamable-HTTP MCP at `mcp.bcn-services.com`, port 3103. Tools = data-client `agentTools()`;
`runTool` executes; RLS is the only scope. Auth v1 = Bearer Supabase access token from an agent
login or a user session; OAuth 2.1 via Supabase's auth server when a connector UX needs it.
Stateless, one process, simple per-token rate limit. `@modelcontextprotocol/sdk` **approved
2026-09-20** — pin it exact.
Three things are pre-decided so the build window does not re-litigate them: it is a **plain Node
process, not a Next app** (the SDK's transport is written against Node `req`/`res`, and
`infra/bcns-app@.service` already runs `node server.js` from `/srv/%i/current`); it is
**hand-built**, because `scripts/new-app.sh:24` reserves and rejects the slug `mcp`; and the
**service-role key never appears in `apps/mcp`** — the caller's own token is passed to Postgres,
so RLS cannot be bypassed by the server even in principle. Full window, with the prompt:
`docs/architecture/chunk6-mcp-window.md`. Not gated on chunk 5 (see §Order).
Done when `claude mcp add` against it as the SB smoke user lists tools and reads SB's views, and
`/access` shows the agent credentials **plus the sign-in snippet that turns them into a Bearer
header**. (The original "shows the config" was not achievable: `mint-agent-login` returns an email
and a password with no token and no TTL, and the JWT only exists after a later `signIn()`.)

### 7. SB on the platform
`apps/sb` live at `sb.bcn-services.com` on 3101; `app_url` set; tenant pin; set reorder in `/library`; real store, ad account and board links. Connection when Declan grants access: CLI path (wizard + `add-source`) if before approval, OAuth if after. Number check against Shopify admin; team logins; $100/mo starts.
If Declan sends credentials before chunk 1 lands: deploy the frozen `bcns-client-sb` per its DEPLOY.md (old architecture) and repoint `sb.bcn-services.com` at the new unit later.

### 8. Launch gates and housekeeping
- Sign in at the hub → open SB → no second login; sign out propagates.
- Independence drill: stop the hub unit; every `bcn-services.com` route still serves.
- Worker tick green after the first post-merge deploy; RLS forbidden-read green on `main`.
- Docs: this repo's CLAUDE.md rewritten for the layout; `hosted-web-model.md` marked superseded; `hosting-reference.md`, os client READMEs, and the "bcns-data is bcns Connect" memory updated; repos archived.

### 9. Final UX + visual polish pass on `apps/connect` (deferred, not scoped)

Flagged 2026-09-16 (Nate), after chunks 0–4 landed. Not a chunk in the build-order sense —
no plan, no gate, waits on 0–8 finishing and on real client usage to react to. Known items to
fold in when this starts:
- ~~Uploads and Dashboard aren't connectors — they're the client's own manual data channels
  and can never leave the "Not connected / Request connection" state that pattern implies.~~
  **DONE 2026-09-19** (`chore/drop-upload-source-card`). Not a UX treatment in the end — a
  deletion. Both cards were dead: `platform/worker/src/connectors/index.ts` types `Source` as
  exactly the five real connectors, `data.connector_health` rows are only ever derived from a
  `data.connector_schedule` row, and `platform/scripts/add-source.ts` gates on that same
  registry — so neither source could ever get a health row. Chunk 4b then removed the last app
  path writing `source='upload'`, which is what made the note above stale the day after it was
  written. `HUB_SOURCES` in `apps/connect/lib/sources.ts` is now the five connectors only;
  that file carries the reasoning so it is not re-added. **Do not re-add either card.**
  `data.source` keeps both enum values — existing `source='upload'` media rows and
  `scripts/import-media` still rely on them; only the hub cards are gone.
- ~~Dashboard's source card doesn't belong grouped with real connectors — give it its own spot.~~
  **DONE 2026-09-19**, by the same deletion. "Open your dashboard" already had its own spot:
  `dashboardUrl()` + `apps/connect/app/page.tsx`, which never depended on `HUB_SOURCES`.
- Source card sorting/ordering. Now five cards, so this may no longer be worth doing.
- General UX/visual pass on the hub once it has real traffic to learn from.

## Order and parallelism

0 → 1 serial and verification-heavy. 3 starts once 1's layout exists; 4 and 6 after 3. 2 is Nate steps plus script edits, in parallel with 1. 4b after 4, in parallel with 5, and blocks nothing. 5's partner-dashboard steps start day 1 (Nate); its code follows 4's skeleton. 7 after 2 and 4. 8 last. 9 waits on all of 0–8 and is not scheduled. A first orchestrate session realistically lands 0, 1, 3 and the hub skeleton, with every hosted step queued as a wizard.

## Calendar constraints

- Private-repo Actions minutes: exhausted until 2026-10-01 (or raise the spending limit).
- Shopify: depends on the distribution choice made after the Declan call (`chunk5-windows.md`
  W6a). Custom distribution is one store with no review, so it adds no clock. Public (unlisted)
  adds app review, days to weeks, which would be the longest clock we control. That's why W5a
  and W6a are deliberately un-gated from the Meta/Monday track.
- Meta: the headline is "business verification + review, one to three weeks", but the real chain
  is longer and starts somewhere unexpected. `ads_read` at Advanced Access requires business
  verification; business verification requires a **business bank account**, which bcns does not
  have yet. Opening that account is the true first step of the Meta track, and it gates W6b.
- Monday: days. Google restricted scopes: longer; not in v1.
- Declan's access grant: still unknown, and §7 **does** wait on it — chunk 7's connection is
  explicitly "when Declan grants access". Nothing in chunks 0–6 waits on it, which is what the
  earlier "nothing in v1 waits on it" meant and stated too broadly.

## Nate-only steps (collected)

Vercel ignored-build step and build command · GCP WIF re-scope run · GitHub secrets/vars on
`bcns` · Squarespace A records · Supabase redirect allowlist · Partner/Meta/Monday app creation
and submissions · **register the three Shopify GDPR webhooks** (`pnpm dlx @shopify/cli app deploy
--path apps/connect`, from a real terminal — not a Claude shell) · **open a business bank
account**, which gates Meta business verification and therefore W6b · **`mcp.bcn-services.com`
hosting**: DNS A record, certbot, nginx site, `systemctl enable --now bcns-app@mcp` (scripted as
the chunk 6 deploy wizard) · flip `OAUTH_APPROVED_SOURCES` on the droplet as each approval lands ·
archive repos · Actions spending-limit decision · dependency approvals (`@supabase/ssr` if not
already present; `@modelcontextprotocol/sdk` **approved 2026-09-20**, that one is spent).

## Guardrails (paste with every orchestrate prompt)

> Nothing merges, pushes to prod or db-pushes except through a wizard confirm I answer. I merge
> with `! GITHUB_TOKEN= gh pr merge`. Never read `.env.local` or `.env.production`. Use
> `GITHUB_TOKEN= gh` for gh writes and `corepack pnpm`. No new dependency without asking. No
> service-role key outside the worker, Edge Functions and Nate's machine. Each subagent spawn
> names its model and gets exact scope, done criteria and hard limits. Work on a branch with one
> PR per chunk item. Every "unchanged" claim cites a baseline file from chunk 0.

> Unattended run: proceed without asking. Every hosted, DNS, deploy or publish step is written
> into the PR body as a morning wizard step, not run. Stop only for a missing access or a
> contradiction between two docs.

## Deferred, with triggers

- Own REST facade with API keys and metering — usage-based billing or leaving Supabase.
- OAuth 2.1 on the MCP server — an agent product that cannot pass a bearer token.
- Google OAuth app with restricted-scope verification — second client on Drive/Meet.
- Flatten `platform/` into root `supabase/` and `worker/` — when the nesting costs a session.
- Extract a client app to its own repo — a client wants code ownership or a contractor needs isolated access.
- Move marketing off Vercel — only if the Hobby plan's non-commercial rule becomes a problem. Then static export served by nginx on the droplet (already supported by `pnpm --filter @bcn-services/web export`), not a Node process, or Vercel Pro. Never a reason to put the app on Vercel: schedules and long-running processes stay on the droplet and Cloud Run.
