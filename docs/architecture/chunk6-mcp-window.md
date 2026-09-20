# Chunk 6 — the MCP server `apps/mcp`

**Why this window exists.** Chunk 6 is the "agent/software access" half of the v1 decision
table: the hub mints an agent login, and this server is the plug that agent products actually
accept. It outgrew a slot in `chunk5-windows.md` for the same reason W3.5 did — it carries
pre-decided architecture, one hard security limit, and a run of hosted steps that happen after
the PR merges rather than inside it.

**Model: Opus, high effort. Unattended.** Not because the code is hard — it is an adapter over
an API that already exists. Because one shortcut, reaching for the service-role key instead of
passing the caller's Bearer token through, produces a server that works perfectly in every test
and hands every client's data to any agent. A cheaper model takes that shortcut precisely
because it is the path of least resistance. The hard limit in the prompt, the grep mutation
check, and the `dt-review` spawn are all aimed at that one failure.

**Scope settled 2026-09-20.** `@modelcontextprotocol/sdk` approved the same day.

---

## Settled: what is standard for a server like this

This is a **remote, multi-tenant HTTP** MCP server. It shares almost nothing operationally with
the local stdio demo shape, so web-service norms apply, not MCP-demo norms.

| Decision | The norm | Ours | Verdict |
| --- | --- | --- | --- |
| Transport | Streamable HTTP — one endpoint, JSON-RPC in, JSON or SSE out | same | on the norm |
| Session mode | stateless for hosted servers; stateful only to push notifications | stateless | on the norm |
| Auth | OAuth 2.1 resource server + protected-resource metadata + dynamic client registration | static Bearer | deliberate deviation |
| Authorization | server holds one privileged credential, filters in app code | caller's token → Postgres RLS | above the norm |
| Tool surface | small, `verb_noun`, descriptions written for the model | `agentTools()` projection | on the norm |
| Primitives | tools only; resources and prompts are the classic over-build | tools only | on the norm |
| Origin check | spec asks HTTP transports to validate `Origin` (DNS rebinding) | included | on the norm |
| Runtime | small Node/TS process; the SDK transport is written against Node `req`/`res` | plain Node | on the norm |

**Bearer instead of OAuth 2.1 is the normal v1, not a corner cut.** OAuth 2.1 with dynamic
client registration is what a one-click web connector needs, and it is weeks of work.
`claude mcp add --transport http <url> --header "Authorization: Bearer …"` takes a fixed header,
and that CLI path *is* chunk 6's written done-criterion. §Deferred already names the trigger that
reopens it: an agent product that cannot pass a bearer token.

**RLS is stronger than the usual pattern, and the guardrail is what keeps it true.** The common
multi-tenant leak is a server holding a god credential and missing one tenant filter. Passing the
caller's own token down to Postgres makes over-reading impossible *in the server*.
`packages/data-client` has zero service-role references today. The point of the hard limit below
is that this stays a property rather than an intention.

**Why plain Node rather than a Next app.** The SDK's `StreamableHTTPServerTransport` is written
against Node `req`/`res`. Hosting MCP inside Next is a Vercel-shaped pattern that needs their
adapter — a second dependency, unapproved. And `infra/bcns-app@.service` already runs
`node server.js`. Standard shape, SDK-native shape and existing infra all point one way.

## Settled: the repo facts this window rests on

Verified 2026-09-20 by reading the files. The prompt hands these over so the session does not
re-derive them, and does not guess wrong.

- `scripts/new-app.sh:24` lists `_template|web|sb|connect|mcp` as reserved and exits 1.
  **`apps/mcp` is hand-built. The stamper cannot make it.**
- `infra/ports.txt` already carries `mcp 3103`. Nothing to add.
- `infra/bcns-app@.service`: `WorkingDirectory=/srv/%i/current`, `EnvironmentFile=/srv/%i/env`,
  `ExecStart=/usr/bin/node server.js`, `MemoryMax=512M`. So the deployed tree must resolve
  `/srv/mcp/current/server.js`, and the process reads `PORT` and `HOSTNAME` from the env file.
