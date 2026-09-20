# W5a — Shopify OAuth + webhook security review

Adversarial read of the merged Shopify handshake. Report only; no code was
changed. Scope was the eight files named in the W5a prompt, plus
`tests/shopify-oauth.test.mjs` (37 cases) read first so nothing a passing test
already guards is reported as new.

Three supporting files were opened **only to settle a question the attack list
asks and the eight files cannot answer on their own** — `lib/session.ts`
(what `requireOwner` and `session.api` actually enforce), `lib/request-connection.ts`
(whether `sendMail` can throw), and the two `api.connect_source` migrations
(attack 3 is a question about that function). No finding below is *about* those
files.

**Verdict: no Critical or High findings. One Medium, four Low, two Informational.**
Nothing here blocks W6a submission. The Medium is a real cryptographic defect
with a working proof of concept, and it is a one-line fix worth landing before
the app is public.

---

## Ranked findings

### 1. MEDIUM — the state signature is a valid webhook signature for the same key

`lib/shopify-oauth.ts:118` (`signState`), `lib/shopify-oauth.ts:184` (`verifyWebhookHmac`)

All three signatures in this file are HMAC-SHA256 under **the same key**,
`config.shopifyClientSecret`, with **no domain separation** — no per-use prefix,
no per-use derived key. The file header correctly warns that the three are "NOT
interchangeable", but nothing in the code enforces that. They differ only in
encoding (`hex` for state and query, `base64` for webhooks), and encoding is not
a security boundary: it is the same digest bytes rendered two ways.

Two of the three uses are forced on us — Shopify signs both the callback query
and the webhooks with the client secret, so we must verify both under that key.
The state HMAC is the one that is entirely ours, and it is the one that leaks.

**The attack.**

*Inputs.* The attacker is any **owner** on the hub — a real bcns client, a
legitimate but untrusted party. Owner is all `/api/oauth/shopify/start` requires
(`start/route.ts:33`).

