# W3.5 — Make Shopify tokens renewable

**Why this window exists.** It is not in `chunk5-windows.md`. W3 (2026-09-19) proved
self-serve Shopify OAuth end to end and, in doing so, found that the token it stores
dies in one hour and nothing can renew it. There is no perpetual-token escape hatch:
`apps/connect/app/api/oauth/shopify/callback/route.ts:37-47` records a real install that
stored a non-expiring `shpat_` token and got HTTP 403 "[API] Non-expiring access tokens
are no longer accepted for the Admin API" on the worker's first request. **This blocks the
Declan call on 2026-09-21**, not just v1: the operator CLI path has the same gap, so
`add-source.ts --slug sb --source shopify` cannot produce a connection that survives the
afternoon. Run this before W4.

**Model: Opus, high effort.** Not mechanical. It changes a `security definer` RPC
signature (drop + recreate + re-grant — the place where a careless edit silently widens
database access), widens a connector interface that two other connectors already
implement, and repairs a token state machine whose failure mode is silent. Sonnet would
likely get the happy path and miss the grant re-application.

**Use plan mode.** The `refreshToken` interface change touches `drive.ts` and `meet.ts`,
so the blast radius should be agreed before any edit.

**Scope revised 2026-09-19** after every claim below was re-verified against `main` at
`68a35ab`. All original claims held. What changed: the app-secret decision is settled
(Option B), the two Shopify behaviours the doc asked you to look up are answered, a sixth
edit was added for a failure mode worse than the one this window fixes, item (e) was
rewritten, and mutation check 3 was replaced.

---

## Settled: where the worker gets the Shopify app secret

**Option B — worker environment.** One `SHOPIFY_CLIENT_ID` and one
`SHOPIFY_CLIENT_SECRET` on the Cloud Run service, since it is one app secret for every
merchant.

B is not just cleaner, it is the smaller diff. The per-row alternative (modelled on
`drive.ts:84-98`, which reads `ctx.config.oauth_client_id` and
`ctx.token.attributes.oauth_client_secret`) would additionally need:

- a **third** new `api.connect_source` parameter — the RPC hardcodes `'{}'::jsonb` for
  `p_attributes` (`20260918000100_attach_source_rpc.sql:87-91`), so there is no existing
  channel for it;
- a Shopify `attribute:` entry in `onboard.ts` `PROMPTS` (`:13-19`), which today defines
  one only for `meet` and `drive`;
- and it fans one global app secret across every merchant row, so rotating the Shopify
  app secret becomes a data migration instead of an env-var change.

B is `envStr('SHOPIFY_CLIENT_ID')` / `envStr('SHOPIFY_CLIENT_SECRET')` at the call site.

**There is no worker config schema to add the var to** — an earlier draft of this doc said
there was. The worker reads `process.env` directly through two helpers,
`envStr` / `envNum` at `platform/worker/src/db.ts:65-69`. The complete current set is
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_RUN_TASK_INDEX`,
`TASK_COUNT`, `RUN_BUDGET_MS`, `CLAIM_LIMIT`, `EGRESS_ALLOWANCE_BYTES`, `RESEND_API_KEY`,
`BCNS_ALERT_EMAIL`, `BCNS_ALERT_FROM`, `RENORMALIZE_BUDGET_MS`.

One friction to expect, not a reason to reverse the decision: `RunContext`
(`platform/worker/src/connectors/index.ts:63-79`) exposes no env accessor, and no
connector imports `db.js` today — `shopify.ts` would be the first. That is a one-line
import.

The connect app already has its half: `apps/connect/lib/env.ts:42` declares
`shopifyClientSecret: readEnv("SHOPIFY_CLIENT_SECRET")`.

---

## Settled: how Shopify's refresh works

Verified against the live docs 2026-09-19, so you do not need to look this up.

Refresh is a POST to the same path the exchange already uses:

```
POST https://{shop}/admin/oauth/access_token
client_id, client_secret, grant_type=refresh_token, refresh_token
```

Response: `access_token`, `scope`, `expires_in` (3600), `refresh_token`,
`refresh_token_expires_in` (7776000 = 90 days).

**Shopify rotates the refresh token on every refresh.** Verbatim: "Every refresh returns a
new access token and a new refresh token. Store both securely, and use the new refresh
token in the next refresh request." Scope item (d) is therefore mandatory, not
conditional.

The docs show `application/x-www-form-urlencoded`. The existing exchange at
`route.ts:50-53` sends JSON and is empirically proven against a real shop — mirror the
proven JSON body.

Cite these in the PR body:
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant

---

## The prompt

Paste everything between the fences.

```
Branch `chunk-5-w35-token-refresh`, one PR, never merge. I merge with
`! GITHUB_TOKEN= gh pr merge`. Use `GITHUB_TOKEN= gh` for gh writes and `corepack pnpm`.

