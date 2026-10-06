# apps/mcp — the bcns MCP server

A remote, multi-tenant **Streamable HTTP** MCP server. It exposes
`packages/data-client`'s `agentTools()` over MCP and runs each call through `runTool()`.
Deployed as `bcns-app@mcp` on port 3103, behind `mcp.bcn-services.com`.

Chunk 6 of `docs/architecture/platform-v1.md`; the window is
`docs/architecture/chunk6-mcp-window.md`.

## Authorization

There is exactly one credential in play: **the caller's own Supabase JWT**. It is parsed from
`Authorization: Bearer <jwt>`, verified with the anon key, and then handed to
`createDataClient({ accessToken })` so Postgres sees the caller and RLS does the scoping.

This process holds no privileged key, and must not be given one. Over-reading another tenant is
not a filter this server could forget — there is no credential here that could read it.

## Endpoints

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | none | `200 {"ok":true}` — what `deploy-app.yml` curls |
| POST | `/mcp` | Bearer | MCP JSON-RPC, stateless (no `Mcp-Session-Id`) |
| GET | `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server` | none | OAuth discovery (`src/oauth.ts`) |
| POST | `/register` | none | stateless DCR; redirect URIs must be on the allowlist |
| GET, POST | `/authorize` | none | sign-in form; POST issues a 60 s single-use code |
| POST | `/token` | none | `authorization_code` (PKCE S256) and `refresh_token` grants; refresh answers `503 temporarily_unavailable` (+ `Retry-After: 60`) on a cap or an upstream blip, `400 invalid_grant` only when the token is dead |
| * | anything else | — | `404 {"error":"not_found"}` |

`/mcp` answers `401` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.bcn-services.com/.well-known/oauth-protected-resource/mcp"`
for a missing or malformed header and for a token that does not verify, `403` for an `Origin`
other than `https://mcp.bcn-services.com`, `https://claude.ai` or `https://chatgpt.com` (absent
is fine — a CLI sends none; a rejected one is logged to stderr), `403 {"error":"no_membership"}`
for a token with no client claim (a pending self-service sign-up), and `429` over the rate
limit.

## What `/srv/mcp/env` needs

Nothing but these five lines. Anon key only, no secrets:

```
PORT=3103
HOSTNAME=127.0.0.1
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<the project anon key>
MCP_RATE_LIMIT_PER_MIN=60
```

`MCP_RATE_LIMIT_PER_MIN` is optional and defaults to 60.

## Deployed layout

`infra/bcns-app@.service` runs `node server.js` with `WorkingDirectory=/srv/mcp/current`, so the
release root carries a committed one-line `server.js` that imports `./dist/server.js`. The
release root is the app directory itself — `server.js`, `package.json`, `dist/` and a
production `node_modules/` produced by `pnpm deploy`.

## Local

```
corepack pnpm --filter @bcn-services/mcp build
corepack pnpm --filter @bcn-services/mcp test
SUPABASE_URL=… SUPABASE_ANON_KEY=… PORT=3103 node apps/mcp/server.js
```

## Connecting an agent

```
claude mcp add --transport http bcns https://mcp.bcn-services.com/mcp \
  --header "Authorization: Bearer <jwt>"
```

`mint-agent-login` returns an email and a password, not a token. Trade them for a JWT first —
see the sign-in snippet in the chunk 6 PR body and in `packages/data-client`'s `signIn()`.

## Ceilings

- The rate limit is an in-memory fixed window in one process. A second process doubles the
  effective limit; a restart forgets every counter.
- Sign-in and refresh call GoTrue from the droplet IP, so they share its per-IP buckets with the
  hub (`sign_in_sign_ups` 30/5 min, `token_refresh` 150/5 min). Process-wide caps on calls going
  upstream protect the hub's headroom: 3 sign-ins/min (form re-renders with 429) and 15
  refreshes/min (`503` + `Retry-After: 60`). Per client IP (IPv6 by /64): 10 sign-in attempts/min,
  and 10 FAILED refreshes/min, so the shared egress IPs of Anthropic and OpenAI are not throttled
  for successful ones. Each GoTrue call is one attempt with an 8 s timeout (Claude's is 10 s); a
  timeout, network error, 429 or 5xx is `503 temporarily_unavailable`, never `invalid_grant`,
  because the MCP SDK discards stored tokens on `invalid_grant`. All counters are in-memory, one
  process. Past roughly 150 connected users the refresh cap will bite: raise it with the hosted
  GoTrue limits.
- Connectors sign in through the built-in OAuth 2.1 server (`src/oauth.ts`); its design, ceilings
  and deviations are in `docs/architecture/chunk6c-mcp-launch.md`. A raw Bearer JWT still works.
- Tool names and descriptions come from `agentTools()`. Improving how a model picks a tool is an
  edit in `packages/data-client`, not here.
