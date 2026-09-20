# Chunk 5 — work windows

Seven windows to get the Shopify, Meta and Monday OAuth flows built and the three
apps submitted for review. Source of truth is `docs/architecture/platform-v1.md` §5;
this file is only the running order.

Three of the windows are yours and cannot be delegated — they carry your identity
or your login. Four are Claude sessions. Nothing here costs money: Shopify Partner,
Meta app creation, Meta business verification and Monday's OAuth app are all free.
The cost is calendar.

**Order matters in one place only.** W1 starts Meta business verification, which
takes one to three weeks and blocks nothing else. Start it before anything, then
let the rest run.

**Guardrails — paste into every Claude window below.**

> Nothing merges, pushes to prod or db-pushes except through a wizard confirm I answer. I merge
> with `! GITHUB_TOKEN= gh pr merge`. Never read `.env.local` or `.env.production`. Use
> `GITHUB_TOKEN= gh` for gh writes and `corepack pnpm`. No new dependency without asking. No
> service-role key outside the worker, Edge Functions and Nate's machine. Each subagent spawn
> names its model and gets exact scope, done criteria and hard limits. Work on a branch with one
> PR per chunk item. Every "unchanged" claim cites a baseline file from chunk 0.
>
> `pnpm build` and `pnpm dev` share `apps/web/.next`. Kill dev before building, then restart it.

---

## W0 — Scope list and click-path · Claude · Sonnet · ~15 min · read-only

**What this is.** Before you open any dashboard, you need two things: the exact
list of permissions to request from each platform, and a click-by-click path
through each dashboard. Every permission you request is one you have to justify
in review, so asking for fewer gets approved faster. This window derives the
minimum set from what the connectors actually call, and writes you the click-path
so W1 is following steps rather than exploring an unfamiliar UI.

**Model: Sonnet.** Reading connector code and mapping API calls to scope names is
lookup work with a verifiable answer — no design judgment, so Opus buys nothing.

**Prompt:**

```
Read docs/architecture/platform-v1.md §5, then platform/worker/src/connectors/
shopify.ts, meta.ts and monday.ts, plus platform/worker/src/tokens.ts.

For each of Shopify, Meta and Monday, list every API endpoint or GraphQL field the
connector actually calls, and map that to the MINIMUM OAuth scope set that covers
it. Flag any scope we currently hold (the Shopify app has 7) that nothing in the
code reads — those should be dropped before submission, since unjustified scopes
slow review.

Then write docs/architecture/chunk5-dashboard-steps.md: a click-by-click path for
a person who has never used these dashboards, covering (a) Shopify Partner app to
unlisted distribution, (b) Meta app with Facebook Login for Business, (c) Monday
OAuth app. For each: where the client id and client secret appear, where to
register the redirect URL, and where to set scopes. Redirect URLs are
https://connect.bcn-services.com/api/oauth/<source>/callback.

Read-only on code — no source changes, no branch, no PR. Output the scope table in
chat as well as the file.

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
```

**You get:** a scope table to approve, and `chunk5-dashboard-steps.md`.

---

## W0b — The `drive.file` question · Claude · Sonnet · ~20 min · optional, research only

**What this is.** Google is the one source that can't be made one-click without an
expensive verification. There may be a way around it: the `drive.file` scope is not
restricted and needs no security assessment, and the Google Picker lets a user hand
an app specific files or folders. If `drive.file` covers files added to a picked
folder *later*, the whole verification problem disappears for a growing content
library. If it doesn't, it's useless to us. Worth twenty minutes before you ever
consider paying for the restricted-scope path.

**Model: Sonnet.** Documentation research with a factual answer.

**Prompt:**

```
Research question, no code changes. Use web search for both answers and cite live
pages — Google changed both the Picker rules and CASA pricing recently, so an answer
from training data is worse than no answer. If you cannot reach the docs, say so
rather than recalling.

We index a client's Google Drive content-library folder — read-only, files added
over time. Today that runs on an Internal OAuth app inside the client's own
Workspace with drive.readonly, which means one app per client and no path at all
for clients without Workspace.

Check current Google documentation and answer: if a user selects a FOLDER through
the Google Picker under the drive.file scope, does the app retain access to files
added to that folder afterwards, or only to files present at pick time? Cite the
doc pages you used.

Second question, independent of the first: Google requires an annual third-party
security assessment (CASA) before an External app may use a restricted scope like
drive.readonly. Find the CURRENT tiers and what each actually costs in 2026, and cite
the source. Do not estimate — if the price is not published, say that instead.

If drive.file access does extend to later files, sketch what would change in
platform/worker/src/connectors/drive.ts and what a client's connect flow would look
like. If it does not, say so plainly and stop — the answer is what matters, not a
workaround.

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
```

