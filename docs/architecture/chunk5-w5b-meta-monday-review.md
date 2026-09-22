# W5b — Meta + Monday OAuth security review

Adversarial read of the merged Meta and Monday handshakes (PR #51, merge commit
`ed3668a`). Report only; no code was changed. Scope was the twelve files named
in the W5b prompt, plus `tests/meta-monday-oauth.test.mjs` (14 cases), read
first so nothing a passing test already guards is reported as new. Format and
bug classes follow `chunk5-w5a-shopify-review.md`.

To settle questions the twelve files cannot answer alone, I followed one hop
into `lib/session.ts` (`requireOwner`), the `api.connect_source` migration
(`20260919000100_connect_source_refresh.sql`), and the worker's
`connectors/meta.ts`, `connectors/monday.ts`, `connectors/index.ts` and
`tokens.ts` (how `act_id`, `board_id` and `expires_at` are consumed). No finding
is *about* those files. Two claims were checked by running the real functions
(`node --experimental-strip-types`, script deleted afterwards); the test suite
itself was not run because the worktree has no `node_modules`.

**Verdict: no Critical or High findings. One Medium, two Low, four
Informational.** The state parameter, the token handling and the
`signed_request` check all hold. The Medium is the automatic
first-account/first-board pick. It is a product-correctness bug that has a
confidentiality edge, and it is the one thing to fix before tenants get the
Connect button.

---

## Ranked findings

### 1. MEDIUM — the callbacks silently bind "whichever account came first"

`lib/meta-oauth.ts:60-68` (`pickAdAccount`), `app/api/oauth/meta/callback/route.ts:80-86`;
`lib/monday-oauth.ts:44-52` (`pickBoard`), `app/api/oauth/monday/callback/route.ts:69-77`

Both callbacks ask the provider what the token can see and write the first valid
id into `p_config`, with no user choice and nothing in the UI saying what was
picked. The token itself is legitimate. The *resource* is a guess, and other
people can influence it.

**The attack / failure.**

- *Meta, agency or Business Manager user.* `/me/adaccounts` returns every ad
  account the Facebook user can reach, including accounts owned by other
  businesses that granted them access. It also returns disabled and closed
  accounts, because `account_status` is not requested or filtered. Owner of
  tenant A clicks Connect → the first `act_…` in Graph's unspecified order is
  written → **another business's ad spend, campaigns and creatives are synced
  into tenant A** and shown to every member of A. The owner is told
  `?connected=meta` and nothing more.
- *Meta, steered.* Anyone who can add the victim's Facebook user to an ad
  account they control (a Business Manager invite the victim accepts, e.g. an
  agency relationship) adds an entry to the victim's list. If it sorts first,
  the victim's tenant syncs the attacker's account. The attacker gains no data,
  because they already own it. What they get is control over the numbers the
  victim's dashboard reports.
- *Monday, steered.* `boards(limit: 25, state: active, order_by: created_at)`.
  Any member of the victim's Monday account can create a new board to change
  which board comes first. If Monday orders newest first (see Unconfirmed), the
  victim's tenant syncs that member's board. A subitems board or a board the
  owner never meant to share can also be picked.

What the attacker does **not** get: nobody else's token, and no write into
another bcns tenant. The token and the tenant stay correctly bound (see Verified
correct). That limit is why this is Medium and not High.

**Tests.** `pickAdAccount / pickBoard take the first valid id` (test:79)
*asserts* this behaviour as intended. It does not cover it as a risk.

**Smallest fix.** Do not guess when there is a choice. In both callbacks, when
more than one valid id comes back, fail with a distinct code (e.g.
`?error=choose-account`) and let the card fall back to "Request connection" so a
human picks. For Meta, also request `fields=id,account_status` and skip anything
not `account_status === 1`. A real picker can come later. The fix is about
twenty lines and changes no schema.

---

