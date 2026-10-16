# Declan call 2: SB setup checklist (2026-10-16)

Run-sheet for the next call with Declan (SaunaBoy, slug `sb`). Same shape as `declan-call-window.md` (2026-09-21); mechanics for `add-source` stay in `platform/docs/connection-day.md`. Private artifact version: https://claude.ai/artifact/EQazmAKPBoLT9P1y2k9k8R

Tags: **Nate** / **Declan** / **Claude**. Every step has a hand-check.

Source status (per SB README and 10-15/10-16 notes, not re-checked live): Shopify connected via the bcns-data-2 bridge, Monday ok, Meet and Drive active, QuickBooks not connected, Meta not attached.

Out of scope for v1 (agreed 2026-09-15): AI features, agent chat. Nothing here touches the droplet, the gate, Partners, Intuit or Meta settings except where a step says Nate does it himself.

## 0. Before the call

| # | Who | Step | Hand-check |
|---|---|---|---|
| 0a | Nate | Chrome Work profile signed in to the hub as SB's owner | SB shows Connect buttons (owner role) |
| 0b | Nate | Wizard terminal ready: `bash ~/bcns-v1-overnight-wizard.sh` in own terminal, not `!` | First stage prompt appears |
| 0c | Nate | Confirm `quickbooks` and `meta` are in `OAUTH_APPROVED_SOURCES` (`/srv/connect/env` on the droplet) | Signed in, both cards show Connect, not "Request connection". If missing: add, restart `bcns-app@connect`, confirm new pid; not mid-call |
| 0d | Nate | `curl https://sb.bcn-services.com/api/health` | `{"ok":true,"platform":"connected"}` |
| 0e | Claude | Live check once Supabase MCP is re-authed: SB source rows, schedule rows, membership count by role (never token columns) | Matches the status line above |
| 0f | Nate | Decide the monthly fee: quote (`clients/sb/quote/2026-08-26-sb.md:162`) says $100/mo, an open question says $110 | Decision made before sign-off |

## 1. QuickBooks

Production live since 2026-10-05; Intuit assessment Approved 2026-10-15.

| # | Who | Step | Hand-check |
|---|---|---|---|
| 1a | Declan | Sign in to the hub as SB's owner and a QuickBooks Online admin; QuickBooks, Connect, approve on Intuit | Redirects back, card shows connected. No button: not an owner. Wrong company: disconnect, reconnect |
| 1b | Nate | Open SB `/financials` after first sync | Quarterly Budget renders, Recent Transactions has real rows, health shows a last success time |
| 1c | Claude | Read-only check of SB's QuickBooks source and schedule rows | One row, status active, next run set |

## 2. Meta Ads

Nate picks the route on the call. Route A is free and recommended.

**Route A (recommended).** Declan adds Nate's Facebook user as Analyst on SB's ad account; Nate connects Meta in the hub as SB (`meta` is in the gate). Token lasts 60 days until the `ads_read` App Review passes (submitted 2026-10-15, up to 20 days). Reconnect reminder at day 55.

| # | Who | Step | Hand-check |
|---|---|---|---|
| 2a | Declan | Business Settings, Accounts, Ad accounts, SB's account, Add people: Nate's Facebook user, Analyst | Nate sees the account in Ads Manager |
| 2b | Nate | Hub as SB owner: Meta, Connect, choose SB's ad account | Card connected; campaign data after first pull; health shows last success. Account not listed: role not accepted, use Route B |
| 2c | Nate | Calendar reminder: reconnect Meta on day 55 or after App Review passes | Reminder exists |

**Route B (fallback).** System-user token, never entering a chat window.

| # | Who | Step | Hand-check |
|---|---|---|---|
| 2d | Declan | Business Settings, Users, System users: create, grant `ads_read` on SB's ad account, generate token. Also send ad account id and Ads Manager URL | Token type SYSTEM_USER (M1) |
| 2e | Nate | Own terminal, hosted env exported: `corepack pnpm tsx platform/scripts/add-source.ts --slug sb --source meta`; prompts act_id, ads_manager_url, system user token (typed by Nate) | `attached meta to sb`, next pull time. M1/M2 pass; M3 timezone is a warning only (record answer in client notes). M1 fail: personal token. M2 fail: wrong id or missing `ads_read` |

Draft message to Declan (Nate sends):

> Hi Declan, for Meta we need one thing from your side. In Business Settings, go to Accounts, then Ad accounts, pick SaunaBoy's ad account and add me as a person with the Analyst role. That lets me connect it from the hub on our call. If you'd rather not add me, send me a system-user token with ads_read only plus the ad account id, and I'll show you where it goes. Thanks, Nate

## 3. Shopify numbers

| # | Who | Step | Hand-check |
|---|---|---|---|
| 3a | Declan | Clear the passkey prompt on SaunaBoy's Shopify admin (Work profile) | Nate sees the admin Analytics page |
| 3b | Declan | State the admin's timezone (expect America/New_York, as stored) | Same as stored, else record in client notes |
| 3c | Nate | Pick one closed range; compare orders, gross sales, AOV in admin vs SB dashboard | Figures match or gap has a known cause. Mismatch: record range, timezone, both figures; do not reconnect (a second OAuth grant kills the refresh token; one shop = one tenant) |

## 4. Team logins

5 memberships exist: 2 owner, 3 member.

| # | Who | Step | Hand-check |
|---|---|---|---|
| 4a | Declan | Names who at SB gets a login and who is an owner | List of names; each is an existing membership or needs an invite |
| 4b | Nate | Confirm wizard stage 5 (Resend SMTP on Supabase Auth) passed | Stage 5 done. If not, do not invite |
| 4c | Nate | Wizard stage 14, SB team invites | Invitee gets the email, signs in to the hub, opens SB with no second login |

## 5. Taste list (`~/bcns-v1-overnight-morning.md` section 6)

| # | Item | Note |
|---|---|---|
| a | "Connected Google Drive folder" copy shows when Drive isn't connected | Locked by DESIGN.md and a test |
| b | Sector budget can't be set to 0 or cleared | Deliberate, tested |
| c | "No data for this range." on Recent Activity (no range) | Wording only |
| d | "QuickBooks Connected" badge hard-coded | Matters now that QuickBooks can connect |
| e | Fonts fetched from Google at build time | Likely fixed by vendored Inter Tight (#131); verify |

| # | Who | Step | Hand-check |
|---|---|---|---|
| 5a | Nate | Walk the list; mark keep, change or skip | Every item has a decision |

## 6. Sign-off

| # | Who | Step | Hand-check |
|---|---|---|---|
| 6a | Declan | Confirms the dashboard shows numbers he recognises; approves delivery | Clear yes, or a short blocker list |
| 6b | Nate | State the fee (amount from 0f); monthly fee starts at sign-off | Declan agrees the start date; noted in client notes |
| 6c | Claude | After the call: update SB README with outcomes and what Declan still owes | README matches what was agreed |
