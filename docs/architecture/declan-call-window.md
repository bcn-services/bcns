# Window prompt — Declan call, Monday 2026-09-21

Paste everything below into a fresh Claude Code window in `~/bcns` before the call.
Keep the window open for the whole call. It drives; Nate types.

---

You are driving a live client call. Nate is on with Declan (SaunaBoy, slug `sb`).
Goal: collect everything needed to attach all five SB sources and finish Connect v0,
then attach them and confirm the SB dashboard reads real data.

## Hard rules

- **Supervised walkthrough mode.** Narrate each step, show the artifact, give Nate a
  hand-check per step, wait for his approval before anything that mutates state.
- **Every hosted command is Nate-run in his own terminal.** You never run anything
  against hosted Supabase. No MCP `execute_sql` on hosted, no `DATABASE_URL` pointed at
  hosted, no `supabase db push`.
- **Never read `.env.local` or `.env.production`.** No service-role key outside the
  worker/Edge Functions.
- **Client IDs are public — paste them freely. Client secrets, tokens and refresh tokens
  must NEVER be pasted into this window.** `add-source` prompts for them interactively;
  Nate types them straight into his own terminal. You never see their values.
- `add-source` is interactive, so it **cannot** be run with the `!` prefix — `!` gets no
  stdin and the prompts will never appear. Nate runs it in his own terminal.
- No new dependency without asking Nate.
- `pnpm build` clobbers a running `pnpm dev` (shared `apps/web/.next`). Kill dev first.

## Read first

1. `platform/docs/connection-day.md` — the runbook. Per-source: what Declan sends, which
   checklist items can fail and why, the exact `add-source` prompts in order, and the
   verification SQL. **This is the source of truth for the mechanics; do not re-derive it.**
2. `platform/docs/shopify-connection-method.md` — Option A vs B for the Shopify install.
3. `docs/architecture/platform-v1.md` §5 and §7.

Two staleness corrections to `connection-day.md`, already known:
- It says `~/bcns-data` and `feat/add-source` PR #3. Both are old. The script is now
  `platform/scripts/add-source.ts` in `~/bcns`, already on main.
- Command form: `corepack pnpm tsx platform/scripts/add-source.ts --slug sb --source <source>`

## Preflight — do this BEFORE the call starts

- [x] Worker deployed and reachable: **RESOLVED 2026-09-20**. A real Cloud Run tick on
      `bcns-oauth-test` refreshed an expiring Shopify token unaided at 02:45:16, rotated the
      refresh token, and pulled 5 pages / 17 products in the same tick. That is the deployed
      worker executing end to end — evidence, not inference. (Nate's local `gcloud` auth may
      still be expired; that only affects inspecting the job, not the job running.)
- [ ] Confirm Nate has a `data.memberships` row for his own email. As of 2026-09-20 the hub
      has only two smoke accounts, so there is no personal login to demo from. See
      "Preflight — Nate's own hub login" below.
- [ ] Confirm `curl https://sb.bcn-services.com/api/health` returns
      `{"ok":true,"platform":"connected"}`.
- [x] Migrations: RESOLVED 2026-09-18. All 12 local migrations are applied on hosted,
      including `20260917000100_media_attributes_drive_activity.sql` (chunk 4b). Nothing
      pending. `apps/sb` is safe to deploy and `/library` will work.
- [ ] Have `platform/docs/connection-day.md` open side by side.

### Preflight — Nate's own hub login

As of 2026-09-20 `data.memberships` has only the two smoke accounts. There is no personal
login, so the hub can only be demoed as a smoke user. Fix this **before** the call.

Nate runs this in his own terminal, with the hosted env exported — Claude never runs anything
against hosted Supabase:

```
corepack pnpm tsx platform/scripts/add-member.ts --slug sb --email <nate@bcn-services.com> --owner
```

`--owner` matters: the hub only renders the Connect button, the team controls and the access
page for the `owner` role. A plain member sees a read-only hub and cannot connect Shopify.

The script tries `inviteUserByEmail` first and falls back to creating the user with a printed
one-time password. Either way the output carries a credential, so paste back only the last
line confirming the membership row — never the password itself.


## On the call — order matters

Do Google first. It is the only source where Declan has to *do work* rather than hand over
a value, and it is the one that can fail on the spot.

### 1. Google (Meet notes + Drive library) — highest risk

Our Meet and Drive connectors both call the Drive API and need `drive.readonly`, which is a
Google **restricted scope**. The only free path is an OAuth app marked **Internal** inside
SB's own Google Workspace. That app almost certainly does not exist yet.

Ask first: **"Do you have a Google Cloud project in your Workspace with an OAuth app set up?"**

- If no — walk Declan through creating it live, screen-shared. He needs: a Cloud project in
  SB's org, OAuth consent screen set to **Internal**, an OAuth client ID (Web or Desktop),
  `drive.readonly` scope, then two separate consents to mint **two separate refresh tokens**
  (one for `meet`, one for `drive` — they must not share a token row).
- If he would rather hand it off — the ask is a **user seat in SB's Workspace**, not Cloud
  Console admin. Admin alone does not work: an Internal app can only be consented to by a
  user inside that Workspace, so Nate needs an identity there to complete the flow.