### 2. LOW — the data-deletion callback accepts a `signed_request` of any age (the W5a #3 bug class, reintroduced)

`lib/meta-oauth.ts:100-109`, `app/api/oauth/meta/data-deletion/route.ts:38-56`

`verifySignedRequest` checks the signature, the algorithm and `user_id`. It does
not read `issued_at`, and there is no de-duplication. Confirmed by running the
function: a correctly signed payload with `issued_at: 1` (1970) returns
`{ ok: true, userId: "42" }`.

**The attack.** *Inputs:* one genuine `signed_request` body, obtained from a
request log, a proxy, a mis-set log level, or a debugging paste. *What the
attacker gets:* unlimited POSTs, each answered 200 and each sending another
"Meta data deletion request" email to `BCNS_EMAIL`, plus a log line. So the
notification mailbox can be flooded with genuine-looking erasure requests. There
is no token, tenant or data exposure.

Shopify's webhooks got exactly this fix after W5a (`isFreshTriggeredAt` in
`lib/shopify-webhook-route.ts:22`). The Meta route did not inherit it.

**Tests.** None. Every signed-request test signs a fresh payload, and only the
"good" case includes `issued_at` at all.

**Smallest fix.** In `verifySignedRequest`, after the algorithm check, reject
when `typeof issued_at !== "number"` or when `now - issued_at*1000` is more than
about an hour. It is one comparison and needs no storage, the same shape as
`isFreshTriggeredAt`. Add one test with a stale `issued_at`. Before landing,
check that Meta's deletion payloads always carry `issued_at` (see
Unconfirmed).

---

### 3. LOW — `/start` is a cross-site-triggerable GET

`app/api/oauth/meta/start/route.ts:16`, `app/api/oauth/monday/start/route.ts:12`
(and the form at `app/page.tsx:148`, `method="GET"`)

Any third-party page can send a signed-in owner's browser to
`https://connect.bcn-services.com/api/oauth/meta/start`. It is a top-level GET,
so the `SameSite=Lax` session cookie goes with it. The hub signs a state for the
owner's tenant, sets the state cookie and redirects to Meta or Monday.

**What the attacker gets.** Very little, and only with the victim's help. If the
victim clicks through the provider's "Continue" prompt, *their own* account is
re-connected to *their own* tenant. That overwrites the existing connection with
whatever finding 1 picks this time. The attacker never learns the state, so they
cannot swap in their own code; the cookie check plus the tenant check hold.
The effect is a forced reconnect or a flip of the chosen account, never a
cross-tenant bind. Shopify's `/start` has the same shape, so this is a class
issue, not a W4 regression.

**Smallest fix.** Reject a `/start` request whose `Sec-Fetch-Site` header is
present and is not `same-origin`. That is one line per route. Alternatively,
switch the card form to `method="POST"` and export `POST`: Lax cookies are not
sent on a cross-site POST.

---

### 4. INFORMATIONAL — state cookie outlives the state (W5a #6, repeated)

`app/api/oauth/meta/start/route.ts:32` and `app/api/oauth/monday/start/route.ts:28`
set `maxAge: 600`. `lib/oauth-state.ts:16` sets `STATE_TTL_MS` to 5 minutes.
This is inert, because `verifyState` runs first in both callbacks and the signed
expiry wins. Use `STATE_TTL_MS / 1000` so there is one number.

### 5. INFORMATIONAL — direct `connect_source` calls reach `act_id` / `board_id` unvalidated (W5a #2, extended)

`api.connect_source` is granted to `authenticated` and `p_config` is still
unchecked (migration `20260919000100:71`), so an owner can write any `act_id`
or `board_id` for their own tenant directly through PostgREST. I followed both
into the worker, and **neither lands anywhere dangerous**:

- `meta.ts:24` builds `new URL(\`${GRAPH}/${path}\`)` with a fixed
  `https://graph.facebook.com/v21.0/` prefix. The host is parsed before
  `act_id` is appended, so `@`, `../`, `?` or `#` cannot move the token off
  Graph.