GUARDRAILS
Nothing merges, pushes to prod or db-pushes except through a confirm I answer. Write the
migration; do NOT run `supabase db push` and do NOT deploy. Every hosted, DNS, deploy or
db step goes into the PR body as a morning wizard step for me, not run. Never read
.env.local or .env.production. Client IDs are public and may be pasted here; client
SECRETS must never appear in this session — they go straight into GitHub secrets and the
hub/worker environment, and you reference them by name only. No new dependency without
asking me. No service-role key outside the worker and Edge Functions. `pnpm build` and
`pnpm dev` share apps/web/.next — kill dev first, then
`pnpm lint && pnpm typecheck && pnpm build`, then restart dev. Do NOT remove the `media`
bucket, its policies, `api.register_upload`, `data.register_media`, `egress_quota_bytes`,
`egress_ledger` or `download_tickets`. Paste the verification output in the PR body.

Use plan mode. Present the plan and wait.

CONTEXT — all of this is verified, do not re-derive it
W3 proved self-serve Shopify OAuth works against connect.bcn-services.com. PRs #38 and
#40 are merged; main is 68a35ab. The flow now mints an EXPIRING token (1 hour, confirmed
empirically: alive at 51 min, HTTP 401 at 61). `expiring: "1"` at route.ts:52 is
load-bearing — the Admin API rejects non-expiring tokens outright (403), so there is no
fallback to a long-lived token.

Nothing can renew that token. Four confirmed gaps:

1. `platform/supabase/migrations/20260918000100_attach_source_rpc.sql` —
   `api.connect_source(text,text,text,jsonb,text,text)` has NO p_refresh_secret and NO
   p_expires_at parameter. Its `perform data.attach_source(...)` at :87-91 passes literal
   `null, null` into those two positions. `data.attach_source` itself accepts both —
   p_refresh_secret is arg 5, p_expires_at is arg 6. The TABLE is already fine:
   `data.source_tokens` (20260912000100_schema.sql:66-78) has refresh_secret, expires_at,
   last_refreshed_at, status and status_detail. No table change.
2. `platform/worker/src/tokens.ts:10-12` selects refresh candidates
   `where status = 'active' and expires_at is not null and expires_at < now() +
   interval '10 minutes'`. A row with expires_at NULL is never considered — and note the
   comparison is NULL-hostile in BOTH entry points, here and at run.ts:389, so a null
   expires_at row is invisible to the whole refresh path. And
   `platform/worker/src/connectors/shopify.ts` defines no `refreshToken`, so
   tokens.ts:16 would `continue` past it anyway.
3. `platform/scripts/onboard.ts:62-82` sets expires_at only when the §9 checklist
   returned an `access_token` — the Google exchange path (checklist.ts:76,90). For
   Shopify it passes null. `PROMPTS` (:13-19) also has no `refresh:` entry for shopify,
   so the CLI drops the refresh token too. `platform/scripts/add-source.ts:44` calls the
   same `attachSource`, so the hand-typed CLI path is broken the same way.
4. Once a refresh fails, the row can never recover. See (f).

`apps/connect/lib/shopify-oauth.ts:204-211` already parses the refresh token and
documents that it is dropped. That comment comes out when the gap closes.