- `.github/workflows/deploy-app.yml` already path-triggers on `apps/mcp/**` (line 15), but its
  matrix defaults to `fromJSON('["sb","connect"]')` (line 37), its build step is
  Next-standalone-specific (line 66), and its health check curls `/api/health` (line 94).
- `packages/data-client/src/index.ts`: `createDataClient` line 204, `agentTools` line 462,
  `runTool` line 551, `DataClientError` line 40, `ToolInputError` line 307. `agentTools()`
  returns `{name, description, input_schema}` where `input_schema` is **plain JSON Schema, not
  Zod** — it maps one-to-one onto an MCP tool schema, which is why this adapter is small.
- `platform/supabase/functions/_shared/guard.ts:44` has `bearer(request)`; `deps.ts:68` verifies
  a token with `createClient(URL, ANON, NO_SESSION).auth.getUser(accessToken)`. Copy that.
  **Do not copy `requireOwner`** — `mint-agent-login` creates a `member` membership, so an
  owner-only check locks out the very user this server exists for.

## Settled: the `/access` gap

`mint-agent-login` returns an agent email and a password with **no token and no TTL**. The Bearer
JWT that `claude mcp add` needs comes from a later `signIn()`. So §6's done-criterion — "`/access`
shows the config" — cannot be met as written, because `/access` has no token to show. The hub
change is not in this window. This window writes the sign-in snippet into its PR body, and the
deploy wizard prints it as its last stage.

---

## The prompt