- `monday.ts:43` passes `board_id` as a GraphQL *variable*, not an
  interpolated string, so there is no query injection.

The blast radius is breaking your own tenant's sync. The fix is the one W5a
gave: a per-source check beside `p_secret`, e.g. `p_config->>'act_id' ~
'^act_\d+$'` for meta and `p_config->>'board_id' ~ '^\d+$'` for monday.

### 6. INFORMATIONAL — a network throw in a callback is a 500, not `connect-failed`

`meta/callback/route.ts:33-42,80-85`, `monday/callback/route.ts:53-75`. A
`fetch` timeout (`AbortSignal.timeout`) or DNS failure rejects and is not
caught. Next answers 500 and the state cookie is not cleared. Nothing leaks: the
thrown error names the URL, not the body, and neither URL carries a secret. The
Shopify callback has the same shape. The fix is to wrap the network section in
`try { … } catch { return fail("network") }`.

### 7. INFORMATIONAL — token kind and worker comment call the Meta token a "system user" token

`lib/meta-oauth.ts:16` writes `meta_system_user`, and `worker/src/connectors/meta.ts:1`
says "system-user token (no expiry)". The OAuth flow actually produces a
~60-day *user* token. It is harmless today because `tokens.ts:26` skips
refresh when a connector has no `refreshToken`, and Graph code 190 classifies as
`auth` (`index.ts`), which gives the reconnect path described in the caveat
ruling below. The label will mislead whoever builds Meta refresh, so correct the
worker comment when that work starts.

---

## W4 caveat rulings

| Caveat | Ruling | Why |
|---|---|---|
| Meta ~60-day token, no refresh → `auth_failed` → reconnect | **Acceptable known limit** | It fails closed: Graph error 190 is classified `auth`, `health.ts` raises the `auth_failed` alert, and `p_expires_at` is stored, so a "reconnect soon" warning can be added later without a schema change. |
| No Meta user → tenant mapping; deletion requests matched by hand | **Acceptable known limit** | Every request is logged and emailed, and it can be matched by hand by calling `GET /me?fields=id` with each stored Meta token and comparing to the app-scoped `user_id`. Write that one-line recipe into the runbook before the volume makes it painful. |
| First ad account / board pick | **Fix before opening Meta/Monday to tenants** | Finding 1: an agency or multi-business user silently syncs another business's data into the tenant, and other people can steer the pick. Refusing when more than one account is found is a small fix. |
| Monday `scope` param not verified against the token response | **Acceptable known limit** | Monday caps a token at the scopes configured on the app in its Developer Center, so least privilege lives there. Keep that app configured with only `boards:read` and `me:read`, and treat widening it as a reviewed change. |

---

## Unconfirmed

Things I could not settle by reading the code. Not ranked above.

- **Monday's `order_by: created_at` direction.** Finding 1's Monday steering
  assumes newest-first. If it is oldest-first, a co-member cannot push a new
  board to the front, but the "first board is a guess" problem stays.
- **Whether Meta's data-deletion `signed_request` always includes `issued_at`.**
  Meta's documented payload does, and finding 2's fix depends on it. Capture one
  real request before making the field mandatory.
- **Whether Graph and Monday accept these token-exchange encodings.** Meta's
  docs show `GET /oauth/access_token` with query parameters; the code POSTs a
  form body instead (safer, and Graph generally accepts POST). Monday gets a JSON
  body. These are correctness questions, not security ones. One live connect per
  source settles them.
- **The worker puts the Meta token in URLs.** `connectors/meta.ts:26` sets
  `access_token` as a query parameter, and so does the `tokens.ts:46` probe.
  That is outside W4 and predates it, but it is the one place a Meta token sits
  in a URL. Whether `ctx.fetch` or anything downstream logs full URLs was not
  checked. Sending `Authorization: Bearer` would remove the question.
