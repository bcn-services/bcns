# DESIGN.md — SB Command Center build spec

The contract every page, panel and PR is built and checked against. CLIENT.md
is the business brief; this file is the build-level spec. When the two
disagree, this file wins and the disagreement gets reported, not reinterpreted.

## Source

Claude Design project (visual source of truth; wins over
`~/os/clients/sb/SB_Reference.PNG` and over prose here on any visual question):

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6968fc6c-e8d6-46e8-978c-350b212979f9?file=Saunaboy+Command+Center.dc.html

Focus on these files (the whole project is readable):
- `Saunaboy Command Center.dc.html`

Also read these files the selection imports:
- `support.js`

Implement: `Saunaboy Command Center.dc.html`
```

Local copies: `design/Saunaboy Command Center.dc.html` (the artboard: one
home page at desktop width, inline styles, sample data) and
`design/support.js` (the Claude Design canvas runtime the file loads; not
product code). Pulled via DesignSync 2026-09-13; re-pull to refresh, never
hand-edit. Open the `.dc.html` in a browser to see the target.

The design has **one artboard: home**. `/financials` and `/library` have no
artboard; build them from the same tokens and panel anatomy. Header page
buttons are Nate's amendment (2026-09-13), not in the artboard.

## Visual

Read `design/Saunaboy Command Center.dc.html` for exact values; this is the
digest.

**Tokens** (put in `app/globals.css` as CSS variables):

| Role | Value |
| --- | --- |
| page bg | `#f4f4f5` |
| panel bg | `#fff` |
| panel border | `#e8e8ea`; controls `#e4e4e7`; note cards `#eeeef0` |
| hairline (row dividers) | `#f1f1f3` (rows), `#f4f4f5` (lists) |
| text | `#18181b`; secondary `#3f3f46`; body `#27272a`; muted `#52525b`; faint `#71717a`; placeholder `#a1a1aa` |
| accent (links, "View All", icons) | `#e4638a`, hover `#c94d73` |
| accent button | bg `#f9c3d4`, hover `#f6aec5`, text `#18181b` |
| accent soft (icon tiles, segmented bg) | `#fde8ef`, `#fbe7ee`; hover chrome `#fdf2f6` / border `#f4bfd2`; task ring `#f3a9c0` |
| sparkline | `#f0879f` |
| up / down | `#16a34a` / `#dc2626` |
| status badges | In Progress `#a16207` on `#fef3c7`; Done `#15803d` on `#dcfce7`; To Do `#3f3f46` on `#f1f1f3` |
| brand tiles | Shopify `#5a9e45` on `#e8f6ea`; Meta `#1877f2` on `#e8f0fd`; Meet `#4285f4`/`#34a853` on `#eaf2fd`; Monday dots `#f2545b #ffcb00 #00c875` on `#fff3ea` |
| font | `Inter Tight` 400/500/600/700 (load via `next/font/google`, fallback `system-ui, sans-serif`), antialiased |
| radii | panel/card 11px; controls/buttons 9px; icon tile, badges, inner 8px; small 6–7px |
| shadows | none (borders only) |
| page padding | `22px 26px 34px`; header margin-bottom 18px; grid gaps 14px (metric row) / 16px (panels) |

**Type scale**: page title 23px/700/-0.02em; tagline 12.5px `#71717a`;
metric value 22px/700/-0.02em; metric label 12.5px/600 `#3f3f46`; panel title
17px/700/-0.01em (16.5px in the bottom row); row label 13px `#3f3f46`; row
value 13.5px/700; delta 12–12.5px/600 with `↑`/`↓`; list subtitle 14px/700;
"View All →" 12px/600 accent; button 13.5px/600; small button 12.5px/600;
meta text 11–11.5px `#a1a1aa`.

**Header**: left = title + tagline "Data. Creativity. Wellness. Growth.".
Right = a 10px-gap row: page buttons (amendment), Integrations icon button,
Settings icon button, date-range pill. Icon buttons 38×38, white, 1px
`#e4e4e7`, radius 9, 17px stroked icon `#3f3f46` 1.7; hover bg `#fdf2f6`
border `#f4bfd2`. Page buttons use the same chrome at 38px tall with a 13.5/600
label; the current page's button is filled `#fde8ef` with border `#f4bfd2`.
Date pill: white, 1px `#e4e4e7`, radius 9, padding 9px 14px, min-width 250px,
pink calendar icon + "May 26 – Jun 1, 2025" 13.5/500 + grey chevron.