```
GUARDRAILS
Nothing merges, pushes to prod or db-pushes except through a wizard confirm I answer. I merge
with `! GITHUB_TOKEN= gh pr merge`. Never read .env.local or .env.production. Use
`GITHUB_TOKEN= gh` for gh writes and `corepack pnpm`. No new dependency without asking. No
service-role key outside the worker, Edge Functions and Nate's machine. Each subagent spawn
names its model and gets exact scope, done criteria and hard limits. Work on a branch with one
PR per chunk item. Every "unchanged" claim cites a baseline file from chunk 0. `pnpm build` and
`pnpm dev` share apps/web/.next — kill dev before building, then restart it.

Unattended run: proceed without asking. Every hosted, DNS, deploy or publish step is written
into the PR body as a morning wizard step, not run. Stop only for a missing access or a
contradiction between two docs.

CONTEXT

Chunk 6 of docs/architecture/platform-v1.md. Build apps/mcp: a remote Streamable-HTTP MCP
server for mcp.bcn-services.com on port 3103. It exposes packages/data-client's agentTools()
and runTool() over MCP. The caller's Supabase Bearer JWT is forwarded to the data client, and
Postgres RLS is the only authorization. @modelcontextprotocol/sdk was approved 2026-09-20 —
pin it exact, no caret.

These facts were verified on 2026-09-20 by reading the files. Do not re-derive them:
- scripts/new-app.sh:24 REJECTS the slug "mcp" (reserved, exits 1). Hand-build apps/mcp.
  Do not run the stamper.
- infra/ports.txt already contains "mcp 3103". Do not edit it.
- infra/bcns-app@.service is WorkingDirectory=/srv/%i/current, EnvironmentFile=/srv/%i/env,
  ExecStart=/usr/bin/node server.js, MemoryMax=512M. The deployed tree must therefore resolve
  /srv/mcp/current/server.js, and the process reads PORT and HOSTNAME from the env file.
- .github/workflows/deploy-app.yml already path-triggers on apps/mcp/** (line 15), but its
  matrix defaults to fromJSON('["sb","connect"]') (line 37), its build step is
  Next-standalone-specific (line 66), and its health check curls /api/health (line 94).
- packages/data-client/src/index.ts: createDataClient({supabaseUrl, anonKey, accessToken}) at
  line 204; agentTools(opts?) at line 462, returning {name, description, input_schema} where
  input_schema is plain JSON Schema, NOT Zod; runTool(client, name, input, opts?) at line 551.
  DataClientError at line 40, ToolInputError at line 307 — both plain Error subclasses.
- platform/supabase/functions/_shared/guard.ts:44 has bearer(request); deps.ts:68 verifies a
  token with createClient(URL, ANON, NO_SESSION).auth.getUser(accessToken). Copy that pattern.
  Do NOT copy requireOwner — mint-agent-login creates a "member" membership, so an owner-only
  check locks out the very user this server exists for.

SCOPE — eight edits, one PR on branch chunk6-mcp-server

a. apps/mcp/package.json — name @bcn-services/mcp, private. Dependencies: the MCP SDK (exact
   version, no caret), @bcn-services/data-client (workspace:*), @supabase/supabase-js. Scripts:
   build, start, test, typecheck, lint. tsconfig extends @bcn-services/config.

b. apps/mcp/src/server.ts — a node:http server reading PORT and HOSTNAME from env.
   GET /api/health returns 200 {"ok":true} — deploy-app.yml's health check hits exactly this
   path. POST /mcp is the MCP endpoint. Everything else 404s.
   TRAP: the systemd unit runs `node server.js` with WorkingDirectory=/srv/mcp/current.
   Emitting to dist/ alone does NOT satisfy that. Either have the deploy step ship dist/ AS
   the deployed root, or commit a one-line top-level server.js that requires ./dist/server.js.
   Pick one, and say which you picked and why in the PR body.

c. apps/mcp/src/mcp.ts — the adapter. One server instance per request, stateless:
   - StreamableHTTPServerTransport with sessionIdGenerator undefined. No Mcp-Session-Id, every
     POST self-contained, safe behind any number of processes.
   - Register every agentTools() entry by passing name, description and input_schema straight
     through. The handler calls runTool(client, name, input).
   - ToolInputError and DataClientError become MCP tool errors (isError true) carrying their
     message. Anything else becomes a generic message with no stack and no internals.

d. apps/mcp/src/auth.ts — Bearer only.
   - Parse Authorization with the same regex as guard.ts:44, case-insensitive header lookup.
   - Missing or malformed: 401 with WWW-Authenticate: Bearer realm="bcns".
   - Verify with createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth:{persistSession:false}})
     .auth.getUser(token). Failure: 401. Pass that same token to createDataClient as
     accessToken, so Postgres sees the caller and RLS does the scoping.
   - Validate the Origin header when one is present: absent is fine, anything other than
     https://mcp.bcn-services.com is rejected. This is the DNS-rebinding guard the MCP spec
     asks of HTTP transports.
   - HARD LIMIT: the service-role key must never appear anywhere in apps/mcp — not in code,
     not in .env.example, not in the env list you write into the PR body. packages/data-client
     has zero service-role references today, and that is the property this whole server rests
     on. If you believe you need it, STOP and write why in the PR body instead of adding it.

e. apps/mcp/src/limit.ts — per-token rate limit. In-memory Map keyed by a SHA-256 of the token,
   fixed window, default 60 requests/minute, overridable by env. Leave a `ponytail:` comment
   naming the ceiling: single process only, move to Postgres or Redis when there is more than
   one.

f. .github/workflows/deploy-app.yml — add "mcp" to the matrix and branch the build and ship
   steps on the slug, so the Next-standalone path for sb and connect stays byte-identical.

g. apps/mcp/.env.example plus a README section listing exactly what /srv/mcp/env needs: PORT,
   HOSTNAME, SUPABASE_URL, SUPABASE_ANON_KEY, MCP_RATE_LIMIT_PER_MIN. Anon key only. No secrets.

h. apps/mcp/tests/ — node:test, pure unit tests, no network:
   - bearer parsing: present, missing, malformed, lowercase header name
   - tool mapping: every agentTools() entry survives with a name, a description and a
     JSON-Schema object
   - error mapping: ToolInputError and DataClientError both produce isError results, and
     neither leaks a stack
   - rate limiter: the call past the limit is rejected, and the window rolls over
   - a source-scan assertion that no file under apps/mcp mentions SERVICE_ROLE

OUT OF SCOPE — do not touch
- packages/data-client. The adapter reads it. It never edits it.
- apps/web, apps/connect, apps/sb, packages/ui, packages/tenant, packages/app-core.
- platform/ — worker, Edge Functions, supabase/.
- Anything under docs/ except the PR body.
- No OAuth 2.1, no protected-resource metadata, no dynamic client registration. Bearer only in
  v1; platform-v1.md "Deferred, with triggers" records what reopens this.
- No MCP resources and no prompts primitives. Tools only.
- No session state. No Mcp-Session-Id.
- Do not run supabase db push. Do not deploy. Do not touch DNS. Do not run certbot.
- Do not merge.

DONE WHEN
- corepack pnpm lint && corepack pnpm typecheck && corepack pnpm build pass from the repo root.
  Kill any dev server first — a concurrent pnpm dev and pnpm build corrupt each other's .next.
- corepack pnpm --filter @bcn-services/mcp test passes.
- The built entry starts on 3103, curl localhost:3103/api/health returns 200, and a POST to
  /mcp with no Authorization header returns 401.
- One PR on chunk6-mcp-server, not merged.

MUTATION CHECKS — state the observed value for each, never the word "unchanged"
- git diff --stat main lists only apps/mcp/ paths plus .github/workflows/deploy-app.yml.
  Paste it.
- grep -ri "service_role\|SERVICE_ROLE" apps/mcp/ returns nothing. Paste the command and its
  empty output.
- git diff --stat main -- packages/data-client is empty. Paste it.
- git diff main -- infra/ports.txt is empty. Paste it.
- Deliberately break the Bearer check to return a fixed user. Confirm the auth test FAILS.
  Revert. Say you did this, and quote what the failure said.

Then spawn one dt-review subagent, model Opus, scoped to the diff only, with this brief:
"Find the one failure that matters — any path where a caller could read data under a credential
that is not their own token. Then check every error path for leaked internals." Name the model
in the spawn. Apply confirmed findings before opening the PR.

REPORT BACK — in the PR body
- Every mutation-check output, verbatim.
- Which server.js layout you chose, and why.
- The exact contents /srv/mcp/env needs.
- A numbered morning wizard step list for the hosted work you did NOT run: the DNS A record
  for mcp.bcn-services.com, certbot, the nginx site, systemctl enable --now bcns-app@mcp, and
  the claude mcp add line to smoke-test it.
- One paragraph on the /access gap: mint-agent-login returns an email and password with no
  token, so record the sign-in snippet that turns those credentials into the Bearer header.
```