SCOPE — six edits, one PR

(a) New migration under platform/supabase/migrations/ adding
    `p_refresh_secret text default null` and `p_expires_at timestamptz default null` to
    `api.connect_source`, passed through to data.attach_source in place of the literal
    nulls. The defaults matter: platform/test/helpers.ts and three apps/connect files
    call this with six arguments and then need no change.
    TRAP: this changes the function signature. You must `drop function
    api.connect_source(text,text,text,jsonb,text,text)` and recreate it — do not leave
    both, an overload makes the PostgREST call ambiguous. The new function gets EXECUTE
    to PUBLIC by default, so you must re-apply the revoke/grant block at the bottom of
    20260918000100 against the NEW signature. Getting this wrong silently grants anon.
    Only the api.connect_source half of that block changes — data.attach_source's own
    10-arg signature is untouched. Keep the owner check, the validation raises and
    `data.tenant_or_raise()` exactly as they are. These two functions are defined in
    that one migration and redefined nowhere else; I checked.

(b) `apps/connect/app/api/oauth/shopify/callback/route.ts:110-117` passes the refresh
    token and the computed expiry into the RPC. Both values are already on
    `exchanged.token` at that point and are simply not read. Expiry is now + expires_in
    seconds.

(c) `platform/worker/src/connectors/shopify.ts` gains `refreshToken`. Structure it like
    `drive.ts:84-98`, but read client_id and client_secret from the worker environment
    via `envStr` (platform/worker/src/db.ts:65) — NOT from ctx.config/ctx.token
    attributes the way drive does. The endpoint, body and response shape are given above
    in "Settled: how Shopify's refresh works"; do not re-derive them from training data,
    and cite the two doc URLs in the PR body.

(d) Shopify DOES rotate the refresh token, so this is required, not conditional.
    `platform/worker/src/connectors/index.ts:93` types
    `refreshToken?(ctx): Promise<{ secret: string; expiresAt: Date }>` — no slot for a
    new refresh token. Widen it to an OPTIONAL third field so drive.ts and meet.ts need
    no change (Google does not rotate). Then `platform/worker/src/run.ts:384-403`
    `refreshOne` must persist it: its UPDATE currently sets only secret, expires_at and
    last_refreshed_at. Use `refresh_secret = coalesce($N, refresh_secret)` so a
    connector that returns nothing keeps its existing value.

(e) `platform/scripts/onboard.ts` — the Shopify CLI path cannot be fixed by recording an
    expiry, because an expiring access token and its refresh token only ever come out of
    an OAuth round-trip. There is no value I can hand-paste that survives an hour. So:
    `add-source.ts --source shopify` REFUSES and prints the connect.bcn-services.com
    install link for the target store, and I click through the same self-serve flow W3
    proved. Leave attachSource's Google path alone. Say in the PR body what the printed
    link looks like — I use it Monday to connect SB's store.

(f) Fix the auth_failed dead end, in the same files (c) and (d) already touch.
    `refreshOne` marks a row `status = 'auth_failed'` on ANY refresh throw, including a
    transient 5xx. `refreshTokens` (tokens.ts:10-12) then only selects
    `status = 'active'`, so that row is never refreshed again. `probeAuthFailed`
    (tokens.ts:46-72) probes hourly using `ctx.token.secret` — the already-dead one-hour
    access token — so the probe can never succeed either. One bad network moment bricks
    a merchant permanently, and there is no reconnect button to rescue them. Google rows
    survive this today only because their access tokens live longer.
    Three lines:
      - refreshOne's success UPDATE also sets `status = 'active', status_detail = null`.
      - refreshTokens' select widens to
        `(status = 'active' or (status = 'auth_failed' and updated_at < now() -
        interval '1 hour'))`, matching the cadence probeAuthFailed already uses, so a
        genuinely dead refresh token is retried hourly rather than every five minutes.
      - Leave refreshOne's own `for update skip locked` guard alone — it has no status
        filter and needs none.