**You get:** a yes/no with citations, plus the real CASA price. A yes on `drive.file`
reopens Drive self-service; a no tells you what the alternative actually costs.

---

## W1 — Dashboards · You · ~45 min · no Claude

**What you're doing.** Creating the three app shells and starting the slow clock.
You are not building anything — you're filling in forms that produce a client id
and a client secret per platform, which is what the code in W2 needs to point at.

Order inside the window:

1. **Meta business verification first.** It's an identity check on bcns as a
   business — documents, not code — and it runs one to three weeks in the
   background. Nothing else waits on it, so it should be ticking while you do the
   rest.
2. **Shopify Partner app** → unlisted distribution, scopes from W0, redirect URL
   registered.
3. **Meta app** with Facebook Login for Business, `ads_read`, data-deletion callback
   URL.
4. **Monday OAuth app.**

Follow `chunk5-dashboard-steps.md` from W0.

**What comes out, and where it goes:**

- **Client ids** — these are public. Paste them into the W2 session.
- **Client secrets** — these are not. Put them straight into GitHub secrets and the
  hub's environment yourself. Never paste a secret into a Claude session.

**One thing to check while you're in the Partner dashboard:** our app has no
in-admin surface — the UI lives on `connect.bcn-services.com`. Confirm unlisted
distribution is acceptable without an embedded app before W2 builds to that shape.
If Shopify requires embedding, stop and tell me; that changes the design.

---

## W2 — Shopify OAuth flow · Claude · Opus · unattended, long · needs W1

**What this is.** The real build. One route to start the handshake, one to receive
it, the three privacy webhooks Shopify requires, and the plumbing that turns a
successful handshake into the same database rows the CLI onboarding writes today.
Shopify goes first and alone: it's the one with a real customer behind it, and the
route shape it establishes gets cloned twice in W4.

**Model: Opus.** Two reasons. The failure mode is silent — a state or HMAC check
that's wrong still returns 200 and still looks like it works, and that is the
security boundary. And this window sets the abstraction the other two flows inherit,
so getting it right once pays three times.

**Prompt:**

```
Work in ~/bcns. Read docs/architecture/platform-v1.md §5 — that plus Shopify only is
the scope. Do NOT build the Meta or Monday flows; they are W4.

Branch chunk-5-shopify-oauth, one PR, never merge.

Build in apps/connect:
- /api/oauth/shopify/start — signed, short-TTL state; redirect to Shopify's consent
  screen with the approved scopes.
- /api/oauth/shopify/callback — verify state AND Shopify's HMAC before anything
  else, exchange the code for a token, then write the SAME data.source_tokens and
  data.connector_schedule rows that platform/scripts/add-source.ts writes. Read
  add-source.ts first and reuse its upsert path rather than writing a second one.
- The three mandatory GDPR webhooks with HMAC verification.
- The hub button: apps/connect/lib/request-connection.ts currently emails bcns on
  "Request connection". Keep that as the fallback for unapproved sources, and gate
  the link to /start behind a per-source flag so nothing changes for a source whose
  app is not approved yet.

Branch from origin/main, NOT local main — local main is stale. Use:
  git fetch origin && git checkout -b chunk-5-shopify-oauth origin/main
Untracked files in the working tree (REDESIGN_PROMPT.md, design-directions/, the
chunk5-*.md docs) are not yours — do not add or commit them.

Client id: a87d4fe4a4c2b0a57d370e24f28a12bf. Read credentials from these exact env
var names, already captured: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET. The secret is
in the environment — do not ask for it, do not print it, do not read any .env file.

Nothing downstream changes: the worker, the connectors and the refreshToken hook in
platform/worker/src/tokens.ts stay untouched. If you think one needs editing, stop
and say why.

Tests: unit coverage on state generation and verification, HMAC verify (including a
tampered payload that must be rejected), and the token-exchange response handler.
Paste the verification output in the PR body. Every hosted, deploy or dashboard step
goes in the PR body as a morning wizard step, not run.

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
```

**You get:** a PR you don't merge yet — W3 tests it against a real store first.

---

## W3 — Dev-store install · You + Claude · supervised · ~30 min · needs W2

**What you're doing.** Proving the handshake works against a real Shopify store
before anything is submitted. Claude can't do this alone — it requires your Partner
login and a browser. You click Install on a development store; Claude watches the
logs and fixes what breaks.

This window exists because OAuth bugs don't show up in unit tests. Redirect URL
mismatches, wrong scope strings and state failures all pass mocked tests and fail on
the first real install.

**Model: Opus**, same session shape as W2 — it's debugging the same security-
sensitive code, and you're in the loop watching.

