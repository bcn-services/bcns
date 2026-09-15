# CLIENT.md — SB

**Display name:** SB (store: SaunaBoy) · **Contact:** Declan, Founder
**Project:** Command Center · **Quote:** `~/os/clients/sb/quote/2026-08-26-sb.md`
($750 setup / $100 mo, **signed** per Nate 2026-09-12; the os copy isn't updated)

## Brief

SB is a Shopify retailer. It wants one Command Center over its Shopify, Meta
Ads, Monday.com and Google Meet data. It is a read-only reporting and reference
layer; it never writes back to those systems.

- **Overview:** six headline metrics (revenue, orders, conversion rate, ROAS,
  AOV, inventory), each with a trend line and a change against the previous
  period. A date range drives the whole page. It also has a recent activity
  feed and a Content Library preview.
- **Connected systems:** a Shopify panel, and a Meta Ads panel with a
  per-campaign ROAS breakdown and a Top Performing Creative callout. Also a
  Monday.com board, Google Meet / Note AI meeting notes, and a Daily Financial
  Report (Shopify revenue, orders and AOV only; no QuickBooks). An integrations
  page shows each connection's live status.
- **Content Library and Creative Folder:** upload, tag, search, creative sets,
  bulk tagging, and full-quality download.
- **No AI in v1** (agreed with Declan 2026-09-15): the Daily Financial Report
  is script-generated (`lib/daily-report.ts`, computed on every page load).
  There's no AI summary and no chat assistant. A daily briefing of tasks to do
  comes in the next version.

## Layout and visual (decided 2026-09-12, not built yet)

- **No sidebar or tab bar.** The home view (Overview) is the one page. Remove
  `.app-nav` from `app/layout.tsx`.
- **Service buttons link out.** "View Shopify Dashboard", "View Ads Manager",
  "Open Monday.com", "Join Meeting" and the like open that service's own site.
  The dashboard doesn't rebuild those services' pages.
- **Only these live in the dashboard:** the combined data on the home view, the
  Content Library (with the Creative Folder), and the Financial Information
  page. You reach each one by its header button or by clicking its panel on
  home, not through a nav (amended 2026-09-13).
- **No agent, no AI.** The reference's "Ask the Command Center anything" strip
  and its quick actions are out; the AI Agent is scoped as a separate product.
  The Daily Briefing panel comes off the v1 home too (amended 2026-09-15; the
  code stays in the repo, off, for the next version).
- **Financial Information** combines the financial figures from every connected
  app: Shopify revenue, orders and AOV, and Meta ad spend. Its page may also
  let SB enter figures those apps don't track, stored as dashboard records
  through `save_record` (no new migration). That goes beyond the quote, which
  scopes the report to Shopify only.
- **Settings and Integrations** are icon buttons in the header, each opening a
  popup. Integrations shows each connection's status. This replaces the
  `/integrations` page.
- **Visual target:** the Claude Design artboard committed at
  `design/Saunaboy Command Center.dc.html`, digested with the functional spec
  in **`DESIGN.md`** (the build contract; it wins over this section).
  `~/os/clients/sb/SB_Reference.PNG` is fallback only. Style each new page to
  this target as it's built, not in a pass at the end.

## Config decisions

| Decision | Choice | Where it lands |
| --- | --- | --- |
| Data source | **shared** (bcns-data platform, client `sb`) | Repo var `DATA_SOURCE=shared` (set). `supabase/` deleted. Data is read only through `lib/data.ts`. At deploy, `/srv/sb/env` holds the platform URL and anon key, plus `HEALTH_EMAIL`/`HEALTH_PASSWORD` = `smoke+sb@bcn-services.com` (keychain `bcns-smoke-sb`). |
| Shape | **app only in v1** (decided 2026-09-15): no agent loop, no agent user, nothing on a timer. The Daily Financial Report is computed on each page load. `agent/` and `scripts/briefing.ts` stay in the repo, unused. | No `AGENT_*` in `/srv/sb/env` |
| AI feature | **off in v1** (agreed with Declan 2026-09-15). The next version's task briefing would turn it on: BYOK, capped at a monthly ceiling SB approves. | `AI_ENABLED` unset and no `ANTHROPIC_API_KEY` in `/srv/sb/env` |
| Storage backend | **platform media RPCs** (data-client `media.*`) | `lib/storage.ts` stays `null` (note added) |
| Webhook providers | **none**: the platform worker pulls every source | No `app/api/` provider routes |

## Open questions (blocked, not assumed)

- **Shopify connection method:** an OAuth app install (callback) or
  client-credentials token refresh in the connector. Legacy `shpat_` custom
  apps can't be created anymore, and SaunaBoy isn't in the bcns org.
- **The add-source script:** bcns-data `onboard` can't re-run, so adding a
  source to `sb` needs a new script.
- **Declan's inputs:** Meta partner access + act_id, Monday access and boards,
  a Meet notes sample, the Drive folder to index, confirmation of the live
  Shopify store, brand assets, and the team login list.
- **Infra:** droplet `/srv/sb/env`, repo var `CLIENT_SLUG`, DNS, UptimeRobot
  (see `DEPLOY.md`).
