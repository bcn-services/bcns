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
| POST | `/token` | none | `authorization_code` (PKCE S256) and `refresh_token` grants; refresh answers `503 temporarily_unavailable` (+ `Retry-After`, 60 s or 1 s) on a cap or an upstream problem, `400 invalid_grant` only when the token is dead (GoTrue 400/403) |
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

## Tools

Two read-only tools over the allowlisted views (`src/policy.ts`); no write tool is exposed.

- `read_view` returns rows. `order_by` sorts by any allowed column (a hidden column is refused),
  `filters` take an `op` of `eq` (default), `neq`, `gt`, `gte`, `lt`, `lte` or `contains` (a
  case-insensitive substring, strings only), and `offset` (0-10000, needs an order) pages. The
  view's unique key is always appended to the sort, so pages never repeat or skip rows.
- `summarize_view` answers totals without the model adding rows up: `metric` count, sum, avg, min
  or max (with a `column` except for count), `group_by` up to 3 columns, `period` day, month or
  year (UTC, on the view's date column), the same `filters` and `date_from`/`date_to`, `order`
  `value_desc` (default), `value_asc` or `key`, and `limit` 1-200 (default 50). Summing a `*_minor`
  column splits by `currency` automatically, so currencies are never added together. Null values
  are skipped; a non-numeric value in a sum/avg/min/max column is an input error.
- Every column a call names (sort, filter, group, metric, period) goes through the same allowlist,
  and `customers_v1.email` still needs the owner switch, for both tools.
- `summarize_view` reads rows in pages of 1000 and aggregates in the server, up to 10,000 rows. Past
  that the result carries `partial: true` and a note, with `scanned_rows` saying how many were
  read. Ceiling: this is app-side, so a bigger answer needs a SQL aggregate view or RPC (a
  migration) instead.

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
  upstream protect the hub's headroom: 3 sign-ins/min and 15 refreshes/min. All counters are
  in-memory, one process, and keyed by client IP (IPv6 by /64).
  - Sign-in: 10 POSTs/min per IP, and 2 upstream sign-ins/min per IP, checked before the global 3,
    so a junk flood needs two IPs to lock everyone out. Over a cap the form re-renders with 429.
    Several people behind one office IP share the 2/min.
  - Refresh: an IP is "known" for 1 h (table of 1000, oldest evicted) after a successful code
    exchange or refresh, or a valid `/mcp` bearer (so a restart re-learns them without extra
    GoTrue calls). Anthropic's and OpenAI's egress IPs are known, so they get 10 attempts/min per
    IP, counted before the call, and the global 15/min. An unknown IP is charged per attempt (3/min, junk or not) before
    any upstream call, and all unknown IPs share 5/min, so a flood can take at most 5 of the 15
    slots and leaves 10/min for known IPs. Past roughly 150 connected users the refresh cap will
    bite: raise it with the hosted GoTrue limits.
  - Every GoTrue call is one attempt with an 8 s timeout (Claude's is 10 s). The MCP SDK discards
    stored tokens on `invalid_grant`, so refresh answers `400 invalid_grant` only for a GoTrue 400
    or 403 (or a session with no tenant). A timeout, network error, 401, 404, 429 or 5xx, and any
    cap, is `503 temporarily_unavailable` with `Retry-After: 60`, except an unreachable GoTrue,
    which is `Retry-After: 1`: the 8 s timeout plus a 1 s retry stays inside GoTrue's 10 s
    refresh-token reuse window if the client honours Retry-After.
  - Every non-2xx or unreachable GoTrue answer logs one line to stderr,
    `{"level":"error","event":"gotrue_refresh_failed"|"gotrue_signin_failed","status":N}`
    (0 = unreachable). Status only, never a body or token. A 401 or 404 there means a rotated
    key or a wrong `SUPABASE_URL`.
- Accepted: an attacker rotating IPs (2+ per minute, /64s count separately) can keep the 3/min
  global sign-in cap full and block NEW connector sign-ins while it lasts. Existing connections
  keep refreshing and hub sign-in is unaffected. Upgrade: a free form challenge (e.g. Cloudflare
  Turnstile) checked before the sign-in caps, or raise hosted GoTrue limits and the caps.
- Known-IP set and all caps are in-memory per process; a restart forgets them until IPs refresh
  or call /mcp again.
- Connectors sign in through the built-in OAuth 2.1 server (`src/oauth.ts`); its design, ceilings
  and deviations are in `docs/architecture/chunk6c-mcp-launch.md`. A raw Bearer JWT still works.
- Tool names and descriptions come from `agentTools()`. Improving how a model picks a tool is an
  edit in `packages/data-client`, not here.
