# Chunk 7 — Google (Meet + Drive) self-serve connect

Status: built on `feat/google-flow-hub` + `feat/google-flow-worker`, shipped dark. Decided 2026-10-11.
Builds on `chunk5-drive-scope-finding.md` and `chunk5-google-scope-tiers.md`; doesn't re-derive them.

## Why

Meet and Drive were operator-only: each client consented in an Internal OAuth app in *their own*
Workspace, pasted a refresh token, and we stored it with `onboard.ts` / `add-source.ts`. The worker
refreshed with that client's id (`config.oauth_client_id`) and secret (`attributes.oauth_client_secret`).
On 2026-10-11 the bcns-leads secret was rotated and SB's rows, minted under a different client, went
`auth_failed`. One bcns-owned OAuth client plus hub self-serve ends that coupling and lets a new client
connect Google without bcns in the loop.

## Decisions

| Question | Decision |
|---|---|
| GCP project | `bcns-connect` (number 274953429391), bcns-owned, External consent screen, In production. Not `bcns-leads` (that holds "bcns Internal"). Verified in the Cloud console 2026-10-22: Publishing status In production, User type External, banner "Your app requires verification", 0 users of the 100 user cap, Data Access lists only `drive.readonly` (restricted, "Approval required"). Verification submission status: not verified (Verification Center failed to load). |
| OAuth client | One Web-application client for the hub. Redirects `<HUB_BASE_URL>/api/oauth/{meet,drive}/callback`. |
| Scope | `https://www.googleapis.com/auth/drive.readonly` (restricted). App stays unverified and In production: $0, no CASA, capped at 100 users. `drive.file` was the lead and failed the gate (below): a picked folder grants the folder only, not its children. |
| Folder selection | Google Picker on `/api/oauth/<source>/pick` after consent. The pick is re-checked server-side (`files.get`, must be a folder) with the owner's own token before `api.connect_source`. "Change folder" (`api.set_source_folder`) stays as is. |
| Meet | Same Drive scope. No Meet API scope (g-link not built, g-bp out of scope). |
| `attributes.oauth_client_secret` | Hub rows store none; `config.oauth_client_id` = the env client id. The worker uses the row's own secret when present (operator rows, SB, byte-identical request), else env `GOOGLE_CLIENT_SECRET`, and only if the row's client id equals env `GOOGLE_CLIENT_ID`. Operator rows keep theirs until SB reconnects through the hub. |
| Disconnect | Existing `api.disconnect_source` + worker `disconnect.ts`. Google revocation is per project + user, so revoking one grant revokes both Meet and Drive; the worker already skips revoke while the sibling Google source is still connected. |
| Gate | `meet`/`drive` in `OAUTH_APPROVED_SOURCES` plus all four `GOOGLE_*` hub env vars set. Any missing → card stays "Request connection". |

## Scope gate: test evidence

Run 2026-10-11 on Nate's machine: local hub (`feat/google-flow-hub`) + local worker
(`feat/google-flow-worker`) against the local stack, test tenant bcns-oauth-test, dev client in
`bcns-connect`. Test folder "bcns google-flow test": a root folder holding Doc "gate root note" and
subfolder `sub` holding Doc "gate sub note", both created before the pick.

**`drive.file` + Picker (root folder picked): fails.**

