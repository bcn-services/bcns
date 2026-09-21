# Chunk 5 — dashboard click-paths

Companion to `docs/architecture/platform-v1.md` §5 and `chunk5-windows.md` W1. One
section per platform: where the client id/secret live, where to register the
redirect URL, where scopes get set. Redirect URLs are all
`https://connect.bcn-services.com/api/oauth/<source>/callback`.

Client ids are public — paste into a Claude session (W2/W4). Client secrets are
not — put them straight into GitHub secrets and the hub's env yourself; never paste
one into a Claude session.

Dashboards change their labels over time; if a menu name below doesn't match what
you see, the surrounding steps (Basic Settings, OAuth/Redirect config, App Review)
are the stable landmarks to search from.

---

## Scope table (from W0's code read)

| Source | Scope(s) to request | Why |
|---|---|---|
| Shopify | `read_orders`, `read_all_orders`, `read_products`, `read_inventory`, `read_shopify_payments_payouts`, `read_reports`, `read_customers` | See breakdown below. **Keep all 7 for submission.** Whether `read_inventory` is needed for `inventoryQuantity` is unsettled — see the note under the breakdown. |
| Meta | `ads_read` | Only scope the connector calls anything under. |
| Monday | `boards:read`, `me:read` | `boards:read` for the board/item pull, `me:read` for the token-health probe (`{ me { id } }` in `tokens.ts`). |

### Shopify — endpoint/field → scope

| Called from | Field/endpoint | Scope |
|---|---|---|
| `shopify.ts` `Q_ORDERS` | `orders(...)`, `totalPriceSet`, `lineItems`, `refunds`, `displayFinancialStatus/FulfillmentStatus` | `read_orders` |
| `shopify.ts` `backfill()` (13-month depth) | orders older than 60 days | `read_all_orders` |
| `shopify.ts` `Q_ORDERS` / `normalize()` | `Order.customer{id email displayName}` → `customers` table | `read_customers` |
| `shopify.ts` `Q_PRODUCTS`, `Q_INVENTORY` | `products(...)`, `ProductVariant{sku,title,price,inventoryQuantity}`, `featuredMedia` | `read_products`, and possibly also `read_inventory` — unsettled, see below |
| `shopify.ts` `Q_PAYOUTS` | `shopifyPaymentsAccount.payouts` | `read_shopify_payments_payouts` |
| `shopify-url.ts` `Q_SHOPIFYQL` | `shopifyqlQuery(FROM sessions ...)` | `read_reports` (confirmed in `DESIGN.md` §4.2; also needs Protected Customer Data Level 2, all four fields) |
| `shopify.ts` `shopMeta()`, `tokens.ts` probe | `shop{currencyCode ianaTimezone}`, `shop{id}` | none — base `Shop` object fields need no scope |

**Action for W1: keep all 7 scopes. Do not drop `read_inventory` yet.**

The `ProductVariant` object page states a page-level `read_products` requirement and
says nothing field-specific about `inventoryQuantity`. That is not the same as
confirming the field is populated without `read_inventory`: `inventoryQuantity`
aggregates inventory levels, `InventoryLevel` is gated on `read_inventory`, and
Shopify's own community threads report the field coming back null without it.

The failure mode is silent, which is what decides it. `shopify.ts` reads
`Number(v.inventoryQuantity ?? 0)`, so a null from a missing scope becomes a zero,
and the `inventory_units` daily metric would report zero stock forever without ever
erroring. Nobody would notice until a client asked why their inventory chart is flat.

The asymmetry also favours keeping it: dropping a scope later is trivial, while
re-adding one after approval means a new app version and merchant re-consent.

**Settle it empirically in W3**, which already installs on a real dev store: install
once with `read_inventory` and once without, and compare `inventoryQuantity` in the
response. That is definitive in ten minutes and replaces the doc-reading argument.

If W3 proves it unnecessary, dropping it also requires editing `SHOPIFY_SCOPES` in
`platform/scripts/checklist.ts:12`, which hardcodes all 7.

### Meta — endpoint → scope

| Called from | Endpoint | Scope |
|---|---|---|
| `meta.ts` `accountMeta()` | `act_<id>?fields=timezone_name,currency` | `ads_read` |
| `meta.ts` `listEntity()` | `act_<id>/campaigns`, `act_<id>/ads` | `ads_read` |
| `meta.ts` `insightsIncremental()`/`backfill()` | `act_<id>/insights` (sync + async `report_run_id` poll) | `ads_read` |
| `meta.ts` `adImages()` | `act_<id>/adimages` + direct image URL download | `ads_read` |
| `tokens.ts` probe | `/me?fields=id` | none — basic token identity check |

Nothing else is called. No `ads_management`, no `business_management` — matches
what `platform-v1.md` §5 and `REQUIREMENTS.md` already name.

### Monday — endpoint → scope

| Called from | Endpoint | Scope |
|---|---|---|
| `monday.ts` `pull()` | `boards(ids){columns groups items_page{items{column_values}}}` | `boards:read` |
| `tokens.ts` probe | `{ me { id } }` | `me:read` |