**Metric tile**: white card radius 11 padding `14px 16px 12px`; label; value
row (value left, delta right, baseline aligned); sparkline `<svg viewBox="0 0
200 34">` 30px tall, polyline stroke `#f0879f` 1.8.

**Panel**: white card radius 11 padding `16px 18px 18px`. Header row (margin-
bottom 14px): 30px rounded brand tile + title; optional right control. Rows:
3-col grid `1fr auto 74px` (Meta `66px`), padding 9px 0 (Financial 11px 0),
divider `#f1f1f3` except last. Full-width accent button margin-top 12–14px,
padding 11px, label ends with two spaces and `→`.

**Grid**: metric row `repeat(6, 1fr)`; row 2 `1fr 1.18fr 1.02fr` (Shopify /
Meta Ads / Financial Information), align start; row 3 `1.18fr 1fr 1.06fr
1.16fr` (Meet / Monday / Content Library / Recent Activity), align stretch,
panels flex-column so buttons sit at the bottom. Below ~1100px stack row 2 to
2 columns and row 3 to 2 columns; below 720px one column and metric row 2
columns.

**Deviations from the artboard (decided, don't re-argue)**:
- Per-panel period controls (Shopify Day/Week, Meta "Last 7 days", Financial
  "This Month") are omitted; the header date range drives every panel.
- Home Financial panel rows are Revenue / Ad Spend / Expenses / Profit
  (artboard shows Revenue / Expenses / Profit / Cash Flow; there is no cash-
  flow source).
- "View All →": Content Library → `/library`; Meet and Monday → the service's
  site (no in-dashboard page); Recent Activity has none.
- Note cards' `···` menu is omitted.

## Global rules

- Next.js 14 App Router, server components by default; client components only
  where a browser interaction needs them (selection, popups if `<details>`
  can't do it). As of platform-v1 §4b /library has no client component at all.
- Data only through `lib/data.ts` (`api.*_v1` views, RPCs) as the signed-in
  user. No env reads outside `lib/env.ts`. Nothing at build time. No
  service-role key. No new dependencies without asking.
- Styling: `app/globals.css` tokens + classes. No Tailwind, no
  `@bcn-services/ui`. Icons inline SVG copied from the artboard.
- Page logic lives in `lib/<page>.ts` (pure functions) so `tests/*.test.mjs`
  stays unit-only.
- Money is cents (integer) in data, formatted at render (`$142,540`,
  `$114.20`). Dates are `YYYY-MM-DD` in the client's timezone
  (`client_v1.timezone`).
- Every panel has three states: **not connected** (no `connector_health_v1`
  row for its source → "Not connected yet" + a link that opens the
  Integrations popup), **connected, empty in range** ("No data for this
  range"), **data**. Metric tiles show `—` and no delta when empty.
- Links to services open in a new tab. Targets live in `lib/links.ts`
  (constants; generic landing pages until SB's store handle / act_id /
  Monday slug are known).
- No sidebar, no tab bar, no "Ask the Command Center" bar, no agent strip, no
  quick actions.

## Header (every page)

- Title "Saunaboy Command Center" (links to `/`) + tagline.
- **Date range control**: URL `?from=YYYY-MM-DD&to=YYYY-MM-DD`; default last
  7 days; presets 7d / 30d / this month + custom from/to inside the pill's
  popup; max span 366 days (`lib/overview.ts parseRange`). Pill label shows
  the range like the artboard ("May 26 – Jun 1, 2025"). Every range-bound
  number on the page follows it. Deltas compare against the previous period
  of equal length; the range carries across page links.
- **Page buttons**: "Financial Information" → `/financials`; "Content
  Library" → `/library`. Current page's button shows the active state.
- **Integrations** icon button → popup: one row per expected source
  (shopify, meta, monday, meet, drive) from `connector_health_v1`: status
  badge (`ok | stale | auth_failed | error | never_ran`, or "Not connected"
  when no row), last success, last error. Replaces the old `/integrations`
  route (deleted).
- **Settings** icon button → popup: signed-in email, client name + timezone
  (`client_v1`), sign out.

## Home `/`

Grid per design: metric row → daily row (Daily Financial Report; the Daily
Briefing joins it in the next version) → Shopify /
Meta Ads / Financial Information → Google Meet / Monday.com / Content Library
/ Recent Activity. The daily row is not in the artboard (chunk 4).

- **Metric row (6 tiles)**: Total Revenue, Orders, Conversion Rate, ROAS, AOV,
  Inventory. Each: value, delta vs previous period, sparkline of the daily
  series across the range. Source: `daily_summary_v1` via `lib/overview.ts`.
- **Shopify panel**: rows Total Revenue, Orders, AOV, Conversion Rate,
  Inventory with deltas (same source). Button "View Shopify Dashboard  →".
- **Meta Ads panel**: two columns. Left rows Spend, ROAS, CPC, CPP,
  Impressions with deltas (`campaign_daily_v1`). Right "Top Performing
  Creative": thumb, ROAS, Spend for the best-ROAS creative in range
  (`creative_daily_v1`); placeholder tile when none. Button "View Ads
  Manager  →".
- **Financial Information panel**: rows Revenue (Shopify), Ad Spend (Meta),
  Expenses (manual), Profit (see `/financials`), each with delta where the
  source has a previous period. Button "Open Financials  →" → `/financials`.
- **Google Meet / Note AI panel**: header has a small accent "Join Meeting"
  button (links out). Subheader "Recent Meeting Notes" + "View All →" (links
  out). Three note cards: title, date, one-line excerpt of `body`, each
  linking to its `url` when present. Source `messages_v1` where
  `kind='meeting_note'`, newest `occurred_at` first.
- **Monday.com panel**: subheader "Priority Tasks" + "View All →" (links
  out). Five rows: ring, title, status badge; not-done first, then by
  `due_on`. Source `jobs_v1` where `kind='task'`. Badge text = `status`;
  colour by `is_done` (Done) / status containing "progress" (In Progress) /
  else (To Do). Button "Open Monday.com  →".
- **Content Library panel**: header "View All →" → `/library`. 3×2 tiles:
  sets (`media_sets_v1`: cover thumb, name, "N Files") first, then latest
  media (`media_v1`) if fewer than 6 sets.
- **Recent Activity panel**: latest 5 rows of `activity_v1`: source tile,
  text, relative time ("2m ago").

### Daily Briefing

**Not in v1** (no AI, agreed with Declan 2026-09-15): the panel comes off the
v1 home and the Daily Financial Report has the daily row to itself. The spec
below is kept for the next version, a daily briefing of tasks to do.

- **Placement**: first (wider) column of the daily row (`.grid-daily`), left
  of the Daily Financial Report; the row stacks to one column at ≤1100px.
  Header: note tile, "Daily Briefing", right "Yesterday · Sep 13, 2026".
- **What it shows**: the stored `briefing` record for yesterday
  (`external_id` `briefing:<day>`), plain text, then "Generated 2h ago". It
  renders whenever the record exists, **including with AI off**.
- **Where it comes from**: `pnpm briefing`, the droplet cron at 06:00
  client-local (DEPLOY.md), or the button. One Messages call (no tools) on
  the app-core default model over a JSON payload of yesterday's Daily
  Financial Report figures plus `campaign_daily_v1`, `jobs_v1`,
  `messages_v1` and `activity_v1` rows, with fields picked by name (titles,
  statuses, numbers; no ids, owners, participants, bodies, detail or URLs).
  Logic in `lib/briefing.ts`. No email.
- **Empty state**: "No briefing for yesterday yet." above the button.
- **AI-off state**: when AI is off, the key is missing, `AI_MONTHLY_BUDGET_USD`
  is unset, or this month's spend has reached it, the button is replaced by
  one line saying why and pointing at the Daily Financial Report. A stored
  briefing still shows.
- **On-demand button**: "Generate Briefing  →" ("Regenerate" once one
  exists), a server action run as the signed-in user. At most one per 15
  minutes, measured from the latest `briefing_run`. The result comes back as
  one accent line under the header (updated / try later / budget used up).
- **Cost**: every call saves one `briefing_run` record, first as a
  worst-case reservation (before the call, so no call goes unrecorded), then
  overwritten with tokens in/out and USD. This month's spend = the sum of
  this month's (client-local) runs; if spend plus the worst case would reach
  the cap, no call is made.

### Daily Financial Report

- **Placement**: the daily row (`.grid-daily`), right of the Daily Briefing,
  between the metric row and Shopify / Meta / Financial.
- **Always yesterday** in the client's timezone (`client_v1.timezone`); the
  header date range does not move it. Header right shows "Yesterday · Sep 13,
  2026".
- **Figures**: Revenue, Orders, AOV (`daily_summary_v1`), Ad Spend
  (`campaign_daily_v1`), Manual Income, Manual Expenses (`records_v1`
  `financial_entry`), Profit (same identity as `/financials`). A source with
  no row for the day shows `—`, never `$0`. No deltas.
- **Computed live** on every render (`lib/daily-report.ts`), not persisted.
  `pnpm briefing` prints the same report to stdout.
- **States**: data, or "No data yet." when no source has anything for the
  day. No not-connected state: manual entries need no connector. A failed
  read counts as no rows for that source and is logged.
- Button "Open Financials  →" → `/financials` for that one day.

## Financial Information `/financials`

Header (with its button active) + a page title row, then:

- Metric tiles for the range: Revenue, Orders, AOV (Shopify), Ad Spend
  (Meta), Manual Income, Manual Expenses, **Profit = revenue + manual income −
  ad spend − manual expenses**. Delta vs previous period where the source has
  one.
- Daily table panel for the range: date, revenue, orders, ad spend, manual
  income, manual expenses, profit. Days with nothing are omitted; no data →
  empty state.
- **Manual entries panel** (figures the connected apps don't track):
  - Form: date, type (`income | expense`), category (1–64 chars), amount
    (positive, ≤ 2 decimals, ≤ 1,000,000,000), note (≤ 500 chars, optional).
  - Save = server action → `save_record('financial_entry', {date, type,
    category, amount_cents, note}, external_id=<uuid>, title=category,
    occurred_at=date)`. Server-side validation is the gate; client-side is
    convenience.
  - List in range from `records_v1` where `kind='financial_entry'` and
    `source='dashboard'`, newest first, with delete (`delete_record`).
  - Empty → "No entries yet".

## Content Library + Creative Folder `/library`

Header (with its button active) + a page title row, then:

- Toolbar: search (title, filename, tags), tag filter, a line pointing at the
  connected Google Drive folder, **New set**.
- Media grid: `media_v1` not deleted, newest first; thumb (`thumbUrls`),
  title/filename, tags, byte size. Checkbox select → bulk bar: **Add tags**
  (`bulk_tag`), **Add to set** (`set_media_set_items`), **Download** (each
  file full-quality via `downloadUrl`), **Delete** (`delete_media`, soft).
- Item view: title + tags edit (`update_media`), full-quality download
  (`download_url`), delete.
- **Creative Folder = sets**: list of `media_sets_v1` (cover, name,
  description, file count); open a set → its items (`media_set_items_v1`)
  with remove / reorder; rename / delete set (`update_media_set`,
  `delete_media_set`).
- Adding files: there is no upload form. Files arrive through the Drive
  connector (platform-v1 §4b, 2026-09-17) — the client drops them in the
  connected Google Drive folder and the next sync indexes them into
  `data.media` as `source='drive'`. The toolbar says so instead of offering an
  upload. `api.register_upload` still exists for the service-role
  `scripts/import-media` path, but no app code calls it.
- Egress: show "Downloads this period: X of Y" from `egress_status_v1` and
  disable downloads when exhausted.
- Empty → "No files yet. Add your first creative to the connected Google Drive folder."

**Platform limits as built (2026-09-13, decided; lift only with a bcns-data
change)**:
- Set items have no order: `data.media_set_items` has no position column and
  `set_media_set_items` accepts add/remove only, so "reorder" is not offered.
- Thumbnails render as the placeholder tile for every file: `thumb_path` is
  never populated and the `media_read_orig` policy only signs an original
  while a download ticket exists, so the original is not a thumbnail source.
- Egress is metered in bytes (`bytes_used` / `quota_bytes`), so the line
  reads "Downloads this period: 364 B of 20 GB", not a download count.
- Two download routes, one control (`DownloadControl` in `app/library/page.tsx`)
  so the tray and the item view cannot drift: a `source='drive'` row opens its
  own `attributes.web_view_link` (Drive holds the bytes — nothing to sign, no
  egress), anything else posts to `downloadMedia` → `api.download_url`, which is
  metered. Bulk download is a tray of per-file controls that mint on click,
  never on render, so a refresh does not spend egress.

## Out of scope (this build)

Any chat/agent, briefing email, writes back to Shopify/Meta/
Monday/Meet, Meet or Monday pages, Drive indexing UI, QuickBooks.
