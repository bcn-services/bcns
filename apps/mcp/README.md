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
| * | anything else | — | `404 {"error":"not_found"}` |

`/mcp` answers `401` with `WWW-Authenticate: Bearer realm="bcns"` for a missing or malformed
header and for a token that does not verify, `403` for an `Origin` other than
`https://mcp.bcn-services.com` (absent is fine — a CLI sends none), and `429` over the rate
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
- Bearer-only, not OAuth 2.1: no one-click connector UX. `platform-v1.md` "Deferred, with
  triggers" records what reopens it.
- Tool names and descriptions come from `agentTools()`. Improving how a model picks a tool is an
  edit in `packages/data-client`, not here.
