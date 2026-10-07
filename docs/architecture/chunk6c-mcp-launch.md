# Chunk 6c — MCP launch: connector OAuth, read policy, audit

Spec. Written 2026-10-05 against `main` 80926e2; approved by Nate the same day. Supersedes the build path in
`chunk6b-mcp-oauth.md` (its research stands). Built as PRs A–E below.

## Context
bcns wants clients to paste `https://mcp.bcn-services.com/mcp` into Claude.ai / ChatGPT "Add connector", sign in with their Connect account, and have the connector keep itself authed. Today: bearer-only, 10-min JWT, nothing refreshes, `/access` hands out a terminal snippet. chunk6b parked OAuth on supabase/auth#2820 (still open) and costed a 3–4 day fallback that *proxied Supabase's OAuth server* (still hits the `client_id` claim collision + needs a held client secret).

Verified this session (read-only):
- Prod: 7 users, all `email` provider with passwords, 0 MFA factors. Hub login = server-side `signInWithPassword` with anon key (`apps/connect/app/login/actions.ts:9-22`).
- No audit table exists; write pattern = security-definer RPC + `data.tenant_or_raise()` (`20260912000500_api_rpcs.sql:3-8`).
- nginx 443 vhost forwards all paths to :3103 (`infra/onboard-client.sh:159-176`); `/.well-known/*` reaches node, which 404s it today.
- Hub cookie domain is `.bcn-services.com` → mcp host receives it. The AS must ignore it.
- MCP spec 2026-07-28: DCR deprecated but allowed; CIMD SHOULD (optional); RFC 9207 `iss` SHOULD. Claude docs warn strict Origin checks break connectors; Claude redirect `https://claude.ai/api/mcp/auth_callback`; Claude Code uses loopback any port; refresh reactive on 401 + proactive 5 min before expiry; `invalid_grant` on dead refresh; 10 s endpoint timeout; Free plan = 1 custom connector.
- ChatGPT facts are from chunk6b (2026-09-21), not re-verified (OpenAI docs fetch was blocked) → ChatGPT is best-effort, tested by hand.
- Prod `attributes` keys: messages → `owners`, `modified_time`; products → `variants`; money → none yet; records → dashboard ledger fields.

## 1. Capabilities at launch

Principle (Nate, 2026-10-05): give clients their own data, safely. Industry pattern followed (Stripe restricted keys, HubSpot connect-time checkboxes, Shopify-store MCPs): scope to the business's own login, the business chooses what to share, reads free / writes confirm, every call logged.