Also stale, fix in the same PR: `platform/worker/src/tokens.ts:8` says "Only
google_oauth_refresh has an expires_at". `platform/worker/src/connectors/shopify.ts:1`
says "custom-app token, never expires". `route.ts:108-109` and the header of
20260918000100 at :13-17 both assert the RPC and the CLI "run the same statements" —
after (b) and (e) the RPC passes real values and the CLI refuses shopify outright. All
four are now wrong.

OUT OF SCOPE — do not touch
The hub reconnect button (`apps/connect/app/page.tsx:140` renders nothing when
card.connected is true). That is a separate PR. W4/W5/W6. The `data.token_kind` enum —
`shopify_admin` is still the right kind, it does not need a new value. Do NOT add a
column for refresh_token_expires_in; see Known ceiling.

DONE WHEN
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` green from ~/bcns with dev stopped.
- MUTATION CHECKS, each one run and its output pasted in the PR body. A fail-closed
  guard looks identical to a clean run when it stops firing, so a green suite does not
  prove these. Context you will need: platform/test/worker.test.ts:282-297
  (`token_refresh_once`) is the ONLY existing refresh test, it covers meet and the happy
  path, and nothing anywhere covers the auth_failed branch or a null expires_at.
    1. Break the new grant block (grant execute to anon) and show a test fails.
    2. Feed refreshOne a connector returning no refreshSecret and show the existing
       refresh_secret survives the UPDATE.
    3. Revert the callback to omit p_refresh_secret/p_expires_at and show a test goes
       RED — this proves the connect path actually persists both.
    4. Set a Shopify row to status = 'auth_failed' with updated_at two hours old, show
       refreshTokens picks it up and flips it to 'active'; then narrow the select back to
       `status = 'active'` and show RED.
  For each: state what you broke, the command, and that the suite went RED.
- PR body carries: the Shopify docs URLs you verified the refresh endpoint against; the
  migration as a morning wizard step for me to db-push; the new env var names only,
  never their values; and the reinstall step for existing Shopify rows (below).

REPORT BACK
PR number, the four mutation-check results, and one line on what `add-source.ts --source
shopify` prints on Monday.
```

---

## How I run it

1. `cd ~/bcns` — confirm `git status` is clean on `main` at `68a35ab` and the nine
   untracked docs are still there.
2. New Claude Code window in `~/bcns`. Opus, high effort, plan mode on.
3. Paste the fenced prompt.
4. **Approve the plan before it edits.** The one thing to check by eye: it must say it
   is dropping and recreating `api.connect_source`, and re-applying the grants. If the
   plan says "add two parameters" without mentioning drop/recreate, send it back.
5. Let it run. ~45–60 min.
6. When it reports: read the four mutation checks before the diff. A green suite is not
   evidence here; the RED output is.
7. Merge with `! GITHUB_TOKEN= gh pr merge <N> --squash`.
8. Then the migration wizard step from the PR body — `supabase db push` runs in my own
   terminal, not a Claude session (passkey-only account, no TTY). Set the two new env
   vars on the Cloud Run service in the same sitting.
9. **Reinstall every existing Shopify connection**, starting with `bcns-data-dev`. The
   migration cannot repair them: the W3 row has a null `expires_at` AND a null
   `refresh_secret`, so there is nothing to refresh from. They must re-run OAuth.
10. Real proof: after that reinstall, wait 61 minutes and confirm a worker run still
    succeeds. Nothing short of that proves the fix.

**Known ceilings.**

- The refresh token itself expires in 90 days (`refresh_token_expires_in` is 7776000, and
  the docs note that refreshing can *shorten* it). We parse and drop that value. Harmless
  while the worker ticks every five minutes, since each refresh issues a fresh one — but a
  connection disabled for more than 90 days needs a reconnect. Leave a `ponytail:` comment
  at the drop site naming the ceiling; do not add a column.
- This fixes renewal, not the missing reconnect button. A merchant whose token breaks for
  any reason that (f) does not cover still sees "Reconnect needed" with nothing to click.
  That is the next small PR, before W4.