| Call (owner's token) | Response |
|---|---|
| `files.list q='<sub id>' in parents` | `200 {"files":[]}` |
| `files.get <sub note id>` (pre-existing child Doc) | `404 notFound` |
| `files.export <sub note id>` | `403` "The user has not granted the app 274953429391 read access to the file …" |
| `files.get <root id>` (the folder's parent) | `404 notFound` |
| worker backfill | "found nothing to sync: the folder is empty or not shared…" |

The chunk5 practitioner reports were right: under `drive.file` the pick grants only the picked item.
Children, existing or later, are invisible, so the worker can't walk anything.

**`drive.readonly` (same pick, re-consented): passes.**

- Backfill synced "gate root note" (root) and "gate sub note" (in `sub`), rows in `data.media` and
  `data.raw_latest`.
- "gate after-pick note", created in `sub` after the pick, synced on the next incremental tick.
- Meet, picked to a real Meet notes folder, synced its 5 Docs. Disconnect deleted them (0 rows left).
- Both hub cards showed Connected. The Picker loaded and picked in a real browser for both sources.
- The worker refreshed with env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (hub rows carry no secret).

**Disconnect.**

- Meet disconnected while Drive connected: worker `meet_disconnected outcome:"kept_for_sibling"`;
  Drive's refresh still 200. Hub copy says Drive stays connected and Google drops access once both are
  disconnected.
- Drive disconnected (no sibling left): `drive_disconnected outcome:"revoked"`; refresh then `400`,
  `files.get` `401`. Same result earlier for a lone `drive.file` grant.

Local-only notes: run the worker tick with `TASK_COUNT=1` (default 2 hash-partitions clients and can
skip the test tenant); localhost cookies shared across ports can 431 the start route, fixed in dev with
`NODE_OPTIONS=--max-http-header-size=131072` (not a prod issue, one host per cookie jar there).

Known minor (C2 review, not fixed): a status-less `SourceError` from `googleClientCreds` (row client id
≠ env `GOOGLE_CLIENT_ID`, or env missing) is swallowed by `refreshOne` and surfaces as a generic 401
`auth_failed`, not the real reason. The log line still names it.

## Cost and limits

- Free route: no Google or assessor fee until the app passes 100 users (Secret Manager for the worker
  secret costs cents).
- `drive.readonly` is restricted. Unverified, an External In-production app is capped at 100 users
  new users over the project's lifetime (https://support.google.com/cloud/answer/15549945); it can't be
  reset. That covers SB and the first clients.
- Policy, said plainly: Google requires a security assessment for apps that store restricted-scope
  data on servers, which the worker does. Staying unverified under 100 users is the route Google
  leaves open without one; it is not an exemption from Limited Use, which still applies in full.
- Past 100 users: restricted-scope verification **plus** a CASA assessment, the only paid step. One
  assessor's rate card (TAC Security, `chunk5-drive-scope-finding.md`): AL1 Basic **$675** one-time with
  2 revalidation cycles, up to $5,400 for AL2; Google requires reassessment every 12 months, so budget
  it as recurring. Not built, not scheduled; Nate decides when the user count nears 100.
- Refresh tokens: the 7-day expiry is documented only for External + **Testing** status
  (https://developers.google.com/identity/protocols/oauth2, "Refresh token expiration"). The app is
  In production, so hourly sync keeps tokens alive. A token unused for 6 months dies; one Google
  account holds at most 100 refresh tokens per client (oldest silently invalidated).
- Unverified-app screen: owners see Google's "unverified app" warning and click through Advanced. Fine
  for SB (Nate, Declan) and clients we onboard on a call; a cold self-serve client may balk. Removing it
  for a restricted scope means verification + CASA (step 8).

## Hub flow (apps/connect)

1. `POST /api/oauth/<source>/start`: cross-site check, gate, owner session, signed state cookie, 303 to
   Google (`access_type=offline`, `prompt=consent`).
2. `GET /api/oauth/<source>/callback`: verify state, exchange the code, require a refresh token and
   the granted scope, seal the tokens (AES-GCM) into an httpOnly cookie on the pick path. Nothing is
   written yet.
3. `GET /api/oauth/<source>/pick`: render the Picker (`apis.google.com/js/api.js`, folder view,
   `setAppId(GOOGLE_CLOUD_PROJECT_NUMBER)`, the sealed access token, `GOOGLE_PICKER_API_KEY`).
4. `POST /api/oauth/<source>/pick`: same-origin check, unseal, verify the folder id with Drive, then
   `api.connect_source` (`p_kind google_oauth_refresh`, `p_config {folder_id, oauth_client_id}`).

Code: `lib/google-oauth.ts` (pure: URLs, exchange, verify, connectArgs, seal), `lib/google-connect.ts`
(route halves), six thin route files. `GOOGLE_SCOPES` in `lib/google-oauth.ts` is the only place the
scope string lives. Tests: `tests/google-oauth.test.mjs`.

Hub-redesign overlap: no edits to `globals.css`, `page.tsx`, `layout.tsx`, `nav.tsx` or
`sources/[source]/page.tsx`; new routes and lib files plus one-line additions to `oauth-config.ts`
and `source-settings.ts`.

## Privacy policy (apps/web)

`lib/content.ts` already carries Google's Limited Use sentence (:1071) and describes what Meet and
Drive sync stores (:1033). Brand verification checks for that sentence. Recommended, not done here:
make "Google User Data Policy" a link to
https://developers.google.com/terms/api-services-user-data-policy.

## Nate's hosted steps

Run `./google-flow-wizard.sh` from the repo root; it walks these in order. Nothing goes live until step 7.

1. **Consent screen** (`bcns-connect` → Google Auth Platform): Branding has the app name, support email
   nseluga@bcn-services.com, homepage https://bcn-services.com, privacy https://bcn-services.com/privacy,
   terms https://bcn-services.com/terms, authorized domain `bcn-services.com`. Audience: External,
   In production.
2. **Data access**: only `https://www.googleapis.com/auth/drive.readonly` (restricted). Done 2026-10-11; confirm
   nothing else is listed.
3. **Prod OAuth client**: Web application "bcns Connect hub", origin `https://connect.bcn-services.com`,
   redirects `https://connect.bcn-services.com/api/oauth/meet/callback` and `.../drive/callback`.
4. **Prod Picker key**: API key restricted to the Google Picker API, websites
   `https://connect.bcn-services.com/*` and `https://docs.google.com/*`.
5. **Droplet**: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY`,
   `GOOGLE_CLOUD_PROJECT_NUMBER=274953429391` to `/srv/connect/env`, restart `bcns-app@connect`, confirm
   a new pid. Cards still say "Request connection".
6. **Cloud Run worker**: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the job `bcns-data-worker`
   (`platform/docs/deploy-worker.md`, `platform/scripts/gcp-setup.sh`). This must happen before step 7,
   or the first hub-connected row fails refresh.
7. **Open the gate** (done: `meet` and `drive` are in the live gate and all `GOOGLE_*` keys are set on the droplet, verified 2026-10-22; live state is on the droplet, not in the repo): add `meet,drive` to `OAUTH_APPROVED_SOURCES` in `/srv/connect/env`, restart, and
   confirm the Connect button.
8. **Verification** (free, optional until a cold client): brand verification (homepage, privacy, domain
   in Search Console) removes nothing on its own for a restricted scope. The restricted-scope
   submission (Data access → features, a ≤1000-char justification, a YouTube demo of consent + pick)
   ends in a CASA requirement, so the free route is to **stay unverified under 100 users** and accept
   the warning screen. Submit only when ready to pay for CASA.
9. **Clean-up**: delete the dev OAuth client "bcns Connect hub (local dev)" and the dev Picker key once
   prod works. `bcns-connect-511400` is a duplicate project with a cancelled auth setup; delete it in
   the console when convenient (it holds nothing).

## SB migration

Once live, SB reconnects Meet and Drive through the hub as its owner. That replaces the operator rows
(per-tenant client + stored secret). Until then SB stays on the operator path; nothing here touches SB rows.