**Read, in:** `read_view` over the 16 default views + `customers_v1` (17). Changes:
- Column allowlists (new `agentTools`/`runTool` option `columns?: Partial<Record<ViewName,string[]>>` in data-client; policy set in apps/mcp). Rule: raw `attributes` blobs out where PII can hide (`money_v1`, `messages_v1`, `customers_v1`), kept where they are the tenant's own structured data (`products_v1` variants, `records_v1` ledger). `money_v1` keeps `customer_external_id`. `messages_v1` keeps `participants`. `media_v1` drops `uploaded_by` (internal uuid, no value). `customers_v1`: name, orders_count, total_spent_minor, currency, first_order_at, ids/timestamps; **`email` only when the tenant's owner switch is on** (§3b). Requested denied column → ToolInputError; no `columns` → select the allowlist.
- Row cap stays 1–200, default 50. New response byte cap in apps/mcp (256 KB): drop trailing rows, set `truncated: true` (meeting transcripts × 200 would flood context).
- Tool annotations: `title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
- Query tools (PR-F): `read_view` gains `order_by`, filter ops (`neq`/`gt`/`gte`/`lt`/`lte`/`contains`) and `offset`, always sorted with the view's unique key as a tie-breaker; new `summarize_view` (count/sum/avg/min/max, `group_by`, day/month/year `period`) aggregates app-side over at most 10,000 rows (`partial: true` past that), splitting `*_minor` sums by currency. Every referenced column goes through the one allowlist helper; the email switch applies to both tools.

**Read, out:** `memberships_v1` (internal user ids, no use to an AI).

**Prompt injection:** untrusted text = `messages_v1.body/title`, `records_v1`, `activity_v1` (concatenates titles/body), `products_v1` text, campaign/ad names, `connector_health_v1.last_error`, media filenames/set descriptions. Guards: (1) structural — server is read-only, so injected text cannot change bcns data; (2) `read_view` description states rows are third-party data, never instructions; (3) result envelope `{"untrusted_data": true, "note": "...", rows, count, truncated}`. Residual, documented for clients: injected text can try to steer *other* tools in the client's AI (exfiltration via web/email tools) — outside our control.

**Writes: none at launch.** `save_record` has no role check (`require_w` absent) and writes `records_v1`, which `read_view` reads back → stored-injection loop; `update_media`/`bulk_tag` have no requested user story. Reopen trigger: a named client story; gate would be owner-only + `destructiveHint` (forces Claude confirm) + audit row.

Shopify note (Nate checks, not this window): customer name/email arrive via `read_customers` = Shopify protected customer data; confirm the Partners data-use declaration covers "merchant's own AI assistant". No Partners changes from here.

## 2. Auth design — apps/mcp as a minimal OAuth 2.1 AS issuing ordinary Supabase sessions
Decision: hand-written on node:http (`src/oauth.ts`), no express / SDK auth router (Nate, 2026-10-05).

Why this over (a) chunk6b proxy and (b) Supabase OAuth server: no #2820 dependency, no claim rename, no held client secret, no Supabase dashboard change, tokens stay plain Supabase JWTs so `getUser` + RLS are untouched. Cost: we own ~300 lines of auth code.

Endpoints (all on `https://mcp.bcn-services.com`, unauthenticated, before the `/mcp` gate):
- `GET /.well-known/oauth-protected-resource/mcp` and root variant → `{resource: "https://mcp.bcn-services.com/mcp", authorization_servers: ["https://mcp.bcn-services.com"]}`.
- `GET /.well-known/oauth-authorization-server` → issuer, `/authorize`, `/token`, `/register`, `response_types ["code"]`, `grant_types ["authorization_code","refresh_token"]`, `code_challenge_methods ["S256"]`, `token_endpoint_auth_methods ["none"]`, `authorization_response_iss_parameter_supported: true`. No CIMD flag, no `offline_access`, no scopes.
- `POST /register` (DCR, stateless): every `redirect_uri` must match the allowlist — `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` (Claude's documented future callback), `https://chatgpt.com/connector_platform_oauth_redirect`, `https://chatgpt.com/connector/oauth/<id>`, `http://localhost:<port>/…`, `http://127.0.0.1:<port>/…`. Returns a random `client_id`, stores nothing.
- `GET /authorize`: validate `response_type=code`, `code_challenge_method=S256`, `redirect_uri` ∈ allowlist, `resource` (if present) = canonical MCP URL; render a plain HTML form ("Claude (claude.ai) wants read-only access to your bcns data", email + password). The page also says "Only continue if you started connecting from your own <app> just now"; a loopback redirect is labelled "An app on your computer". Headers: CSP `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' <redirect origin>` (the redirect origin is needed because form-action also governs the 302 after the POST), `frame-ancestors 'none'`, `no-store`, `Referrer-Policy: same-origin` (`no-referrer` makes browsers send `Origin: null` on the POST, which the Origin check rejects). An invalid request (bad `redirect_uri`, `client_id`, PKCE, `resource`) gets a 400 page, never a redirect.
- `POST /authorize`: Origin must be `https://mcp.bcn-services.com` (absent or `null` → 403); per-IP limit (existing `createRateLimiter`, key = last `X-Forwarded-For` hop, IPv6 grouped by /64, 10/min), then a per-IP cap of 2 upstream sign-ins/min, then a global cap of 3 upstream sign-ins/min (form re-renders 429 "Too many sign-in attempts"); GoTrue `/auth/v1/token?grant_type=password` with the anon key as one plain `fetch`, 8 s timeout, no retries → a **new, separate** session (never the hub cookie's). Hook 403 (no membership / inactive client) or no `client_id` claim (pending) → form error, no code. Success → 32-byte random code in an in-memory Map `{access, refresh, expires_in, challenge, redirect_uri, client_id}`, TTL 60 s, single use; 302 to `redirect_uri?code&state&iss`.
- `POST /token` (form-encoded): `authorization_code` → check code unused/unexpired, `redirect_uri` + `client_id` match, PKCE S256 → `{access_token, token_type: "Bearer", expires_in, refresh_token}`. `refresh_token` → GoTrue `/auth/v1/token?grant_type=refresh_token` with the anon key, one plain `fetch`, 8 s timeout, no retries (supabase-js `refreshSession` retries network errors for ~25 s, past Claude's 10 s timeout). GoTrue 400, GoTrue 403 (hook: no membership) or no `client_id` claim → 400 `invalid_grant`; any other non-2xx (401/404/429/5xx), network error or timeout → 503 `temporarily_unavailable` (the MCP SDK discards stored tokens on `invalid_grant`, so a GoTrue blip or a rotated key must not map to it). `Retry-After: 1` on network error/timeout (8 s timeout + 1 s stays inside GoTrue's 10 s reuse window if the client honours it), 60 on every other 503. Each non-2xx GoTrue answer logs one stderr line `{"event":"gotrue_refresh_failed","status":N}` (`gotrue_signin_failed` for sign-in), status only. Limits — *known IPs* (an ipKey that completed a code exchange, a refresh or an authed `/mcp` call in the last hour; in-memory, max 1000, oldest evicted) get 10 attempts/min per IP plus the global 15 upstream refreshes/min. Unknown IPs are charged before the upstream call: 3 attempts/min per IP and a shared 5/min for all unknown IPs, plus the global 15. A junk flood can take at most 5 of the 15 slots. Any cap → 503 + `Retry-After: 60`. Rotation is Supabase's (on, 10 s reuse).
- 401 on `/mcp` → `WWW-Authenticate: Bearer resource_metadata="https://mcp.bcn-services.com/.well-known/oauth-protected-resource/mcp"`.
- Origin on `/mcp`: absent OK; allowlist `https://mcp.bcn-services.com`, `https://claude.ai`, `https://chatgpt.com`; anything else 403 and one stderr line naming the origin (manual test reveals any surprise).
- Existing bearer path unchanged: any valid member token still works (CLI, smoke tests).

Storage: none in Postgres for auth. In-memory codes only; a restart mid-sign-in = user clicks Connect again.

Known deviations / ceilings (written into the doc):
- No RFC 8707 audience binding: tokens carry `aud=authenticated`; a hub session token is also accepted at `/mcp` (as today). Same user, same RLS, token never forwarded beyond our own Supabase project.
- Every connector sign-in and refresh hits GoTrue from the droplet IP: shares the per-IP `sign_in_sign_ups` (30/5 min ≈ 6/min) and `token_refresh` (150/5 min = 30/min) buckets with the hub. The global caps (3 sign-ins/min, 15 refreshes/min) keep half of each bucket for the hub. Ceilings: connectors refresh about every 5 min while active, so ≈75 concurrently active connectors before refreshes get 503 (they retry; nothing is discarded); an unknown-IP flood lowers that to ≈50. Accepted: an attacker rotating 2+ IPs (/64s for IPv6) a minute can keep the global sign-in cap full and block *new* connector sign-ins while it lasts; existing connections keep refreshing and hub sign-in is unaffected. Upgrade: a free form challenge (e.g. Cloudflare Turnstile) checked before the sign-in caps. Caps and the known-IP set are per process and reset on restart. Upgrade: raise the hosted limits (free, Supabase dashboard) and the caps with them, or forward the client IP.
- DCR-only: Claude makes a new client_id per connection; free because nothing is stored.
- Revocation: removing a member/deactivating a client kills it (hook 403 on refresh, `active_client_id()` live check). No per-connector revoke UI at launch.
- Shared-callback consent phishing (residual): the Claude and ChatGPT callbacks are shared by every account on those products. Someone can start "Add connector" in *their own* Claude account, copy the sign-in URL, and trick a bcns user into signing in on it; the code then lands in the attacker's Claude, connected read-only to the victim's data. Every public-client MCP server with shared callbacks has this. Mitigation at launch: the sign-in page names the app and tells the user to continue only if they started this themselves. Removing a member or changing the password cuts it off. Upgrade: CIMD client metadata or a per-connector revoke list.

## 3. Observability
Migration `platform/supabase/migrations/20261006000100_mcp_audit.sql`: `data.mcp_tool_calls(id, client_id, user_id, tool, view, row_count, ok, error_code, at)`, RLS forced, `tenant` select policy; `api.log_mcp_call(tool, view, row_count, ok, error_code)` security definer, `tenant_or_raise()` + `auth.uid()`, execute granted to `authenticated` only. apps/mcp calls it after each `tools/call` with the caller's token (no privileged key), fail-open + one JSON stderr line. A tenant can forge rows only for itself (documented). bcns answers "what did the AI read" with a read-only SELECT. Retention: none at launch (rows are tiny). Logged `tool`/`view` are canonical: an unlisted tool name (including "") logs as `unknown`; `view` is logged only for `read_view` on an allowed view, else null, so injected text never lands in the table. Ceiling: `runTool` itself has no timeout, so a view read that stalls in PostgREST is never audited (a client-side abort would not cancel the query).

### 3b. Owner switch: "Let AI see customer contact info"
Same migration: `data.ai_settings(client_id pk → clients, share_customer_contact boolean not null default false, updated_at, updated_by)`, RLS forced, tenant select policy; `api.get_ai_settings()` RPC returning `{share_customer_contact}` (built as an RPC, not an `api.ai_settings_v1` view: a view would need an entry in data-client's exhaustive `VIEW_DESCRIPTIONS` and become readable through `read_view`); `api.set_ai_settings(p_share_customer_contact boolean)` security definer, raises unless `active_client_role() = 'owner'`. Missing row = off. apps/mcp reads it only on a `customers_v1` call and adds `email` to the allowlist only when the result has an own property `share_customer_contact === true`. The read is raced against a 2 s timeout; timeout, error or odd shape = off (fail closed). The audit row is still written. Enforced in apps/mcp (the DB can't tell an MCP token from a hub token); the AI only reaches data through apps/mcp tools. Hub toggle on `/access` (owner-only page already), server action → RPC.

## 4. Fixes
- 10-min tokens: kept; the connector refreshes. No `jwt_expiry` change.
- `/access`: replace the mint snippet with connector steps (Claude.ai, ChatGPT, Claude Code `claude mcp add --transport http bcns https://mcp.bcn-services.com/mcp`). Remove `MintForm` + action; leave the `mint-agent-login` Edge Function (platform, out of scope; note as deletable later).
- README "Ceilings" + `platform-v1.md` deferred line + chunk6 OUT-OF-SCOPE note: point to chunk6c.

## 5. PR split (each branch off origin/main, draft, CI green)
| PR | Content | Deploys on merge? | Engineer / review |
|---|---|---|---|
| A | `docs/architecture/chunk6c-mcp-launch.md` (this spec, final) | no | inline |
| B | data-client `columns` option + description guard + annotations; apps/mcp column policy (customers_v1 without email), envelope, byte cap; tests | yes (packages/**, apps/mcp) | Sonnet dt-engineer, dt-qa, Opus dt-review |
| C | migration: audit table + `log_mcp_call`, `ai_settings` + `set_ai_settings` (owner-only) + view; platform tests (RLS, member can't flip switch, forge-own-tenant-only); apps/mcp audit call fail-open + email gate | yes; migration needs Nate's db push | Sonnet, dt-qa, Opus dt-review |
| D | AS endpoints (`src/oauth.ts`), 401 header, Origin allowlist, tests for every auth path (missing, expired, wrong/absent resource, no client_id, pending, bad origin, PKCE mismatch, code reuse, expired code, bad redirect, refresh ok, refresh invalid_grant vs 503, login + upstream rate limits) | yes | Sonnet dt-engineer, dt-qa, Opus dt-review + Opus security review pass |
| E | `/access` connector instructions + owner switch toggle, README/doc pointers | yes (apps/connect) | Sonnet, Opus dt-review |
B, C and D all edit `apps/mcp/src/mcp.ts` or `server.ts`, so whichever merges later rebases. Order: A → D → B → C → E (E only after D is deployed). dt-analyze runs once first.

## 6. Rollout, test plan, rollback
- Every merge of B–E restarts sb, connect and mcp for a few seconds. That timing is Nate's call around the Shopify review.
- Rollback: revert the PR, or `workflow_dispatch` deploy-app with slug `mcp` from the previous SHA. The OAuth routes are additive, so the bearer path keeps working.
- Manual test (after D+B+C merged, migration pushed):
  1. Claude.ai → Settings → Connectors → Add custom connector → `https://mcp.bcn-services.com/mcp`. Expect a redirect to the bcns sign-in page that names claude.ai.
  2. A wrong password shows an inline error and no redirect.
  3. Sign in as the SB smoke user. Expect a return to Claude, connected, with tool `read_view` shown as read-only.
  4. Ask "what is my business name in bcns". Expect a `client_v1` answer.
  5. Wait 15 minutes and ask again. Expect it to work without re-login (refresh).
  6. Ask for meeting notes. Expect body and participants, with no `attributes`.
     Ask "top 5 customers by spend". Expect names and totals, no emails.
     Ask "refunds by month this year". Expect one row per month with a total, split by currency, no `partial` note.
     Flip the owner switch on `/access`, then ask again. Expect emails to appear.
     Sign in as a member. Expect the `/access` toggle to be unreachable.
  7. Read-only SQL on `data.mcp_tool_calls` for that tenant shows rows for each call.
  8. Repeat with Claude Code `claude mcp add`, then ChatGPT developer-mode connector (best-effort).
  9. Negative: a pending sign-up account gets the form error "no active bcns membership".

### Launch verification 2026-10-06

Run by Nate in claude.ai and Claude Code; evidence is read-only SQL on prod (`data.mcp_tool_calls`, `data.ai_settings`), times UTC 2026-10-07. Tenant: `bcns-oauth-test` (owner login), not the SB smoke user. No tenant had customer or order rows, so the data checks compare empty to empty.

| Step | Result | Evidence |
|---|---|---|
| 1 | PASS | `/authorize` with the claude.ai callback rendered "Claude (claude.ai) wants read-only access to your bcns data" plus the "only continue if you started" warning. First attempt failed in Claude itself (`oauth_error=connect_request_unconfirmed`, never reached `/authorize`); retry worked. Claude auto-detected OAuth + DCR. |
| 2 | SKIPPED | Wrong password not tried live; covered by #115 tests. |
| 3 | PASS | Signed in, returned to Claude connected. Read-only label in the tool list not checked. |
| 4 | PASS | 00:15:30 `read_view client_v1` 1 row ok → "bcns OAuth Test". A bare "what's my business name" got no tool call (Claude answered from memory); the prompt has to name bcns or the tool. |
| 5 | PASS | Idle 00:24:32 → 00:43:43 (19 min, past the 10-min token), `read_view client_v1` ok, no re-login. |
| 6 notes | SKIPPED | `messages_v1` empty for this tenant; meeting-notes column check not exercised. |
| 6 top 5 | PASS | 00:18:56 `read_view customers_v1` 0 rows = SQL `api.customers_v1` 0 rows; no emails. |
| 6 refunds | PASS | 00:19:16/18 `summarize_view money_v1` 0 rows = SQL `api.money_v1 kind='refund'` YTD 0; no `partial`. |
| 6 switch | PASS | Off: 00:22:19 `read_view` and 00:22:20 `summarize_view` on `customers_v1` asking for `email` → `ok=false error_code=input` ("column not available on customers_v1: email"). On: `ai_settings.share_customer_contact=true` 00:24:16 by owner → same `read_view` ok 00:24:32. Back off 00:26:05. |
| 6 member | SKIPPED | No member login for this tenant. |
| 7 | PASS | 11 rows for `bcns-oauth-test` (7 `read_view`, 4 `summarize_view`, 2 `ok=false`), one per call above, including the two refusals. |
| 8 Claude Code | PASS | `claude mcp add` + `/mcp` Authenticate; 00:56:12 three calls ok (`summarize_view`/`read_view messages_v1`, `read_view client_v1`). A leftover local-scope `bcns` entry with a static `Authorization` header (old mint snippet) blocks OAuth and 401s; remove it first. |
| 8 ChatGPT | SKIPPED | Best-effort, not run. |
| 9 | SKIPPED | No pending sign-up account used. |

#116 hand-checks: (1) top 5 by spend — match (0 = 0); (2) refunds by month — match (0 = 0); (3) email with the switch off — refused on both tools. The PR body's `money` is the view `api.money_v1`, column `amount_minor`.

§7: Supabase Auth rate limits read from the dashboard — token refresh 150/5 min per IP, sign-ups + sign-ins 30/5 min per IP, token verifications 30/5 min; matches §2's assumptions. Shopify protected-customer-data declaration: not read (Partners not signed in on the Work profile; app in review). Open: after review, confirm a listed reason covers the merchant's own AI assistant before any Shopify client connects an AI.

## 7. Nate by hand
- `supabase db push --workdir platform` after C merges (his terminal; passkey account).
- Merge commands `! GITHUB_TOKEN= gh pr merge <n> --squash --repo bcn-services/bcns`, timing vs Shopify review.
- Optional, free: Supabase dashboard → Auth → Rate limits, check hosted `token_refresh` and sign-in values.
- Shopify Partners: confirm the protected-customer-data use declaration covers the merchant's own AI before telling a Shopify client to connect (read-only check; no change during review).
- No new env keys, no DNS, no Supabase OAuth server toggle, no cost ($0; a Claude Free plan allows 1 custom connector).

## 8. Re-scoped estimate
B 0.5 d, C 1 d (audit + owner switch), D 1–1.5 d, E 0.5 d, A + review loops 0.5 d → **~3.5–4 days of agent time** (vs. chunk6b's 3–4 d for a proxy that still collided). The saving comes from not proxying Supabase's OAuth server: no secret, no rename, no consent-page plumbing in apps/connect.

## Verification (per PR)
- Per PR: `cd apps/mcp && tsc && node --test tests/*.test.mjs`; `pnpm --filter @bcn-services/data-client test`; platform-ci green (C runs the local-stack platform tests); `pnpm lint typecheck`.
- `no-privileged-key.test.mjs` stays green (nothing new holds a privileged key).
- Done: draft PRs open, hand-check list in each body, handoff file written, merge commands handed over, no merge.