- **`session.membership.clientId` and `data.tenant_or_raise()` agree.** The
  callbacks compare the state to the former, and the RPC writes to the latter.
  If a multi-tenant user's "active client" could differ between the cookie
  session and the JWT the RPC sees, the route-level tenant check would be
  comparing against the wrong tenant. This was carried from W5a and is still
  outside this surface.
- **An expired session mid-flow.** The callback URL, with `code` and `state` in
  it, is inside the middleware matcher. A signed-out owner is bounced to
  `/login` and may carry that URL in a `next` parameter. The code is single-use
  and needs the client secret, so the exposure is small. I did not check what
  `/login` loads, or whether it sends a Referer.

---

## Verified correct

**State (`lib/oauth-state.ts`) is the whole CSRF defense for both sources, and
it holds.**

- **Signed and checked before parse.** `verifyState:57` compares the HMAC over
  the raw body *before* `JSON.parse`, so `clientId` and `exp` are never read from
  an unauthenticated blob. Tested (test:32).
- **Expiring.** 5-minute `exp` inside the signature. Tested (test:38).
- **Domain-separated.** The `state:` prefix means a state signature cannot be
  re-encoded into a valid Meta `signed_request` (W5a #1 not reintroduced).
  Tested (test:42). The deletion `confirmationCode` uses a third prefix,
  `deletion:`. The reverse direction is also closed: a genuine Meta
  `signed_request` signature covers an unprefixed base64url string, which can
  never equal `state:…`.
- **Cross-source replay is closed three ways.** (a) Each source signs with its
  own client secret. I ran it: a Monday-signed state on the Meta verifier →
  `bad_signature`. A Shopify state is also signed under a different secret, and
  its payload carries `shop`. (b) The state cookie is path-scoped
  (`/api/oauth/meta` vs `/api/oauth/monday`), so a state minted for one source
  has no matching cookie on the other. (c) Even if both passed, the state only
  names a tenant, and the callback requires it to equal the finishing session's
  tenant, so nothing is gained.
- **Attacker's account → victim's tenant: closed.** It would need the victim's
  state, which exists only in the victim's `httpOnly` cookie and the victim's
  own redirect, plus the victim's session.
- **Victim's account → attacker's tenant: closed.** A victim who consents on a
  dialog URL the attacker built lands on the callback without the attacker's
  cookie → `state_cookie` fail. The code is never exchanged.
- **Not single-use server-side, and it does not need to be.** The nonce is not
  stored, so a state can be replayed within 5 minutes. A replay still needs the
  same browser's cookie, the same tenant's owner session and a fresh
  provider-issued code (single-use at Meta and Monday). The cookie is cleared on
  every non-throwing exit.
- **Bound to the tenant, not the user.** That is deliberate and sufficient:
  `connect_source` writes per tenant and requires owner, so any owner of the
  tenant finishing the flow is authorised to make the same write.

**Ordering in both callbacks.** Approval gate → state signature → cookie →
owner session + tenant equality → code → network → write. Nothing touches the
network or the database before the state and tenant checks. For Monday, this is
also tested behaviourally (test:133: forged state → 307 `connect-failed`, zero
`fetch` calls).

**Monday has no HMAC, and nothing fails open.** Missing credentials or approval
fail `oauthEnabled` (tested, test:162). A missing or garbage state, cookie,
code, token, board or RPC error each goes to `fail()`. There is no branch that
proceeds on an absent value.

**Meta token handling.**

- The client secret, code and short-lived token go only in POST form bodies
  (`codeExchangeBody`, `longLivedBody`), never in a URL. Tested (test:52).
- Only the long-lived token reaches `p_secret`. The short one is used once, as
  the input to the exchange. Tested by source match (test:69).
- `handleMetaToken` / `handleMondayToken` never echo a response body. `detail`
  is only `HTTP <status>`.
- Every `console.warn` gets a coarse code plus that status or `error.code`,
  never `error.message`, which could echo `p_secret`. Tested for the Meta route
  (test:76). The Monday route follows the same pattern but has no equivalent
  source test.
- `/me/adaccounts` and the Monday boards query send the token in a header, not
  the URL.

**The token write.** `api.connect_source` takes the tenant from
`data.tenant_or_raise()`, re-checks owner in the database, and rejects an empty
secret. In the callbacks, every value comes from the provider response the
route just received or from constants: `act_id` must match `^act_\d+$` and
`board_id` must match `^\d+$`. Monday omits the two defaulted parameters, and
the eight-argument signature has defaults for both, so that call resolves.

**Data deletion (`verifySignedRequest`).**

- HMAC-SHA256 over the *encoded* payload with the app secret, compared as raw
  digests with `timingSafeEqual` after a length check, so the check cannot
  throw. The algorithm is checked, and it is checked after the signature, which
  is the safe order because the HMAC is fixed regardless. Tested (test:97-113).
- The signature is verified before anything is logged or mailed. A failure logs
  only the reason and returns 401. A missing secret also returns 401 (tested,
  test:115-128).
- **No existence oracle.** There is no lookup at all. The response is a
  deterministic function of the verified `user_id`, and the `GET` status page is
  static and ignores `?code`, so nothing is reflected (no XSS).
- Mail spam from *forged* requests is impossible: only a valid signature reaches
  `sendMail`. Replay of a genuine request is finding 2.
- `sendMail` is total, per W5a, so a Resend outage cannot turn a verified
  request into a 5xx.

**Middleware.** W4 widened the exclusion by exactly one path:
`api/oauth/meta/data-deletion$`. It is necessary, because Meta calls it
server-to-server with no cookie and a 307 to `/login` would fail app review.
It is authenticated by `signed_request`, and its GET is a static page. It is
anchored with `$`, and `/start` and `/callback` for both sources stay inside the
matcher. Tested (test:176).

**Redirects.** Every `Location` is `config.hubBaseUrl` plus a literal query, the
provider's fixed dialog origin, or `requireOwner`'s relative path. No request
value reaches a redirect target, and the browser sees only
`?error=connect-failed` whatever the reason.

**`app/page.tsx`.** The change only hides the `shop` input for non-Shopify
cards. The Meta and Monday forms submit no parameters, and the start routes read
none.

---

## Accepted, not a finding

`packages/tenant/tests/matcher.test.mjs` fails because `apps/connect` excludes
`api/webhooks/` on purpose (providers must reach webhooks unauthenticated). This
was accepted in W5a. W4's one further exclusion (`api/oauth/meta/data-deletion$`)
is judged on its own merits above and is necessary and correctly narrow.

---

## Coverage the existing tests already give

Security properties already guarded: state signature, tamper, expiry and shape
(test:26-40); state vs `signed_request` domain separation (:42); secrets in POST
bodies (:52); short→long token and no token in logs for Meta (:69); token
refusals (:61, :79); `signed_request` good, tamper, wrong secret, algorithm and
shape (:97-113); the deletion route's 401/200 split and missing-secret 401
(:115); forged Monday state rejected before any network call (:133); dark by
default (:162); the matcher exempting only the deletion path (:176).

Not covered, and each is a finding above: first-pick selection as a risk (1,
where it is asserted as intended), stale `signed_request` (2), cross-site
`/start` (3). There is also no Meta equivalent of the forged-state callback test
at :133 and no Monday equivalent of the no-token-in-logs check at :69. The code
is right; the tests are just asymmetric.

---

## What to do before opening Meta/Monday to tenants

1. Finding 1: refuse to guess when more than one ad account or board comes
   back, and filter out non-active Meta accounts.
2. Finding 2: an `issued_at` freshness check in `verifySignedRequest`, plus one
   test with a stale value.

Finding 3 is one line per route and worth folding into the same PR. Findings 4-7
can wait.