- Escape hatch worth raising if the above stalls: Declan shares the two Drive folders with a
  bcns-owned Google account, and we read them through an Internal app in *bcns's* Workspace.
  $0, no per-client console work. **Untested — do not promise it works.**

Also collect: the **folder id** for the Gemini notes folder and the **folder id** for the
content library folder, plus both folder URLs. (Drive folder ids are not secret.)

Self-service for Google is deliberately deferred — see `platform-v1.md:119`. Do not propose
building it on this call.

### 2. Shopify

W1 already created the bcns Connect Shopify app (client ID `a87d4fe4a4c2b0a57d370e24f28a12bf`).
**There is no CLI path for Shopify any more — do not offer one.** W3.5 (PR #41, merged
2026-09-20) made `add-source --source shopify` refuse outright and print the hub install link
instead. The reason is not stylistic: Shopify's access token now lives one hour, and an
expiring access token plus its rotating refresh token only ever come out of an OAuth
round-trip. There is no value Declan can send that survives the afternoon.

So Option A is the only path: Declan opens the install link and approves scopes. The hub gate
is already open — `OAUTH_APPROVED_SOURCES=shopify` is set on the droplet (hub-wide, every
client), so Shopify's card renders a real **Connect** button. Drive it from
`https://connect.bcn-services.com`, either with Declan sharing his screen or from Nate's own
hub login.

All seven scopes are required, none optional: `read_orders, read_all_orders, read_products,
read_inventory, read_shopify_payments_payouts, read_reports, read_customers`.
`read_inventory` in particular is load-bearing — `shopify.ts:95` sums `inventoryQuantity`, so
dropping it silently reports zero inventory forever.

Also needed: **Protected Customer Data access, Level 2** (Name, Email, Phone, Address) in the
Partner Dashboard, or checklist items S4 and S6 fail. And confirm **which store is live** —
`saunaboy-2` was Basic, 0 orders and password-protected as of 2026-09-12.

### 3. Meta Ads

Declan mints a **system user token** in Business Settings → Users → System Users with only
`ads_read` on SB's ad account. A personal user token fails checklist M1.
Also get the `act_id` and the Ads Manager URL.

Open question to resolve live: W1 found `ads_read` Advanced Access greyed out on the bcns app,
apparently gated on Business Verification for BCNS LLC. A system user token minted inside SB's
own Business Manager may sidestep this entirely. **Verify on the call rather than assuming
either way.**

### 4. Monday.com

Easiest. Declan sends a personal API token (Avatar → Admin → API) — from a limited board
member rather than an admin if SB can make one — plus the board id and board URL.

### 5. Timezone

Ask once, up front: **"which timezone does your Shopify admin show?"** Checklist S5 and M3
warn on a mismatch with `clients.timezone`. Record the answer in `clients.notes`.

## After the call — attach, in this order

For each source, follow the exact prompt sequence in `connection-day.md` §2–§6. Nate runs
each command in his own terminal with hosted env exported and types the secrets at the
prompts. You read the output he pastes back (it contains no secrets) and diagnose failures
against the checklist tables.

```
# Shopify is NOT add-source — it refuses by design (W3.5). Connect through the hub:
#   https://connect.bcn-services.com → sign in → SB → Shopify → Connect
corepack pnpm tsx platform/scripts/add-source.ts --slug sb --source meta
corepack pnpm tsx platform/scripts/add-source.ts --slug sb --source monday
corepack pnpm tsx platform/scripts/add-source.ts --slug sb --source meet
corepack pnpm tsx platform/scripts/add-source.ts --slug sb --source drive
```

Re-running `add-source` is always safe — it rotates the token and keeps cursors. Re-running
the Shopify hub connect is equally safe: the callback upserts the same
`data.source_tokens` + `data.connector_schedule` pair.

Two refresh paths are **known-good but untested in production**: Meta and Monday. PR #42 made
`classify()` treat a plain 401 as an auth failure for every source, so a revoked Meta or
Monday token now queues for refresh where it previously never did. Neither source has been
live, so the first real run is the first real test — watch `connector_health_v1` after
attaching them rather than assuming.

After each one, have Nate run that source's §x.4 verification SQL and paste the output.
Success = `connector_health_v1.status` healthy with a `last_success_at`, and non-zero counts
in both `data.*` and the matching `api.*_v1` view.

## Then connect the SB dashboard

- Confirm `data.clients.app_url` for `sb` points at `https://sb.bcn-services.com`.
- Confirm the hub at `connect.bcn-services.com` shows SB with all five source cards populated.
- Confirm sign-in at the hub opens SB with no second login.
- `/library`'s migration is already applied on hosted (verified 2026-09-18), so a redeploy
  of `apps/sb` is safe. CI deploys were fixed the same day (PR #37) — the pipeline is green.

## Done when

All five sources show a healthy `connector_health_v1` row with real counts, the hub lists
SB with five connected cards, and SB's dashboard renders live numbers Declan recognises.

## Report back

One short summary: which sources attached, which failed and at which checklist id, what is
still owed by Declan, and whether the chunk 4b migration is still unapplied.