## How I run it

1. Merge the docs PR first. This file is the window; the session is launched from it.
2. Kill any running `pnpm dev` — the build step in DONE WHEN will corrupt it otherwise.
3. New session in `~/bcns`, model Opus, high effort, unattended. Paste the prompt fence above
   whole, starting at `GUARDRAILS`.
4. It runs roughly one to two hours and ends at a PR on `chunk6-mcp-server`.
5. Morning: read the mutation checks in the PR body **before** the code. If the
   `service_role` grep is not empty, or `packages/data-client` is not byte-identical to main,
   the PR is wrong regardless of whether the server works.
6. Merge with `! GITHUB_TOKEN= gh pr merge`.
7. Then run the deploy wizard window (W-C) against the morning-step list in that PR body.
8. The real gate is after deploy, not in the PR: `claude mcp add --transport http bcns
   https://mcp.bcn-services.com/mcp --header "Authorization: Bearer <token>"` as the SB smoke
   user lists the tools and reads SB's views. That is chunk 6's written done-criterion.

**Known ceilings.** The rate limiter is per process and in memory — a second process doubles
the effective limit, and a restart forgets everything. Bearer-only auth means no one-click
connector UX; that is the deferral, with its trigger already written. And the tool descriptions
the model reads come from `agentTools()`, so improving how an agent picks tools is an edit in
`packages/data-client`, not here.
