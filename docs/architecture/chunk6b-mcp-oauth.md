# Chunk 6b — MCP OAuth for `apps/mcp` (research)

Research only. Written 2026-09-21 against `main` 331bfa4. No code, no dashboard changes.
"unverified" = not confirmed from a primary source or a live test.

## Verdict

1. **Spec side is small.** `apps/mcp` is a resource server: serve protected resource metadata,
   send `WWW-Authenticate` on 401, validate audience. It does not run an authorization server.
2. **Supabase Auth is the right authorization server on paper, but is blocked today.**
   Open bug [supabase/auth#2820](https://github.com/supabase/auth/issues/2820) (opened 2026-09-20,
   no fix linked): the consent-screen call `getAuthorizationDetails()` returns 400 when the request
   carries `resource`, `offline_access`, or a public client. Claude and ChatGPT send all three.
   Only "confidential client + `openid email profile` + no `resource`" works. That is not a
   connector flow.
3. **Second blocker, ours:** our access-token hook and Supabase's OAuth server both write a
   top-level `client_id` claim, with different meanings. See §3.3.
4. **Recommendation:** do a one-day spike (§4.1) before any build. If #2820 is fixed by then, the
   build is ~2 days and adds no dependency. If not, the smallest alternative is a thin
   authorization-server facade inside `apps/mcp` (§3.5) — or wait.

---

## 1. What the MCP authorization spec requires of a server