**Prompt:**

```
Supervised window. The chunk-5-shopify-oauth branch is built but has never completed
a real handshake. I have a Shopify Partners development store and will click through
the install myself.

Narrate each step and wait for me before anything that mutates. Start the hub
locally, tell me exactly what URL to open, and read the logs as I go. When the
install fails — it will — tell me what the actual error was before proposing a fix,
and show me the value you read rather than the value you expected.

Done when a real dev-store install writes a data.source_tokens row and a
data.connector_schedule row for shopify, and the worker's auth probe passes against
that token.

One extra check while we have a real store: settle whether read_inventory is needed.
Install once with it and once without, run Q_INVENTORY both times, and compare
ProductVariant.inventoryQuantity. Note that shopify.ts reads `inventoryQuantity ?? 0`,
so a missing scope shows up as a silent zero rather than an error — read the raw
response, not the derived metric. If the scope proves unnecessary, dropping it also
means editing SHOPIFY_SCOPES in platform/scripts/checklist.ts:12.

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
```

**You get:** a proven flow, and a PR worth merging.

---

## W4 — Meta and Monday flows · Claude · Sonnet · unattended · needs W2 merged

**What this is.** The same two routes, twice more, against a shape that's already
proven. Meta adds one step Shopify doesn't have — exchanging the short-lived token
for a long-lived one — and its own data-deletion callback. Monday is the lightest of
the three.

**Model: Sonnet.** The hard thinking happened in W2; this is cloning a verified
pattern, which Sonnet does reliably and Opus does at four times the cost. Escalate to
Opus only if W5's review found something structural in the Shopify routes.

**Prompt:**

```
Work in ~/bcns. The Shopify OAuth flow is merged and proven against a real dev store.
Read apps/connect/app/api/oauth/shopify/* first — it is the pattern to follow.

Branch chunk-5-meta-monday-oauth, one PR, never merge.

Build the same start/callback pair for meta and monday. Differences from Shopify:
- Meta: exchange the short-lived token for a long-lived one before writing the row;
  add the data-deletion callback URL Meta requires.
- Monday: no HMAC step; otherwise identical.
Both end in the same data.source_tokens + data.connector_schedule upserts.

If the Shopify routes have anything worth extracting into a shared helper, extract it
— but only what both new flows actually use. No abstraction for a third caller that
does not exist.

Client ids: meta [paste], monday [paste]. Secrets are in the environment.

Same test bar as Shopify: state, token exchange, and for Meta the long-lived
exchange. Paste verification output in the PR body.

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
```

---

## W5 — Security review · Claude · Opus · read-only · needs W2 and W4

**What this is.** An independent pass over all three route pairs before they go live.
These routes are the point where an outsider's request turns into a stored
credential, so a missed check is a real vulnerability rather than a bug. Same reason
we review infra config before a first deploy: the failure only shows up in
production.

**Model: Opus, read-only, adversarial.** Review is where reasoning depth actually
pays, and an agent that can edit will fix what it finds instead of reporting it,
which defeats the purpose.

**Prompt:**

```
Adversarial security review. No edits, no branch — report only.

Review every file under apps/connect/app/api/oauth/ and the webhook handlers.
Assume an attacker who can send arbitrary requests to these endpoints.

Check specifically: state generation, storage and verification (can it be replayed,
omitted, or forged?); HMAC verification on Shopify's callback and all three GDPR
webhooks (is it constant-time? does a missing signature fail closed?); whether any
handler writes a token row before all verification passes; whether a client id or
secret can reach a log line or an error response; and whether one client's callback
can write another client's row.

For each finding give the file, the line, the concrete request that exploits it, and
the smallest fix. Rank by severity. If a check is correct, say so — I want to know
what was verified, not only what failed.

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
```

**You get:** a ranked findings list. Fix the confirmed ones in a follow-up PR before W6.

---

## W6 — Submit · You · ~45 min · no Claude · needs W5 clean

**What you're doing.** Putting bcns's name on three app listings. This is the part
that can't be delegated at all.

1. Shopify: submit for review. Days to weeks.
2. Meta: submit for `ads_read` app review. Business verification from W1 should be
   done or close by now; the review needs it.
3. Monday: submit the OAuth app listing. Days.

Then it's calendar. As each approval lands, that source's button on the hub flips
from "Request connection" to "Connect", and from then on that source is self-serve
for every client, forever.

**Not in scope, deliberately:** Google. Meet and Drive stay on the Internal-app path
inside each client's Workspace — no review, but a one-time admin setup per client.
Revisit restricted-scope verification at roughly ten Drive clients, or sooner if W0b
came back yes.
