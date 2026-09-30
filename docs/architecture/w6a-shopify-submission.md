# W6a — bcns Connect: Shopify App Store submission pack

Everything needed to fill the listing and press Submit. The app is **bcns Connect**
(Dev Dashboard org 235106100, app 425274376193, client id `a87d4fe4…`), Partners org
5179321, **public distribution already selected**, listing in Draft, not submitted.
Code facts below cite the file they came from. Anything marked **TODO(Nate)** is not in
the repo and must not be guessed.

---

## 1. The install flow, and what this PR changed

Shopify's review installs from the admin or the listing. Shopify then opens the app URL
(`application_url = https://connect.bcn-services.com`, `apps/connect/shopify.app.toml`)
with `?shop=&hmac=&host=&timestamp=` and **no bcns session**. Shopify requires that
install starts OAuth right away and ends in a usable UI.

**Before this PR it hit a login wall.** The hub middleware matched `/`
(`apps/connect/middleware.ts:32` on main). `requireMembership` found no session, so the
browser was sent to `/login` (`packages/tenant/src/middleware.ts:88`), and the Shopify
query was dropped. OAuth never started. Both routes also needed a signed-in owner:
`/start` called `requireOwner` before anything else (`start/route.ts:33` on main), and
`/callback` required an owner of the same tenant as the state (`callback/route.ts:101-104`).
The flow only worked when the merchant started from the hub's Connect button.

**After this PR:**

1. `middleware.ts` rewrites `/` to `/api/oauth/shopify/start` when the query has
   `shop` and `hmac`. The query is passed on unchanged, so Shopify's signature still
   verifies. `api/oauth/shopify/` is removed from the auth matcher, and each route
   there checks for itself.