Current spec revision: **2026-07-28** (the `latest` page redirects there). Claude's docs still link
2025-11-25; the requirements below are the same in substance.
Primary: [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[Authorization Server Discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery),
[Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration),
[Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations).

Authorization itself is optional; if an HTTP server does it, it SHOULD follow this spec.

### MCP server (resource server) — what `apps/mcp` owns

| Level | Requirement |
|---|---|
| MUST | Implement RFC 9728 protected resource metadata; document MUST include `authorization_servers` with at least one entry |
| MUST | Advertise it by **either** `WWW-Authenticate: Bearer resource_metadata="…"` on 401 **or** a well-known URI (`/.well-known/oauth-protected-resource[/<path>]`) |
| MUST | Validate access tokens per OAuth 2.1 §5.2, and validate they were **issued for this server** (audience, RFC 8707) |
| MUST | Reject invalid/expired tokens with 401; accept only tokens valid for its own resources; never accept or pass through other tokens |
| MUST | Require `Authorization: Bearer` on every HTTP request; token never in the query string (client duty, server must not accept it) |
| MUST | 403 for insufficient scope, 400 for malformed request |
| SHOULD | Put `scope` in the `WWW-Authenticate` challenge; on 403 send `error="insufficient_scope"` + `scope` + `resource_metadata` |
| SHOULD NOT | List `offline_access` in `scopes_supported` or in the challenge scope |

### Authorization server — what Supabase would own

| Level | Requirement |
|---|---|
| MUST | Implement OAuth 2.1 |
| MUST | Publish RFC 8414 metadata **or** OIDC discovery |
| MUST | If OIDC discovery: include `code_challenge_methods_supported`. Clients refuse to proceed if it is absent |
| MUST | Validate redirect URIs by exact match; HTTPS on all endpoints; redirect URIs `localhost` or HTTPS |
| MUST | Rotate refresh tokens for public clients |
| MUST | Under CIMD: fetch and validate the document, `client_id` must equal the URL, validate redirect URIs against it, show the redirect hostname on the consent screen |
| SHOULD | Support Client ID Metadata Documents (CIMD) — the preferred registration path |
| SHOULD | Short-lived access tokens; include `iss` in authorization responses (RFC 9207) and set `authorization_response_iss_parameter_supported` |
| SHOULD | Cache CIMD fetches; guard against SSRF; extra warning for localhost-only redirects |
| MAY | Support Dynamic Client Registration (RFC 7591). **Deprecated** in this revision, kept for back-compat |

### Client (Claude/ChatGPT) — what we can rely on receiving

MUST: use PKCE with `S256` and refuse if the AS metadata lacks `code_challenge_methods_supported`;
send `resource` (canonical MCP server URL) in **both** the authorization and token requests,
"regardless of whether authorization servers support it"; validate the AS `issuer`.
Registration priority (SHOULD): pre-registered → CIMD (if `client_id_metadata_document_supported`)
→ DCR (if `registration_endpoint`) → prompt the user.

### Token audience, plainly

The spec wants the token bound to the MCP server URL. Supabase's `aud` is `authenticated`
(§3.3), so a strict audience check is not available. See §3.4 for the deviation and why it is
small here.

---

## 2. What Claude's custom connector needs; where ChatGPT differs

Primary: [Claude — Authentication for connectors](https://claude.com/docs/connectors/building/authentication),
[Claude Help — custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

**Claude** (one infrastructure for claude.ai, Desktop, mobile, Claude Code, Cowork):

- Registration order when the user leaves client ID blank: Anthropic-held credentials → **CIMD**
  → **DCR**. Claude picks CIMD only if AS metadata has **both** `client_id_metadata_document_supported: true`
  **and** `"none"` in `token_endpoint_auth_methods_supported`; otherwise DCR (needs `registration_endpoint`).
  Advanced settings let an admin enter a pre-registered client ID (+ optional secret; blank secret = public client).
- PKCE `S256` on every request; AS must advertise `code_challenge_methods_supported: ["S256"]`.
- **Always return a 401** with `WWW-Authenticate: Bearer resource_metadata="…"`; a header on a 200 is ignored.
  Fallback probing: `/.well-known/oauth-protected-resource/<path>` then root.
- PRM `resource` must equal the MCP URL exactly as the user types it (path included).
  Claude uses only the **first** `authorization_servers` entry.
- Scopes: from the 401 `scope`, else PRM `scopes_supported`. Claude appends `offline_access` when the AS lists it.
- Redirect URI to allow: `https://claude.ai/api/mcp/auth_callback`. Claude Code uses loopback
  (`http://localhost:<port>/callback`, `http://127.0.0.1:<port>/callback`); the AS must ignore the port.
- Token endpoint must accept `application/x-www-form-urlencoded`. Refresh is reactive on 401, plus proactive
  up to 5 min before expiry. Return `invalid_grant` for a dead refresh token; rotate refresh tokens.
- Discovery/registration/token endpoints: 10 s limit (30 s for refresh). The AS host must be reachable from
  `160.79.104.0/21` — matters if Supabase sits behind anything.
- DCR makes Claude register a **new client per fresh connection** (client sprawl in Supabase).
- Static bearer header (`static_headers`) is a beta admin-entered option — not a fix for our 10-minute JWTs.

**ChatGPT** ([Building MCP servers](https://developers.openai.com/api/docs/mcp),
[Plugins auth](https://developers.openai.com/plugins/build/auth)):

- Recommends CIMD; supports it with `none` or `private_key_jwt` token auth. DCR "remains supported" when `registration_endpoint` is present; runs once per connection and reuses the client.
- Redirect URI: stable `https://chatgpt.com/connector_platform_oauth_redirect` if the AS meets issuer-identification requirements (RFC 9207 `iss`), else a per-connector `https://chatgpt.com/connector/oauth/{callback_id}`. Copy the exact URI from the connector's management page.
- Sends `resource` and `offline_access` (per issue #2820's reporter; unverified on OpenAI's side).
- Not confirmed from OpenAI docs: PRM requirements, 401 behavior, spec revision targeted — **unverified**; assume the same as the spec.

Net: Claude and ChatGPT both work with **CIMD or DCR**; neither needs anything exotic beyond §1.
A pre-registered confidential client is the fallback for both.

---

## 3. Can Supabase Auth be the authorization server?

### 3.1 Status and limits

Primary: [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server),
[Getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[Token security](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).

- **Beta**, all plans, no extra charge; OAuth users count toward MAU.
- Auth-code + PKCE. Scopes `openid email profile phone`; they shape ID-token content only, not DB access (RLS does that).
- Dynamic registration is a setting (`allow_dynamic_registration`, default off). **CIMD support: not mentioned anywhere in the docs I read — unverified.**
- Endpoints (`<ref>` = `cnsxbglhredokjbvudfd`): `/auth/v1/oauth/authorize`, `/auth/v1/oauth/token`,
  JWKS `/auth/v1/.well-known/jwks.json`, discovery at
  `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` (RFC 8414 path insertion, matches §1's priority-1 URL) and OIDC at `/auth/v1/.well-known/openid-configuration`.
- **Live state, checked 2026-09-21:** our project answers `404 feature_disabled: OAuth server is disabled`
  on the discovery URL. So nothing about advertised metadata (CIMD flag, `code_challenge_methods_supported`, `none` auth method, `authorization_response_iss_parameter_supported`) is confirmed for our project — **unverified** until it is enabled.
- `platform/supabase/config.toml` already carries `[auth.oauth_server] enabled = false`, `authorization_url_path = "/oauth/consent"`, `allow_dynamic_registration = false`.
- Known bugs: [#2820](https://github.com/supabase/auth/issues/2820) (above, open); it also cites #2408 (invalid `/oauth/consent` redirect on hosted projects; not read, **unverified**).

### 3.2 The consent screen we must host

Supabase redirects the browser to `<Site URL><authorization_url_path>?authorization_id=…`. Our page must
(from the docs) call `supabase.auth.oauth.getAuthorizationDetails(id)`, show the client name + redirect
host, then `approveAuthorization(id)` or `denyAuthorization(id)`, and `redirect` to the returned `redirect_url`.
Requirements/constraints found:

- Site URL (Auth → URL Configuration) must be the host serving the page. Our hosted Site URL is **unverified**; changing it also affects email links/redirects, so check what else reads it first.
- The user must be signed in on that host. `apps/connect` middleware already gates every route to a signed-in member (`apps/connect/middleware.ts`), so `/oauth/consent` inherits that — but `signIn` (`apps/connect/app/login/actions.ts`) always redirects to `/`, so an unauthenticated user loses the `authorization_id`. **Login needs a validated `next` param.** Open-redirect care: same-origin paths only.
- The consent page should show the CIMD/DCR `client_name` and redirect hostname (spec MUST under CIMD).

### 3.3 Are the tokens still ordinary Supabase JWTs? Mostly yes — with one collision

Documented: OAuth access tokens are "standard Supabase JWTs" with `sub`, `role: authenticated`, `aud: authenticated`,
`iss`, `exp`, `session_id`, `amr`, plus an OAuth `client_id` claim. Custom access-token hooks run "for **all** token issuance".
So `role=authenticated` → RLS and `auth.getUser(token)` should keep working. **Not tested by me — unverified.**

**The collision (ours, new finding).** `custom_access_token_hook`
(`platform/supabase/migrations/20260912000200_access.sql:4-19`) writes top-level `client_id` = the **bcns tenant UUID**
and `client_role`. `data.jwt_client_id()` (same file, :26) reads `claims->>'client_id'`, and every RLS helper
(`active_client_id`, `active_client_role`) hangs off it. Supabase's OAuth server also puts `client_id` = **the OAuth client's ID**
in the same token. Depending on ordering (hook before or after Supabase adds its claim — **unverified**):

- hook wins → tenant claim intact, OAuth client id lost. Fine for us.
- OAuth wins → `data.jwt_client_id()` returns the OAuth client id (or fails the `::uuid` cast if it is not a UUID) → `active_client_id()` is null → every policy denies. Fails closed, but the connector connects and sees nothing.

Also `packages/tenant/src/membership.ts:38-46` and `data-client`'s `decodeClientId` read the same claim.
If OAuth wins, the fix is renaming the tenant claim (e.g. `tenant_id`) across the hook, `data.jwt_client_id()`,
`membership.ts`, `data-client`, and any migration/tests that reference it — a platform-wide change and its own PR. The hook receives `authentication_method` in its event (per Supabase's hook docs, **unverified**), which may let it write the claim differently for OAuth tokens; the spike decides.

Also: the hook returns **403 for users with no membership or an inactive client**, so token issuance fails at the token
endpoint for them. Good (fail closed), but the error surfaces in the connector as a generic failure.

### 3.4 Lifetime, refresh, audience

- Access-token lifetime: Supabase's doc example shows 3600 s; our project runs 10 min (`config.toml` `jwt_expiry = 600`, and the memory record says hosted matches). Whether OAuth tokens follow the project `jwt_expiry` — **unverified**. 10 min is workable because Claude refreshes on 401 and 5 min ahead.
- Refresh: "automatic refresh token rotation and expiration handled by Supabase". Project has rotation on, 10 s reuse interval (`config.toml:171-174`), which matches the spec's rotate-for-public-clients MUST. Refresh-token lifetime/expiry — **unverified**. Does Supabase return `invalid_grant` on a dead refresh token (Claude needs it)? **unverified**.
- **Audience:** `aud` is `authenticated`, not the MCP URL; Supabase does not honor `resource` (and #2820 shows it currently breaks on it). A custom hook *can* set a per-client `aud`, but PostgREST/RLS acceptance of a non-`authenticated` `aud` is **unverified** and risky. Deviation, stated plainly: `apps/mcp` cannot do RFC 8707 audience binding. Mitigation is structural: the only AS is our own Supabase project, `apps/mcp` never forwards the token anywhere but that same project's Postgres, and RLS scopes every read. A token minted for another Supabase-protected app of ours would also be accepted — cheap extra check: require the OAuth `client_id` claim's client to be one we allowlist (or `iss` = our project) once the collision in §3.3 is resolved. Record as a known spec deviation.

### 3.5 If Supabase stays blocked: the smallest alternative

Ranked by size:

1. **Wait / help upstream** on #2820. Zero code. Unknown timeline.
2. **Thin AS facade in `apps/mcp`** (no new dependency, plain `node:http`): publish our own AS metadata (issuer = `https://mcp.bcn-services.com`, CIMD advertised, `none` auth method, S256), implement `/authorize` (302 to Supabase's authorize as a pre-registered confidential client, stripping `resource`/`offline_access`, storing PKCE/state), `/token` (form-encoded; exchange the code with Supabase using the held client secret, return Supabase's own JWT + refresh token), plus redirect-URI allowlist for Claude/ChatGPT. Tokens stay Supabase JWTs. Costs: ~300–500 lines of security-sensitive code, a Supabase client secret held in `/srv/mcp/env` (breaks today's "no privileged key in apps/mcp" posture — it is not the service-role key, but `tests/no-privileged-key.test.mjs` scope must be checked), and spec's confused-deputy rules apply because we become a proxy. Est. 3–4 days, Opus high.
3. A third-party AS (WorkOS, Stytch, Auth0): new vendor and cost; its tokens would not be Supabase JWTs, so RLS and `getUser` break. **Reject.**

---

## 4. The build (assuming the spike clears §3.3 and #2820)

### 4.1 Spike first (~half a day, Opus high, no product code)

On a throwaway Supabase branch or `supabase start` local stack (not prod): enable OAuth server, register one DCR client, drive the flow with `resource` + `offline_access` + a public client, and confirm: (a) #2820 fixed or still failing; (b) the token's decoded claims — which `client_id` wins with our hook; (c) `getUser(token)` accepts it; (d) discovery metadata contains `code_challenge_methods_supported`, `none`, CIMD flag, `iss` support; (e) access/refresh lifetimes. Output: one paragraph appended here. Go/no-go for §4.2 vs §3.5.

### 4.2 Files

**`apps/mcp`**
- `src/server.ts` — add `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` (unauthenticated, before the `/mcp` gate; today everything but `/api/health` and `POST /mcp` is 404). Body: `{resource: "https://mcp.bcn-services.com/mcp", authorization_servers: ["https://cnsxbglhredokjbvudfd.supabase.co/auth/v1"], scopes_supported: ["openid","email","profile"]}` — `resource` must match the URL users paste exactly.
- `src/auth.ts` — 401 header becomes `Bearer resource_metadata="https://mcp.bcn-services.com/.well-known/oauth-protected-resource"` (currently `Bearer realm="bcns"`). Keep `verifyToken` via `getUser`. Add the issuer/`client_id` allowlist check from §3.4 only after the spike.
- `tests/auth.test.mjs` — assert the new header and the metadata route; keep the no-privileged-key test.
- `README.md` — note the dev-only snippet stays for CLI use (a static header still works alongside OAuth).
- `ALLOWED_ORIGIN` check stays; Claude connects server-to-server, no browser Origin.

**`apps/connect`**
- `app/oauth/consent/page.tsx` — server component: read `authorization_id`, `getAuthorizationDetails`, render client name + redirect host + scopes, Approve/Deny.
- `app/oauth/consent/actions.ts` — server actions calling `approveAuthorization` / `denyAuthorization` and `redirect(redirect_url)`. Re-run the session check per action (pattern in `lib/session.ts`).
- `app/login/actions.ts` + `page.tsx` — accept a same-origin `next` and use it after sign-in; `packages/tenant/src/middleware.ts` must append `?next=` on its `/login` redirect (verified: `redirectTo(loginPath)` at the end of the handler carries no return URL today).
- `middleware.ts` — no change needed; `/oauth/consent` stays gated.
- `platform/supabase/config.toml` — `[auth.oauth_server] enabled = true`, `allow_dynamic_registration = true` (only if no CIMD). This file is local-stack config; hosted needs the dashboard step below.

**Possible, from spike:** rename the tenant claim (§3.3) — `platform/supabase/migrations/*`, `packages/tenant/src/membership.ts`, `packages/data-client` (`decodeClientId`), affected tests.

### 4.3 Hosted steps (Nate, through a wizard confirm)

1. Supabase dashboard → Authentication → OAuth Server → enable; toggle dynamic registration (or confirm CIMD).
2. Authentication → URL Configuration → Site URL + authorization path = the `connect.bcn-services.com` `/oauth/consent`; check what else uses Site URL first.
3. Confirm JWT signing keys are asymmetric (docs recommend RS256/ES256; required for OIDC ID tokens).
4. Deploy `apps/mcp` and `apps/connect` (existing `deploy-app.yml`); confirm the nginx vhost for `mcp.bcn-services.com` forwards `/.well-known/*` to port 3103 (vhost file location **unverified** — not in `infra/bootstrap.sh`/`onboard-client.sh` grep).
5. Test: claude.ai → Add custom connector → paste `https://mcp.bcn-services.com/mcp` → sign in as the SB smoke user → tools list → read `client_v1`. Then repeat in ChatGPT developer mode.
6. Rollback: turning the OAuth server off leaves the Bearer-header path working.

### 4.4 Dependencies

None new. `@modelcontextprotocol/sdk` 1.30.0 (pinned) and `@supabase/supabase-js` are already in `apps/mcp`; the consent page uses `supabase.auth.oauth.*` from supabase-js; `apps/connect` and `packages/tenant` declare `^2.116.0` (verified in package.json). Whether the resolved version exposes `auth.oauth` — **unverified** (no node_modules in this worktree; check after install). If it does not, bumping supabase-js needs approval and passes through `minimumReleaseAge` pins ([[reference-bcns-ci-setup]]).

### 4.5 Estimate, model, effort

| Piece | Est. | Model / effort |
|---|---|---|
| Spike (§4.1) | 0.5 day | Opus, high — it decides go/no-go and may find the claim rename |
| PRM route + 401 header + tests | 0.5 day | Sonnet, medium |
| Consent page + login `next` | 1 day | Sonnet, high (open-redirect and per-action session check) |
| Claim rename, only if needed | 1–2 days | Opus, high — touches RLS |
| Hosted steps + connector tests | 0.5 day | Nate, wizard |
| **Total, Supabase path** | **~2.5 days (4 with rename)** | |
| Facade fallback (§3.5-2) | 3–4 days | Opus, high; `dt-review` mandatory |

Run through `/dev-team` with the same guardrail as chunk 6: nothing here may add a service-role key.

---

## Unverified, consolidated

- Whether #2820 has a fix or workaround on our project; whether #2408 affects hosted.
- Whether Supabase supports CIMD; the actual advertised metadata (OAuth server is disabled on our project).
- Which `client_id` wins in the token (hook vs OAuth); `authentication_method` in the hook event.
- `getUser(token)` on an OAuth-issued token; OAuth access-token lifetime vs `jwt_expiry`; refresh-token lifetime and `invalid_grant` behavior.
- PostgREST behavior with a non-`authenticated` `aud`.
- Hosted Site URL today and what else depends on it; nginx `mcp` vhost `/.well-known` routing.
- ChatGPT: PRM/401 specifics and spec revision; whether it actually sends `resource` + `offline_access`.
- Whether the resolved supabase-js (`^2.116.0`) exposes `auth.oauth`.