1. Attacker GETs `/api/oauth/shopify/start?shop=attacker-store.myshopify.com`.
2. They read `state` = `<body>.<hexsig>` straight out of the 302 `Location`
   header. No interception needed — it is their own request. (It is also in the
   `shopify_oauth_state` cookie, in their browser history, and in Shopify's logs.)
3. They convert the hex signature to base64: `Buffer.from(hexsig,'hex').toString('base64')`.
4. They POST to `/api/webhooks/shopify/shop-redact` with body exactly `<body>`
   (the base64url blob) and header `X-Shopify-Hmac-Sha256: <that base64>`.

*What the attacker gets.* `verifyWebhookHmac` returns true. `handleGdprWebhook`
returns 200 and an email. The route sends it. Confirmed by running the three
primitives verbatim out of the file:

```
state sig   (hex)      : 2eac90b860d56570c8bef65e28a1ae9bb591fb5ee12d141849ecbefc2f0e1a87
forged webhook header  : LqyQuGDVZXDIvvZeKKGum7WR+17hLRQYSey+/C8OGoc=
verifyWebhookHmac(body, forgedHeader, SECRET) = true
control (arbitrary body)                      = false
```

So the attacker can forge a Shopify-authenticated privacy webhook on any of the
three topics. Two consequences:

- **A forged compliance signal.** The operator receives an email headed
  `Shopify privacy webhook: shop/redact` with
  `Deadline: 48 hours from uninstall — erase the shop's data`. The handler's
  whole job is to tell a human to act, and the email says the payload is
  "verified, as received from Shopify" (`shopify-webhooks.ts:77`) — which is now
  false. Inducing an operator to erase a client's data on a fake 48-hour notice
  is the realistic harm.
- **Unbounded mail to the ops inbox.** Each `/start` mints a fresh usable
  signature, and there is no replay protection (finding 3), so one signature can
  be POSTed indefinitely.

What the attacker does **not** get: no token, no cross-tenant read, no database
access. The forged body is constrained to the base64url of
`{"shop":<their chosen myshopify host>,"clientId":<their own>,"exp":…,"nonce":…}`,
so they control the `shop` string in the email and nothing else. That ceiling is
why this is Medium and not High.

**Why the tests miss it.** Every signature test is single-domain — it checks
that a state verifies as a state and a webhook verifies as a webhook. The one
encoding test, `"a hex-encoded webhook signature is not accepted for a base64
header"` (test:177), asserts a hex *string* is rejected as a header, which is
true and is not this bug. The bug is the correctly-base64-re-encoded digest.
Nothing cross-checks one domain's output against another domain's verifier.

**Smallest fix.** Give the state its own domain. One line:

```ts
// shopify-oauth.ts — both signState and verifyState
createHmac("sha256", secret).update(`state:${body}`).digest("hex")
```

The `state:` prefix is not producible as a webhook body a `signState` caller
controls, so the oracle closes. A separate `SHOPIFY_STATE_SECRET` env var is the
stronger version, but it is an extra secret to provision on every deploy and the
prefix removes the same attack. Add a test that asserts a state signature,
re-encoded to base64, is rejected by `verifyWebhookHmac`.

---

### 2. LOW — `api.connect_source` is callable directly, and `p_config` is unvalidated

`app/api/oauth/shopify/callback/route.ts:117` — and this is the direct answer to
attack 3, "can anything reach it carrying a value the callback did not just verify?"

**Yes.** `grant execute on function api.connect_source(...) to authenticated`
(`20260919000100_connect_source_refresh.sql:79`) means any signed-in member can
call the RPC straight through PostgREST. The callback is not the only door, and
it is not a security boundary for what lands in the row — it is a correctness
boundary.

What does hold, verified in the migration:

- `tenant uuid := data.tenant_or_raise()` — the tenant comes from the caller's
  JWT, never from a request parameter, so an owner of A cannot write into B.
- `data.active_client_role() is distinct from 'owner'` → raise — the owner check
  is enforced in the database, not only in `requireOwner`.
- `p_secret` null/empty is rejected.
- `data.attach_source` is revoked from `anon`, `authenticated` and `service_role`.

What does not: **`p_config` is validated nowhere.** It goes
`coalesce(p_config,'{}'::jsonb)` straight into `data.connector_schedule.config`.
`p_source`, `p_kind`, `p_interval` and `p_backfill_depth` are at least
null-checked and then cast (a bad value raises). `p_config` is checked by
nothing on either side of the wire — the callback's `normalizeShop` +
`scheduleConfig` is the only thing that ever shaped it, and an attacker calling
the RPC directly skips that.

**The attack, and why it stops short.** An owner POSTs to
`/rest/v1/rpc/connect_source` with `p_config: {"shop":"https://attacker.example/x"}`.
The row is written. On the next tick the worker reads it. I chased the obvious
SSRF and **it does not land**: `shopifyEndpoint`/`shopifyTokenUrl`
(`platform/worker/src/connectors/shopify-url.ts:9,13`) rebuild the host from
`shopHandle(shop)`, which is `split('/')[0].split('.')[0]` — the host is
*reconstructed* as `https://<handle>.myshopify.com`, not taken verbatim. The
Shopify token cannot be sent off `myshopify.com` this way.

So the real blast radius is: an owner can write arbitrary connector config into
**their own** tenant and break **their own** sync. Self-inflicted, which is why
this is Low rather than Medium. It is recorded because the prompt asked the
question, because the invariant "only the OAuth callback shapes this config" is
false and should not be relied on by anything built later, and because
`p_config` is the one parameter of the six with no check at all.

**Smallest fix.** Validate `p_config` in the RPC beside the checks already
there — for `p_source = 'shopify'`, require
`p_config->>'shop' ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'`, the same regex
`SHOP_DOMAIN` already uses. One `if` next to the existing `p_secret` check.

---

### 3. LOW — GDPR webhooks have no replay protection

`lib/shopify-webhook-route.ts:22-34`, `lib/shopify-webhooks.ts:64`

The handler verifies the HMAC and nothing else. Shopify sends
`X-Shopify-Webhook-Id` (a per-delivery uuid) and `X-Shopify-Triggered-At` (an
RFC-3339 timestamp); neither is read. There is no freshness window and no
de-duplication.

**The attack.** Anyone who obtains one valid `(body, signature)` pair — from a
log, a proxy, a retry, or finding 1 — can POST it unlimited times, forever. Each
POST returns 200 and sends another email to `nseluga@bcn-services.com`. The
signature never expires because nothing in it is time-bound.

This is what turns finding 1 from "one forged email" into "arbitrary volume",
and the two should be fixed together.

**Smallest fix.** Reject a request whose `X-Shopify-Triggered-At` is more than a
few minutes old, in `gdprRoute` beside the secret check. That is one comparison
and needs no storage. Real de-duplication on `X-Shopify-Webhook-Id` needs a
table and is not worth it at this volume.

---

### 4. LOW — the redact handler makes a fresh durable copy of the PII being redacted

`lib/shopify-webhooks.ts:73-79`

`handleGdprWebhook` puts the entire raw body into the notification email:
`"Payload (verified, as received from Shopify):", rawBody`. For
`customers/redact` and `customers/data_request` that body is the customer's
identifiers — Shopify's payload carries `customer.id`, `customer.email` and
`customer.phone`, and the test at line 194 asserts the customer id reaches the
email on purpose.

So the system's response to "erase this customer" is to copy that customer's
identifiers into a mailbox, where they persist indefinitely, outside anything
the redaction runbook covers. That is a weak posture for the exact endpoint
whose purpose is erasure, and the mailbox is not in scope of any later cleanup.

This is not a vulnerability — the file is honest that "verify, record, notify a
human, 200" is the deliberate design, with the `ponytail:` upgrade path already
written at line 23. It is flagged because a privacy review that did not mention
it would be incomplete, and because the fix is small.

**Smallest fix.** Email the topic, the deadline, the `shop_domain` and the
Shopify webhook id — enough for a human to find the request in the Shopify admin
— instead of the full body. Drop `customer.email` and `customer.phone` from the
mail. The operator does not need the PII in the notification to act on it.

---

### 5. LOW — the callback query HMAC canonicalization is ambiguous

`lib/shopify-oauth.ts:168-174`

The signed message is built by joining `${key}=${value}` with `&` and no
escaping of `=` or `&` inside values. Distinct parameter sets therefore collapse
to the same message. Confirmed: a genuine callback re-encoded as a *single*
parameter whose value contains the delimiters verifies against the original,
unmodified signature.

```
genuine query verifies              : true
same hmac, all params merged into one: true   <- message is byte-identical
```

**Why it is inert today.** After the HMAC passes, the route reads values back by
key — `params.get("shop")` (`callback/route.ts:84`), `get("code")` (:86),
`get("state")` (:90). In the merged form those return `null` and the route fails
closed at `invalid_shop`. I tried to construct a variant where the message stays
byte-identical *and* `get("shop")` returns an attacker-chosen host, and could
not: every entry contributes its text to the message, so changing what `get()`
returns necessarily changes the message. Duplicate keys do not help either —
`get()` returns the first, but `entries()` emits both, so the message grows.

Recorded as latent, not exploitable. It is the kind of defect that becomes live
the moment someone adds a parameter that is read differently, and W5b will clone
this function for Meta and Monday.

**Smallest fix.** URL-encode both sides before joining, matching what Shopify's
own reference implementations do:
`.map(([k,v]) => \`${encodeURIComponent(k)}=${encodeURIComponent(v)}\`)`. Verify
against a real captured callback before landing — if Shopify signs the decoded
form, this change would break every install, so it needs one live test, not just
a unit test.

---

### 6. INFORMATIONAL — the state cookie outlives the state it carries

`app/api/oauth/shopify/start/route.ts:55` sets `maxAge: 600` (10 minutes);
`lib/shopify-oauth.ts:55` sets `STATE_TTL_MS` to 5 minutes.

No impact — `verifyState` runs before the cookie check (`callback/route.ts:90`
then `:96`), so the signed expiry is the binding one and the stale cookie is
inert. It is a mismatch between two numbers that are meant to express one
policy, and someone will eventually change one and not the other. Set
`maxAge: STATE_TTL_MS / 1000`.

---

### 7. INFORMATIONAL — no length bound on the shop handle

`lib/shopify-oauth.ts:64`. `SHOP_DOMAIN` is
`^[a-z0-9][a-z0-9-]*\.myshopify\.com$` with no upper bound, so a 300-character
handle is accepted and reaches `installUrl` and the `fetch` host. Real Shopify
handles are far shorter. No attack follows — the redirect target is still
`myshopify.com` and DNS resolution fails — and I confirmed the regex is not
vulnerable to catastrophic backtracking (50,000-character adversarial input:
1 ms), because `[a-z0-9-]` cannot match the `.` that follows it. Cap at
`{0,59}` if you want the boundary tight.

---

## Unconfirmed

Things I could not settle by reading the code. Deliberately not ranked above.

- **Whether Shopify signs the decoded or the encoded query.** Finding 5's fix
  depends on it and I have no captured real callback to check against. Getting
  this backwards breaks every install, so it needs one live test before the
  encoding change lands.
- **Whether `shopHandle` can be coerced into a resolvable non-Shopify host.**
  Inputs containing `\`, `#` or `?` push the effective host to a bare label
  (`https://a\evil.com…` → host `a`), which normally fails DNS — but I cannot
  rule out a deployment whose DNS search domain makes a bare label resolve. It
  is in `platform/worker`, outside this review's surface, and reaching it needs
  finding 2's direct RPC call. Worth one look during the W5b worker pass.
- **Cookie tossing from a sibling subdomain.** An attacker controlling another
  `*.bcn-services.com` host could set `shopify_oauth_state` for the parent
  domain and have it sent to `connect.`. The tenant check at
  `callback/route.ts:102` should still refuse it, since the state names the
  attacker's own `clientId` — but I cannot verify from here that no sibling
  subdomain is delegated to a third party. If the hub ever sets a parent-domain
  cookie, re-check.
- **Whether `data.tenant_or_raise()` and `data.active_client_role()` read the
  JWT rather than a settable session variable.** Finding 2's "an owner of A
  cannot write into B" rests on it. Both are outside this surface; the migration
  comments assert it and `catalog.test.ts` is cited as the guard.

---

## Verified correct

Stated explicitly, because "what was checked and held" is the other half of the
result.

**The callback's ordering is right, and it is the security property the header
claims.** Approval gate → Shopify query HMAC → our state → cookie → session and
tenant → exchange → write. Nothing touches the network before step 6 and nothing
touches the database before step 7, so a forged callback costs an HMAC and a
redirect. I tried to reorder it and could not find a step that reads an
unauthenticated value early.

- **State forgery: closed.** `verifyState` (`shopify-oauth.ts:130`) checks the
  signature over the raw `body` *before* `JSON.parse`, so `exp` and `clientId`
  are never read from an unauthenticated blob. This is the single most important
  ordering decision in the file and it is correct. Tests cover tampering (:70),
  wrong secret (:79), expiry (:84), shop mismatch (:94), shapeless input (:102).
- **Binding an attacker's shop to a victim's tenant: closed.** The state carries
  the minting session's `clientId` and `callback/route.ts:102` refuses when the
  finishing session disagrees. A victim clicking an attacker's callback URL
  fails both this check and the cookie check.
- **Binding a victim's shop to an attacker's tenant: closed.** Requires a
  Shopify-signed callback for the victim's store, which requires the victim to
  authorize the app. Not forgeable.
- **Replay of a captured callback: closed** by three independent things — the
  `httpOnly` cookie an attacker cannot set in a victim's browser, the 5-minute
  signed expiry, and Shopify's one-time `code`.
- **Constant-time comparison: correct.** `safeEqual` (:86) hashes both sides
  before `timingSafeEqual`, which makes every comparison fixed-width and avoids
  the length-mismatch throw that would itself leak. Tested at :302.
- **Raw body, not a reparse.** `gdprRoute` uses `await request.text()`
  (`shopify-webhook-route.ts:22`) and the signature is computed over those exact
  bytes. Tested at :162 and :166.
- **Webhook encoding.** Base64 for the webhook header, hex for state and query —
  each verifier uses the right one. Tested at :177. (The *key* being shared
  across them is finding 1; the encodings themselves are right.)
- **Webhooks fail closed on misconfiguration.** A missing `SHOPIFY_CLIENT_SECRET`
  401s at `shopify-webhook-route.ts:16` rather than skipping the check, and a
  missing header 401s at `shopify-oauth.ts:183`. Tested at :172 and :184.
- **No shop-existence oracle.** All three handlers return the same 200 `{ok:true}`
  for any valid signature and the same 401 for any invalid one, regardless of
  whether the shop is known. Nothing branches on shop identity.
- **A failed notification does not 500.** `sendMail` is total — it returns
  `false` on a missing key, a non-ok response, and a thrown fetch, and every path
  is inside the `try` (`request-connection.ts:104-131`). The comment at
  `shopify-webhook-route.ts:31` is accurate: a Resend outage cannot produce the
  non-2xx that would make Shopify retry for days and penalize the app.
- **Open redirect: closed.** Every redirect target is either `config.hubBaseUrl`
  with a literal error code, or `https://${shop}` where `shop` came through
  `normalizeShop`. No user-controlled value reaches a `Location` header unfiltered.
- **`normalizeShop` holds against hostile input.** Rejected: `evil.com`,
  `acme.myshopify.com.evil.com`, `https://evil.com@acme.myshopify.com/`,
  `acme.myshopify.com\@evil.com`, a trailing dot, a port, `?`/`#` suffixes, and
  percent-encoded traversal. Unicode case-folding is safe because the *normalized*
  ASCII output is what every caller uses, not the input. Tested at :34 and :44.
- **No token material in any log or URL.** The only `console.warn` on the
  callback path (`callback/route.ts:70`) receives a coarse code, and the one
  place that could echo a token deliberately logs `error.code` instead of
  `error.message` (:127-128). The browser only ever sees `?error=connect-failed`,
  which is the same string for every failure reason — no oracle. The precise
  reason goes to the server log.
- **Owner is enforced twice.** `requireOwner` in the route and
  `data.active_client_role()` in the RPC. The route check is not load-bearing
  on its own, which is the right way round.
- **`expiring: "1"` and the refresh fields** are on the exchange and the write,
  and are guarded by source-reading tests (:258, :266) because nothing at
  runtime reports their absence.

---

## Accepted, not a finding

`packages/tenant/tests/matcher.test.mjs` fails on `main`. `apps/connect/middleware.ts:27`
adds `api/webhooks/` to its matcher exclusion; `TENANT_MATCHER`
(`packages/tenant/src/middleware.ts:22`) does not, and the test asserts every app
inlines `TENANT_MATCHER` exactly.

**Accepted as correct.** Shopify calls the three privacy webhooks
server-to-server with no cookie; inside the matcher they would answer 307 to
`/login`, Shopify would record a failed webhook, and the app would be rejected at
review. The exclusion is required. The routes are not unauthenticated — each
verifies an HMAC over the raw body and 401s on failure — and
`tests/shopify-oauth.test.mjs:368` pins the real matcher so the exclusion cannot
silently widen to the OAuth routes.

---

## Coverage the existing tests already give

Mapped so the gaps are visible. Of 37 cases, the ones that carry a security
property: shop normalization (2), state signature/expiry/shop-binding/shape (7),
query HMAC including tamper and wrong-secret (4), webhook HMAC including
encoding confusion and fail-closed (5), the GDPR 401/200 split (2), token
response refusals (4), the approval gate (3), the middleware matcher (1).

**Not covered by any test, and all of it is a finding above:** cross-domain
signature reuse (1), direct RPC reachability and `p_config` validation (2),
webhook replay (3), what the notification email contains as a privacy question
(4 — the payload reaching the email is *asserted*, but as a requirement, not
examined as a risk), query canonicalization (5).

---

## What to do before W6a

Findings 1 and 3 together, in one small PR — a `state:` prefix in `signState`
and `verifyState`, plus a freshness check on `X-Shopify-Triggered-At` in
`gdprRoute`. Add the missing cross-domain test: a state signature, re-encoded to
base64, must be rejected by `verifyWebhookHmac`.

Finding 4 is a judgment call on how much PII the notification carries and is
worth deciding before the app is public, since it is the endpoint a privacy
reviewer would look at first.

Findings 2, 5, 6 and 7 can wait. Finding 5 should be revisited during W5b, since
`verifyQueryHmac` will be cloned for Meta.