2. `start/route.ts`: when there is an `hmac`, it verifies Shopify's query HMAC
   (`verifyQueryHmac`) and signs a state with no tenant (`INSTALL_CLIENT_ID`). When
   there is no `hmac` (the hub's Connect button), it requires an owner, as before.
   Both paths go straight to Shopify's consent screen.
3. `callback/route.ts` keeps its checks in the same order: approval gate, query HMAC,
   state, state cookie. A state bound to a tenant still needs that tenant's owner signed
   in **before** the code is exchanged. After the exchange, the token is not written
   here. It goes into an AES-256-GCM sealed, httpOnly cookie (`shopify_pending`,
   15 min, `lib/shopify-oauth.ts` `sealPending`), and the browser is sent to `/finish`.
4. `finish/route.ts` (new) is now the only place a Shopify token is written, and the
   only place managed pricing (below) is gated. A signed-out browser goes to
   `/login?next=/api/oauth/shopify/finish`, which is the only `next` value the login
   action follows. After sign-in the route requires an **owner** and opens the cookie
   (`openPending`). A tenant-bound hand-off only binds to its own tenant. An install
   hand-off binds to the owner who signed in. For an install hand-off on the public
   app, the route first refuses a tenant already bound to a different shop
   (`api.shopify_shop_mismatch`), then checks the shop's subscription — every time,
   whether or not the tenant already has a Shopify source — see below. Once past that, it calls `api.connect_source` and sends the browser to
   `/?connected=shopify`.
5. The login page tells the merchant what is going on. It also gives someone with no
   bcns account a way forward: email bcns, then open the app again from the Shopify admin.

A shop is never linked to a tenant unless an owner is signed in. Tests are in
`apps/connect/tests/shopify-install.test.mjs`, which uses the real routes and
middleware.

Also fixed along the way: `cookies.delete("shopify_oauth_state")` never cleared the
cookie. Next sets `path=/` by default, but the cookie lives at `/api/oauth/shopify`.
The delete calls now pass that path.

**Managed-pricing follow-up (branch `shopify-managed-pricing`).** bcns Connect is
public unlisted: hub-initiated connects stay billed off-platform (Stripe, no
subscription check), but every Shopify-initiated finish on the public app (a first
install, a reinstall or an "Open app" click) needs an ACTIVE managed-pricing
subscription before anything is written (`managedPricingGate`,
`apps/connect/lib/shopify-oauth.ts:655`). **The gate lives
in `finish/route.ts`, not `callback/route.ts`.** Root cause: `middleware.ts` sends
both a first-time install AND an existing client's "Open app" click from the Shopify
admin through the same install-initiated path (no tenant in the state) — a gate at
`/callback` cannot tell those apart and would send every already-billed client to the
$200 plan page. `/finish` does not try to tell them apart either: it queries Admin
GraphQL `currentAppInstallation.activeSubscriptions` with the merchant's own fresh
token on every install-initiated finish. An existing client with an `ACTIVE`
subscription passes straight through to the write; a lapsed one lands on the plan page
like a first install. A reinstall after an uninstall depends on the billing period:
the uninstall moves the subscription to `CANCELLED`, which `activeSubscriptions`
filters out, but Shopify still treats the store as paid until the period ends and its
plan page offers nothing to approve. So on a definitive `none_active` (only then)
`/finish` asks the Partner API `activeSubscription(appId:, shopId:)` (`paidThrough`):
**inside the paid period the store reconnects; after it, the plan page.** A free trial
is not a paid period: `trialEndsAt` is ignored (#84), and the code assumes a trial has
a null `currentBillingCycle` (`shopify-oauth.ts:505-508`; the test helper at
`shopify-install.test.mjs:751` says Shopify documents this), not confirmed against a
live Partner API trial response, so a reinstall during a trial goes to the plan page. That check needs
`SHOPIFY_PARTNER_API_TOKEN`, `SHOPIFY_PARTNER_ORG_ID` and `SHOPIFY_APP_GID`
(`apps/connect/DEPLOY.md`); with any unset, or on any failure of the Partner call, it
fails closed to the plan page. A reviewer who reinstalls inside the paid period,
with the three Partner values set, therefore sees no charge screen; with any unset
they land on the plan page, which offers nothing to approve
(`shopify-oauth.ts:849-851`). Before the subscription check, a tenant
already bound to a *different* shop is refused with `?error=shop-mismatch`
(`api.shopify_shop_mismatch`, one boolean about the caller's own tenant) so it is never
offered a charge for a shop `data.attach_source` would then refuse (BCNS7, still the
authority); a failed read is the generic error page. The subscription check is retried
once on a transient failure (timeout, network error, non-2xx) because `/callback`'s new
grant has already killed an existing client's stored refresh token; no `ACTIVE` entry,
a GraphQL error, a malformed body, or a second transient failure fails closed to
Shopify's plan-selection page instead of the
RPC write, deleting both the pending and the state cookies. The plan-selection URL is
built from `storeHandleFromHost` (the store's admin handle, decoded from Shopify's
`host` query param — sealed into the pending cookie at `/callback`, since a shop's
permanent domain is not reliably its admin handle) and falls back to the shop domain
only when `host` was absent. Until the subscription is confirmed (ACTIVE, or paid
through), nothing is written: no new token, no source row. For an EXISTING client
this is not free: `/callback` has already exchanged the code, and per the comment at
`shopify-oauth.ts:789-792` that new grant killed the refresh token stored from before,
so a fresh token that is dropped "breaks a live, paying connection within the hour".
A client sent to the plan page stays in that state until they approve a plan and
reconnect (inference from that comment; not reproduced live). The bridge app (SB, `SHOPIFY_ALT_*`) is excluded and is
provably unaffected (`apps/connect/tests/shopify-install.test.mjs`). `plan_handle` on
the return trip is never trusted — only the query result is.

**Uninstall.** After the write, `/finish` subscribes that one shop to `app/uninstalled`
(`registerUninstallWebhook`, Admin GraphQL `webhookSubscriptionCreate` with the
merchant's token). It is shop-specific, not a `[[webhooks.subscriptions]]` entry in
`shopify.app.toml`: `shopify app deploy` refuses app-wide subscriptions while
`use_legacy_install_flow = true`. The webhook revokes the shop's token and disables its
schedule (`/api/webhooks/shopify/app-uninstalled` → `shopify-shop-redact` →
`api.record_app_uninstalled`); the uninstall itself deletes no rows
(`data.revoke_shopify_install`, `20260929000200_shopify_uninstall_shop_mismatch.sql`).
A failed registration only warns; the gate above does not
depend on it, and the next connect registers again. A shop connected before this shipped
has no subscription until its next connect.

**Reinstall inside a paid period.** A store that uninstalls and reinstalls before its
paid billing period ends sees no charge screen. Shopify cancels the subscription on
uninstall but keeps the store paid until the period ends, and its plan page then
has nothing to approve. With the three Partner values
set, `/finish` sees the future `currentBillingCycle.endTime` and connects the store;
the hub logs `shopify finish paid through <ISO>`. With any of them unset, or once
the period has ended, the store lands on the plan page instead. This is Shopify's
own behaviour, not a hub shortcut: observed in a live check on the dev store
bcns-data-dev on 2026-09-30 (after uninstall and reinstall, the plan page showed the
plan as "Current", "Subscription expires October 25, 2026", with no select or approve
control, and a Partner API call the same day still returned the cancelled subscription
with `currentBillingCycle` ending 2026-10-25T02:38:50Z), and consistent with Shopify
staff forum posts (community.shopify.dev/t/33979 and /t/36547: an uninstall cancels the
subscription at once and the merchant keeps access to the end of the paid cycle). Not
stated in an official Shopify doc page we have found (`managedPricingRedirect`,
`apps/connect/lib/shopify-oauth.ts:848-860`).

**Known limitation: access after period end.** Nothing ends access when a paid
period ends. The end time is only logged (`apps/connect/lib/shopify-oauth.ts:855`),
and no code revokes a store's access when the period runs out. Not built.

**Needs one live check before Submit (step 3 below).** The unit tests cover every branch
that runs without a database. The sign-in round trip and the RPC write only run on the
live hub.

---

## 2. Listing copy

**App name:** bcns Connect

**Tagline (≤ 62 chars):** See, search and export your orders, customers and products

**Short description:** bcns Connect copies your Shopify orders, customers, products,
refunds and payouts into a private workspace you own. On the Your data page you see,
search and export them, with your last 30 days of orders and revenue at the top.

**Description:**

> Small businesses end up with their numbers scattered across a store, an ad account and a
> project board. bcns Connect puts them in one place that belongs to you.
>
> Install the app, approve read access, and sign in to your bcns workspace. Within the hour
> bcns starts pulling your orders, customers, products, refunds and Shopify Payments
> payouts. After that it keeps them current every hour. The Your data page shows your orders
> and revenue for the last 30 days, and lets you see, search and export your orders,
> customers and products as tables. Refunds and payouts are there as tables too. The Sources
> page shows exactly what is connected and when it last updated.
>
> bcns Connect only reads. It never edits your products, orders or customers.
>
> **Pricing:** $200/month, no setup fee. Built for small businesses.

**Key benefits (three):**

1. **See, search and export your data.** Your orders, customers and products in searchable
   tables with a date filter and CSV export, plus 30-day order and revenue totals, refreshed
   every hour.
2. **Your data stays yours.** It lives in your own bcns workspace, which only people you
   invite can open.
3. **Read-only.** The app requests read scopes only and never changes your store.

**Wording rules for this listing.** Describe only what a reviewer can click through
today. Leave out features that are coming later. Before adding "AI tools" to the listing,
check that a reviewer can use it end to end. The hub's Access page issues logins for
software, but MCP sign-in for clients still needs OAuth (see memory
`project-mcp-needs-oauth-self-service`). If it can't be shown working, leave it out.

**Pricing model on the listing.** Merchants are existing bcns Connect customers
onboarded off-platform and billed directly; a Shopify billing plan is available for any
App Store installs. In practice: the app is **public unlisted**, hub-initiated connects
(the normal path, Stripe billing) never touch Shopify's billing at all, and a merchant
who installs straight from Shopify with no active plan is redirected to Shopify's
managed-pricing plan-selection page (`$200/mo`, `shopify-managed-pricing` branch,
§1) rather than being connected unbilled. Pick the listing-form pricing option that
matches "managed pricing" with that plan. A reinstall inside an already-paid period
reconnects without a charge screen (§1). This supersedes the earlier plan to request
off-platform billing approval under 1.2.1; the managed-pricing plan is the answer to
that requirement.

---

## 3. Scopes — every one requested, with why

From `SHOPIFY_SCOPES` (`apps/connect/lib/shopify-oauth.ts:44`), which matches
`shopify.app.toml` `[access_scopes]`. The queries are in
`platform/worker/src/connectors/shopify.ts`.

| Scope | Why the app needs it |
|---|---|
| `read_orders` | `Q_ORDERS`: order totals, status, line items and refunds, shown on the Your data page and in its last-30-days orders and revenue totals. |
| `read_all_orders` | The first sync goes back 13 months (`SHOPIFY_DEFAULTS.backfillDepth`). Without this scope Shopify only returns the last 60 days. Granted 2026-09-18. |
| `read_products` | `Q_PRODUCTS`: product titles, status, variants and prices for the product view. |
| `read_inventory` | `Q_INVENTORY` / `variants.inventoryQuantity`: the stock level shown per product on the Your data page. |
| `read_shopify_payments_accounts` | Opens the `shopifyPaymentsAccount` root field that `Q_PAYOUTS` reads. Without it the query fails with ACCESS_DENIED (2026-09-19). |
| `read_shopify_payments_payouts` | The `payouts` list under that account: payout amounts and dates. |
| `read_reports` | ShopifyQL sessions query (`sessions_day`), used only when the store's `sessions_mode` is `shopifyql`. |
| `read_customers` | The `customer{id email displayName}` field on each order, so orders can be grouped by customer. |

The app has no write scopes.

---

## 4. Protected customer data: Name and Email only

**Fields accessed:** the `customer` object on an order, reading only `id`, `email` and
`displayName` (`ORDER_FIELDS`, `platform/worker/src/connectors/shopify.ts:50`).
**Phone and address are not requested.** Whether to add them depends on Declan's
traffic answer. ShopifyQL sessions would need them, and without them the §9 checklist
sets `sessions_mode` to `none` (`platform/scripts/checklist.ts:50`). If that changes,
the protected-data request has to be amended and re-reviewed.

| Question | Answer |
|---|---|
| Why the app needs it | So the merchant can see who placed each order and how many orders each customer has made, on the merchant's own Your data page. |
| Is the data shown only to the merchant? | Yes. It is visible only to members of that merchant's bcns workspace. Database row-level security scopes every read to the signed-in member's client (`api` views). |
| Is it sold, shared or used for ads? | No. |
| Minimum data | Yes. Three fields, no phone, no address. |
| Encryption in transit | TLS on every hop: the Shopify Admin API, the hub (`https://connect.bcn-services.com`) and the hosted Supabase database. |
| Encryption at rest | The data is stored in hosted Supabase Postgres, which encrypts at rest. **TODO(Nate): confirm the provider statement you want to cite.** The access token is stored in `data.source_tokens.secret`, which is plaintext at the column level. That table has no API view, and only the worker reads it (`20260918000100_attach_source_rpc.sql`). |
| Retention | Kept while the merchant subscribes. After churn, `platform/scripts/hard-delete.ts` deletes every row once the client has been churned for 30 days, with no pre-delete archive — every copy is gone within 30 days of uninstall, per §6.2.3. A `shop/redact` has a separate 48-hour deadline; see the webhook table below for how that's met today. |
| Staff access | Only the bcns operator (Nate), through the service role on the worker and operator machine. |
| Data-protection agreement / privacy policy | See §5. |

**The three mandatory compliance webhooks.** They are registered in `shopify.app.toml`
`[webhooks.privacy_compliance]` and handled in `apps/connect/lib/shopify-webhooks.ts`.
Each one verifies the base64 `X-Shopify-Hmac-Sha256` over the raw body and returns 401 if
it doesn't match. It also rejects a stale `X-Shopify-Triggered-At`. None of them needs a
session, because `middleware.ts` excludes `api/webhooks/`.

| Topic | URL | What happens |
|---|---|---|
| `customers/data_request` | `/api/webhooks/shopify/customers-data-request` | Recorded, the operator is emailed with a 30-day deadline, 200 returned. |
| `customers/redact` | `/api/webhooks/shopify/customers-redact` | Recorded, the operator is emailed with a 30-day deadline to erase that customer's rows, 200 returned. |
| `shop/redact` | `/api/webhooks/shopify/shop-redact` | Automated (shipped): the hub forwards the HMAC-verified request to the `shopify-shop-redact` Edge Function, which re-verifies the HMAC, queues a `data.privacy_requests` row, and returns 200. The worker then deletes that client's `source = 'shopify'` rows (`platform/worker/src/privacy.ts`, `apps/connect/lib/shopify-webhooks.ts:24-35`; `docs/architecture/retention-30d-shop-redact.md`). A request still pending after 3 failed attempts or 24 hours is escalated to the operator (`privacy.ts:138-153`). If the forward fails, the operator is emailed with a 48-hour deadline and erases by hand. The worker hands a request to the operator instead of deleting for the bridge shop, an ambiguous match, or a token not confirmed dead. |

---

## 5. URLs and contacts

| Field | Value |
|---|---|
| App URL | `https://connect.bcn-services.com` |
| Redirect URL | `https://connect.bcn-services.com/api/oauth/shopify/callback` |
| Privacy policy URL | `https://bcn-services.com/privacy` — real policy live since PR #61 (merged `558087c`); **submit only after PR #62** (`legal-todos-fill`) is deployed, since until then the page still shows bracketed TODO text. |
| Terms URL (if asked) | `https://bcn-services.com/terms` — same URL pattern and same PR #61/#62 condition as the privacy row above. |
| Support email | `nseluga@bcn-services.com` is the only bcns contact in the repo (`BCNS_EMAIL`, `apps/connect/lib/request-connection.ts:18`, also `siteConfig.email`). **TODO(Nate):** use it or pick a support alias. `siteConfig` notes that a user-facing mailbox should be confirmed first. |
| Support website | **TODO(Nate)**, e.g. `https://bcn-services.com`. |

---

## 6. Reviewer instructions (paste into "Testing instructions")

> bcns Connect is not embedded. After you approve the install, the app opens at
> connect.bcn-services.com in the same tab. Use your own development or test store.
>
> 1. Install bcns Connect on your store from the listing and approve the read-only permissions.
> 2. Shopify redirects you to the bcns Connect sign-in page. Sign in with:
>    Email: `TODO(Nate): reviewer email` · Password: `TODO(Nate): reviewer password`.
>    This account owns a test workspace set up for review.
> 3. Shopify then shows the $200/month plan page. On a development store it reads "Free to
>    test". Approve the plan.
> 4. You land on connect.bcn-services.com, on Sources. A green banner reads "Shopify is
>    connected. The first pull starts within the hour." The Shopify card shows Connected and
>    your store domain. The first sync runs within the hour, so Your data fills in after that.
> 5. To test uninstall and the privacy webhooks, uninstall the app from the Shopify admin.
>    Shopify sends `app/uninstalled`, and bcns revokes the stored token and stops syncing
>    within seconds. The Sources card then shows Not connected, with an "Install bcns Connect
>    from the Shopify App Store" link. About 48 hours later Shopify sends `shop/redact`, which
>    deletes the store's data from bcns.
>
> The review account holds one Shopify store at a time. If you install on a second store while
> the first is still connected, the app refuses and asks you to uninstall from the first store.
>
> The app only reads data. It never changes products, orders or customers. For help, write to
> nseluga@bcn-services.com or see https://bcn-services.com.

**TODO(Nate): before submitting, create the reviewer account.** It needs its own client
(tenant). Never use SB or any real client. Give it one **owner** member (`platform/scripts/onboard.ts`,
`add-member.ts`). Leave the reviewer client's `app_url` empty: the hub then shows no dashboard
button, and **Your data** in the top bar is how the reviewer reaches `/data`. If `app_url` is
set, the hub shows "Open your dashboard" and a "Dashboard" top-bar link to it, and it must load.

---

## 7. Screenshots (1600×900)

Capture them from the reviewer workspace after a real sync, so the data is from the test store, not a real client.

1. **Shopify consent screen** during install, showing the eight read-only scopes.
2. **Sign-in during install:** `/login?next=/api/oauth/shopify/finish`, with the message
   "Shopify approved the connection. Sign in to your bcns workspace…".
3. **Sources after connecting:** `/?connected=shopify`, with the green banner and the
   Shopify card.
4. **Sources after the first sync:** the Shopify card with a "Last success" time and the usage line.
5. **Your data:** `/data` (reached from **Your data** in the top bar), with the 30-day orders and
   revenue numbers at the top and the Shopify orders table below. Add a second shot with a
   search or date filter applied, and note that **Export CSV** downloads the filtered rows.
6. *(Optional)* **Team:** `/team`, which shows the workspace belongs to the merchant's own people.

Don't include the Access page unless §2's AI-tools check passes.

---

## 8. Known review risks this PR does not change

- **Typing in a store domain.** When a merchant starts from the hub, the Sources page
  Shopify card asks for `your-store.myshopify.com` (`apps/connect/app/page.tsx:154`).
  Installs from Shopify never show this field, and a connected card hides it. Once the
  listing is live, replace the field with a link to the listing.
- **Opening the app from the Shopify admin runs OAuth again.** Shopify skips the
  consent screen for scopes already granted. `connect_source` updates the existing
  token row, so the token is refreshed. `/finish` also re-checks the subscription
  on every open (§1): a client with an ACTIVE subscription passes straight through,
  and one with none (and no paid period left) lands on Shopify's plan page.

---

## 9. Nate's steps

1. **Merge this PR, then deploy the hub.** Deploy the way `apps/connect/DEPLOY.md`
   describes. `shopify.app.toml` has not changed, so no new app version is needed for
   the install flow. If the compliance webhook URLs or the eighth scope are not in the
   released app version yet, run `pnpm dlx @shopify/cli app deploy --path apps/connect`
   and release that version first.
1b. **Create the managed-pricing plan in the Partner dashboard.** Under the app's
   Pricing / Managed Pricing settings, create the $200/mo plan. This is what
   `hasActiveSubscription` checks for and what the plan-selection page (§1) offers.
1c. **Deploy `shopify.app.toml` so the `handle` field takes effect.** This branch adds
   a top-level `handle = "bcns-connect"` to `shopify.app.toml` (confirmed valid against
   shopify.dev's CLI app-configuration reference), which `/finish` reads via
   `SHOPIFY_APP_HANDLE` to build the plan-selection redirect. Confirm `bcns-connect`
   matches the handle shown in the Partner dashboard, then run
   `pnpm dlx @shopify/cli app deploy --path apps/connect` and release the new version
   (same command as the compliance-webhook step above — one deploy covers both).
1d. **Set `SHOPIFY_APP_HANDLE` on the droplet and restart.** Add it to
   `/srv/connect/env` (value: the confirmed handle, e.g. `bcns-connect`), then restart
   the connect service. Unset = a Shopify-initiated install with no active subscription
   fails closed to the hub's generic error page instead of Shopify's plan page.
1e. **Set the three Partner values if reinstalls in a paid period should reconnect.**
   `SHOPIFY_PARTNER_API_TOKEN`, `SHOPIFY_PARTNER_ORG_ID` and `SHOPIFY_APP_GID` go in
   `/srv/connect/env` as a set (see `apps/connect/DEPLOY.md`). With any unset, such a
   reinstall lands on the plan page, which has nothing to approve.
2. **Fill in the TODOs above.** The privacy policy page is the one that blocks
   submission. Also: the support email, the retention statement, and the reviewer
   account (its own tenant plus one owner, with a dashboard link that loads).
3. **Test the install on bcns-data-dev yourself, signed out of the hub, through both
   entry paths.** Uninstall bcns Connect from bcns-data-dev.
   - **Shopify-initiated, with the plan active:** the uninstall above cancelled the
     plan, so this case means approving it again, or, inside the paid period with the
     Partner values set, no charge screen. Open a private window and install it
     from the Partners "Test your app" link (or the dev store's app listing). The
     order is fixed, because the subscription check runs at `/finish`, after sign-in
     (`shopify-oauth.ts:848-867`):
     - Outside a paid period: consent screen, then the bcns sign-in page with the
       Shopify message (sign in as the reviewer owner), then Shopify's plan page;
       approve the $200/mo plan from step 1b, then reopen the app through the
       in-admin app link (last bullet below), which reruns OAuth; you land on
       `/?connected=shopify`.
     - Inside a paid period, with `SHOPIFY_PARTNER_API_TOKEN`, `SHOPIFY_PARTNER_ORG_ID`
       and `SHOPIFY_APP_GID` all set (`:848-860`): consent screen, sign-in, then
       `/?connected=shopify` with no approval step. With any of the three unset, this
       is the outside-a-paid-period path and ends on a plan page with nothing to approve.
   - **Shopify-initiated, with no plan active:** cancel/decline the dev store's
     subscription first, then repeat the install. You should land on Shopify's own
     plan-selection page (`admin.shopify.com/store/.../charges/bcns-connect/pricing_plans`),
     never on the bcns sign-in page or `/?connected=shopify`. This holds only outside a
     paid period: inside one, with the Partner values set, the install connects
     instead (see "Reinstall inside a paid period", §1).
   - **Hub-initiated (unaffected path):** from the hub's own Connect button (signed in
     as the reviewer owner), connect the same store. This never touches Shopify's
     billing at all and should behave exactly as before this branch.
   - **Existing client "Open app" from the Shopify admin:** with the dev store already
     connected (from the case above) and its plan ACTIVE, click the app from the
     Shopify admin (not a fresh install). You should land in the hub connected, never
     on Shopify's plan page — this is the case a gate at `/callback` would have
     gotten wrong. With the plan cancelled and no paid period left, the same click
     lands on the plan page, by design.
   - **A new dev-store install with the plan cancelled:** uninstall, cancel/decline the
     subscription, then install fresh. You should land on the bcns sign-in page first,
     and only after signing in does it redirect to Shopify's plan-selection page. On a
     store still inside a paid period, with the three Partner values set, the install
     connects instead of reaching the plan page (see "Reinstall inside a paid period", §1).
   - **After approving the plan, Shopify's return must reopen the app through the
     in-admin app link (signed query), not `application_url` directly** — a bare
     `application_url` return has no `hmac`, hits the login wall, and never reaches
     `/finish`. Confirm the welcome/return link used is the in-admin app home, not a
     raw `application_url`.
   In the hub logs, look for `shopify finish rejected` or `shopify callback rejected`.
   If either line appears where you didn't expect it, stop and don't submit.
4. **Register as an App Store publisher.** In Partners (org 5179321), go to Settings.
   Complete the publisher / business profile form (legal name, address, contact
   email, payout and tax details if asked).
5. **Fill the listing.** Go to Partners, then Apps, then bcns Connect, then Distribution,
   then Manage submission, then App listing. Paste §2 (name, tagline, description,
   benefits) and set pricing. Add the URLs from §5 and the testing instructions from
   §6, with the real reviewer credentials.
6. **Protected customer data.** Open API access, then Protected customer data. Select
   **Name** and **Email** only and answer using §4. Don't select Phone or Address.
7. **Screenshots.** Upload the §7 set at 1600×900 and add the app icon.
8. **Run Shopify's pre-submission checks** on the submission page and fix anything red.
9. **Press Submit.** Then update the W6a slot in `chunk5-windows.md` with the
   submission date.