No write scope anywhere — the connector never mutates a board.

---

## (a) Shopify — Partner app, unlisted distribution

**Historical, superseded 2026-09-21.** These are the steps that created bcns Connect
(app 425274376193). Two things below are wrong today: public distribution is
selected, not custom, and custom apps need no protected-data review. The current
steps are in `chunk5-windows.md` §W6a.

1. **partners.shopify.com** → sign in as bcns (or create the Partner organization
   for bcn-services.com if it doesn't exist yet).
2. Left nav **Apps** → **Create app** → **Create app manually** (not the CLI path —
   this is an OAuth/webhook app with no embedded UI).
3. Name it (e.g. "bcns Connect"). Initial App URL: `https://connect.bcn-services.com`.
4. **Configuration** tab:
   - **Allowed redirection URL(s)** → add
     `https://connect.bcn-services.com/api/oauth/shopify/callback`.
   - **Admin API access scopes** → check all seven scopes from the table above,
     including `read_inventory` (see the note above — it is not yet proven unused).
5. **App setup** → **Client credentials**: this is where **Client ID** (public) and
   **Client secret** (click "Show" first) appear. Client ID → paste into the W2
   Claude session. Client secret → GitHub secrets + hub env directly, never into
   Claude.
6. **Distribution**: set to **Custom distribution** — this is what "unlisted" means
   here: bcns generates one install link, any client's store owner with
   app-install permission uses it, and it never appears on the Shopify App Store.
   Custom-distribution apps still go through Shopify's scope/protected-data review
   because the app installs on merchants outside bcns's own store.
7. Because `read_customers` is requested, also file for **Protected Customer Data**
   access: **App setup** → **API access request** (or **Protected customer data**
   section) → describe the use case (order attribution to a customer record) and
   submit. This can run in parallel with the main app submission.
8. Don't hit **Submit for review** yet — that's W6, after W2/W3 prove the flow
   against a real dev store.

## (b) Meta — app with Facebook Login for Business

1. **developers.facebook.com** → **My Apps** → **Create App**.
2. Use case: choose **Other**, then app type **Business** (required to get
   Facebook Login for Business, a system-user-style token, and `ads_read`).
3. During creation, associate the app with bcns's **Business Portfolio** (Business
   Manager) for bcn-services.com. Create that Business Portfolio first if it
   doesn't exist — Settings → Business Settings on business.facebook.com.
4. In the new app's dashboard → **Add Product** → **Facebook Login for Business**
   → set up.
5. **Facebook Login for Business** → **Settings** → **Client OAuth Settings** →
   **Valid OAuth Redirect URIs** → add
   `https://connect.bcn-services.com/api/oauth/meta/callback`.
6. **App Settings → Basic**: this is where **App ID** (public) and **App Secret**
   (click "Show", re-enter your Meta password) appear. App ID → W4 session. App
   Secret → GitHub secrets + hub env directly.
7. Same **App Settings → Basic** page: **Data Deletion Instructions URL** (Meta's
   name for the data-deletion callback platform-v1.md §5 requires) → set to the
   worker's deletion callback endpoint once it exists (W2/W4 build it; register the
   URL here once it's live).
8. **App Review → Permissions and Features** → find `ads_read` → **Request
   Advanced Access**. You'll need to attach a short screen recording showing the
   permission's real use (pulling this client's ad account data into the hub).
9. **Business verification**: business.facebook.com → **Security Center** →
   **Start Verification** — document upload, runs 1–3 weeks in the background.
   Meta's `ads_read` review needs this done or in progress, so start it first (see
   `chunk5-windows.md` W1 step 1).
10. Submit for review at W6, once business verification and the flow are both
    ready.

## (c) Monday — OAuth app

1. **developer.monday.com** (or the "Developers" link from your monday.com avatar
   menu) → sign in with the bcns monday.com account.
2. **Build apps** → **Create app**.
3. Name it, then open the app's **Features** tab → **+ Feature** → **OAuth** (this
   is what makes it an installable OAuth app rather than a personal API token).
4. On the **OAuth** feature's config page:
   - **Redirect URI(s)** → add
     `https://connect.bcn-services.com/api/oauth/monday/callback`.
   - **Scopes** → check `boards:read` and `me:read`. Nothing else.
5. **App Credentials** (same page or an adjacent "Credentials"/"Basic" tab): this
   is where **Client ID** and **Client Secret** appear. Client ID → W4 session.
   Client Secret → GitHub secrets + hub env directly.
6. Because this app is used by bcns to connect client boards — not published to
   the monday.com marketplace — there's no marketplace listing review to wait on.
   The "review" in platform-v1.md §5 is monday's lightweight check on the OAuth
   app itself before non-draft installs are allowed; submit that from the app's
   **Distribution**/**Listing** tab when W6 runs. If your dashboard instead lets
   generate an install link straight from a draft app, that's the light-review
   path — no marketplace submission needed.
