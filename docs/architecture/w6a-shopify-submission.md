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
   app, the route then reads whether this tenant already has a Shopify source
   (`connector_health_v1`) before deciding whether the managed-pricing gate applies —
   see below. Once past that, it calls `api.connect_source` and sends the browser to
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
subscription check), but a Shopify-initiated install with no tenant yet needs an
ACTIVE managed-pricing subscription before the shop is bound to one. **The gate lives
in `finish/route.ts`, not `callback/route.ts`.** Root cause: `middleware.ts` sends
both a first-time install AND an existing client's "Open app" click from the Shopify
admin through the same install-initiated path (no tenant in the state) — a gate at
`/callback` cannot tell those apart and would send every already-billed client to the
$200 plan page. `/finish` can: signed in with a real tenant, it first reads whether
this tenant already has a Shopify source (`connector_health_v1`); if one exists, this
is an existing client re-binding and the gate is skipped entirely (behaves exactly as
before this branch). Only when there is none does it query Admin GraphQL
`currentAppInstallation.activeSubscriptions` with the merchant's own fresh token; no
`ACTIVE` entry (or any error/timeout, ~5s time-box, or a DB error reading
`connector_health_v1`) fails closed to Shopify's plan-selection page instead of the
RPC write, deleting both the pending and the state cookies. The plan-selection URL is
built from `storeHandleFromHost` (the store's admin handle, decoded from Shopify's
`host` query param — sealed into the pending cookie at `/callback`, since a shop's
permanent domain is not reliably its admin handle) and falls back to the shop domain
only when `host` was absent. The bridge app (SB, `SHOPIFY_ALT_*`) is excluded and is
provably unaffected (`apps/connect/tests/shopify-install.test.mjs`). `plan_handle` on
the return trip is never trusted — only the query result is.

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
matches "managed pricing" with that plan. This supersedes the earlier plan to request
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
| `shop/redact` | `/api/webhooks/shopify/shop-redact` | Recorded, the operator is emailed with a 48-hour deadline to erase the shop's data, 200 returned. Deletion is manual within that 48 hours — automating it needs a way to bind the request to a real shop that a caller without the webhook's HMAC secret can't forge; see `docs/architecture/retention-30d-shop-redact.md` for why the smallest automatic path doesn't clear that bar yet. |

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
> connect.bcn-services.com in the same tab.
>
> 1. Install bcns Connect on the development store **bcns-data-dev.myshopify.com** (or your own
>    test store) from the listing and approve the read-only permissions.
> 2. Shopify redirects you to bcns. When it asks you to sign in, use:
>    Email: `TODO(Nate): reviewer email` · Password: `TODO(Nate): reviewer password`.
>    This account owns a test workspace set up for review.
> 3. After sign-in you land on **Sources**. A green banner reads "shopify is connected. The first
>    pull starts within the hour." The Shopify card lists the store as a source.
> 4. Within the hour the Shopify card shows a "Last success" time. Click **Your data** in the
>    top bar to see that store's orders, customers and products. It has
>    search, a date filter and CSV export, and the top of the page shows the last 30 days of
>    orders and revenue.
> 5. To test the privacy webhooks, uninstall the app from the store admin. `shop/redact` is
>    acknowledged with HTTP 200.
>
> The app only reads data. It never changes products, orders or customers.

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
  token row, so the only effect is a fresh token.

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
   shopify.dev's CLI app-configuration reference), which the callback route reads via
   `SHOPIFY_APP_HANDLE` to build the plan-selection redirect. Confirm `bcns-connect`
   matches the handle shown in the Partner dashboard, then run
   `pnpm dlx @shopify/cli app deploy --path apps/connect` and release the new version
   (same command as the compliance-webhook step above — one deploy covers both).
1d. **Set `SHOPIFY_APP_HANDLE` on the droplet and restart.** Add it to
   `/srv/connect/env` (value: the confirmed handle, e.g. `bcns-connect`), then restart
   the connect service. Unset = a Shopify-initiated install with no active subscription
   fails closed to the hub's generic error page instead of Shopify's plan page.
2. **Fill in the TODOs above.** The privacy policy page is the one that blocks
   submission. Also: the support email, the retention statement, and the reviewer
   account (its own tenant plus one owner, with a dashboard link that loads).
3. **Test the install on bcns-data-dev yourself, signed out of the hub, through both
   entry paths.** Uninstall bcns Connect from bcns-data-dev.
   - **Shopify-initiated, with the plan active:** open a private window and install it
     from the Partners "Test your app" link (or the dev store's app listing). You
     should see the consent screen, then — since the dev store should have the $200/mo
     plan active from step 1b — the bcns sign-in page with the Shopify message. Sign in
     as the reviewer owner. You should land on `/?connected=shopify`.
   - **Shopify-initiated, with no plan active:** cancel/decline the dev store's
     subscription first, then repeat the install. You should land on Shopify's own
     plan-selection page (`admin.shopify.com/store/.../charges/bcns-connect/pricing_plans`),
     never on the bcns sign-in page or `/?connected=shopify`.
   - **Hub-initiated (unaffected path):** from the hub's own Connect button (signed in
     as the reviewer owner), connect the same store. This never touches Shopify's
     billing at all and should behave exactly as before this branch.
   - **Existing client "Open app" from the Shopify admin:** with the dev store already
     connected (from the case above) and its plan cancelled, click the app from the
     Shopify admin (not a fresh install). You should land in the hub connected, never
     on Shopify's plan page — this is the case a gate at `/callback` would have
     gotten wrong.
   - **A new dev-store install with the plan cancelled:** uninstall, cancel/decline the
     subscription, then install fresh. You should land on the bcns sign-in page first,
     and only after signing in does it redirect to Shopify's plan-selection page.
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
