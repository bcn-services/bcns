/**
 * data-views.ts — the ONE config the /data page and the CSV export both read.
 *
 * Every view named here is an `api.*_v1` view: `security_invoker`, so RLS scopes
 * each read to the signed-in user's client. Nothing here (or in any data-*.ts)
 * filters by client — `.eq("source", …)` is a source filter, not a tenant filter.
 *
 * Columns are an allow-list: only these keys are ever selected. That is what keeps
 * `storage_path` / `thumb_path` (media, creatives) off the page. `attributes` is exposed only
 * for monday and drive `records_v1`, as a collapsed Details cell (pretty JSON, same client's
 * rows only) — never as a raw dump column.
 */

import type { HubSource, SourceCard } from "./sources";

export type ColType = "text" | "money" | "number" | "date" | "datetime" | "bytes" | "link" | "details";

export interface Column {
  key: string;
  /** Human label — never the raw column name. */
  label: string;
  type: ColType;
  /** For `money`: the column holding this row's ISO currency code. */
  currencyKey?: string;
}

export interface ViewConfig {
  source: HubSource;
  /** URL id, unique within its source. */
  id: string;
  label: string;
  /** The `api.*_v1` view name. */
  view: string;
  /** Extra equality filter on the view (e.g. money_v1 holds orders, refunds and payouts). */
  extra?: { column: string; value: string };
  /** The view exposes soft-deleted rows; hide them (`deleted_at is null`). */
  liveOnly?: boolean;
  /** The from/to filter and the default sort run on this column. */
  dateColumn: string;
  /** `date` = plain `YYYY-MM-DD` column; `timestamptz` makes `to` inclusive of the whole day. */
  dateKind: "date" | "timestamptz";
  /** Text columns the `q` box searches. */
  searchColumns: string[];
  /** Secondary sort key so pages and CSV chunks never overlap or skip. */
  tieBreak: string;
  columns: Column[];
}

const ATTRIBUTES: Column = { key: "attributes", label: "Details", type: "details" };

/**
 * Date-column choices (the views have no single "created" convention):
 *  - money / messages / records: `occurred_at` (not null, the real event time)
 *  - meta daily views: `day`
 *  - customers, products, jobs: `updated_at` — the only always-present timestamp;
 *    `created_at` is when bcns ingested the row, `first_order_at` / `due_on` can be null.
 *  - drive media: `created_at` (not null)
 */
export const DATA_VIEWS: readonly ViewConfig[] = [
  {
    source: "shopify",
    id: "orders",
    label: "Orders",
    view: "money_v1",
    extra: { column: "kind", value: "order" },
    dateColumn: "occurred_at",
    dateKind: "timestamptz",
    searchColumns: ["order_number", "external_id", "customer_external_id"],
    tieBreak: "id",
    columns: [
      { key: "order_number", label: "Order", type: "text" },
      { key: "occurred_at", label: "Placed", type: "datetime" },
      { key: "amount_minor", label: "Total", type: "money", currencyKey: "currency" },
      { key: "status", label: "Status", type: "text" },
      { key: "items_count", label: "Items", type: "number" },
      { key: "customer_external_id", label: "Customer ID", type: "text" },
      { key: "url", label: "Link", type: "link" },
    ],
  },
  {
    source: "shopify",
    id: "refunds",
    label: "Refunds",
    view: "money_v1",
    extra: { column: "kind", value: "refund" },
    dateColumn: "occurred_at",
    dateKind: "timestamptz",
    searchColumns: ["order_number", "external_id"],
    tieBreak: "id",
    columns: [
      { key: "order_number", label: "Order", type: "text" },
      { key: "occurred_at", label: "Refunded", type: "datetime" },
      { key: "amount_minor", label: "Amount", type: "money", currencyKey: "currency" },
      { key: "status", label: "Status", type: "text" },
      { key: "url", label: "Link", type: "link" },
    ],
  },
  {
    source: "shopify",
    id: "payouts",
    label: "Payouts",
    view: "money_v1",
    extra: { column: "kind", value: "payout" },
    dateColumn: "occurred_at",
    dateKind: "timestamptz",
    searchColumns: ["external_id", "status"],
    tieBreak: "id",
    columns: [
      { key: "external_id", label: "Payout", type: "text" },
      { key: "occurred_at", label: "Paid", type: "datetime" },
      { key: "amount_minor", label: "Amount", type: "money", currencyKey: "currency" },
      { key: "status", label: "Status", type: "text" },
    ],
  },
  {
    source: "shopify",
    id: "customers",
    label: "Customers",
    view: "customers_v1",
    dateColumn: "updated_at",
    dateKind: "timestamptz",
    searchColumns: ["name", "email"],
    tieBreak: "id",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "orders_count", label: "Orders", type: "number" },
      { key: "total_spent_minor", label: "Total spent", type: "money", currencyKey: "currency" },
      { key: "first_order_at", label: "First order", type: "datetime" },
      { key: "updated_at", label: "Last updated", type: "datetime" },
    ],
  },
  {
    source: "shopify",
    id: "products",
    label: "Products",
    view: "products_v1",
    dateColumn: "updated_at",
    dateKind: "timestamptz",
    searchColumns: ["title", "handle", "vendor", "product_type"],
    tieBreak: "id",
    columns: [
      { key: "title", label: "Product", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "product_type", label: "Type", type: "text" },
      { key: "price_minor", label: "Price", type: "money", currencyKey: "currency" },
      { key: "inventory_quantity", label: "In stock", type: "number" },
      { key: "variants_count", label: "Variants", type: "number" },
      { key: "url", label: "Link", type: "link" },
    ],
  },
  {
    source: "meta",
    id: "campaigns",
    label: "Campaigns",
    view: "campaign_daily_v1",
    dateColumn: "day",
    dateKind: "date",
    searchColumns: ["campaign_name", "campaign_id"],
    tieBreak: "campaign_id",
    columns: [
      { key: "day", label: "Day", type: "date" },
      { key: "campaign_name", label: "Campaign", type: "text" },
      { key: "campaign_status", label: "Status", type: "text" },
      { key: "spend_minor", label: "Spend", type: "money", currencyKey: "currency" },
      { key: "impressions", label: "Impressions", type: "number" },
      { key: "clicks", label: "Clicks", type: "number" },
      { key: "purchases", label: "Purchases", type: "number" },
      { key: "purchase_value_minor", label: "Purchase value", type: "money", currencyKey: "currency" },
      { key: "roas", label: "ROAS", type: "number" },
    ],
  },
  {
    source: "meta",
    id: "creatives",
    label: "Ad creatives",
    view: "creative_daily_v1",
    dateColumn: "day",
    dateKind: "date",
    searchColumns: ["ad_name", "ad_id"],
    tieBreak: "ad_id",
    columns: [
      { key: "day", label: "Day", type: "date" },
      { key: "ad_name", label: "Ad", type: "text" },
      { key: "spend_minor", label: "Spend", type: "money", currencyKey: "currency" },
      { key: "impressions", label: "Impressions", type: "number" },
      { key: "clicks", label: "Clicks", type: "number" },
      { key: "purchases", label: "Purchases", type: "number" },
      { key: "purchase_value_minor", label: "Purchase value", type: "money", currencyKey: "currency" },
      { key: "roas", label: "ROAS", type: "number" },
    ],
  },
  {
    source: "monday",
    id: "jobs",
    label: "Jobs",
    view: "jobs_v1",
    liveOnly: true,
    dateColumn: "updated_at",
    dateKind: "timestamptz",
    searchColumns: ["title", "status", "group_name", "owner"],
    tieBreak: "id",
    columns: [
      { key: "title", label: "Title", type: "text" },
      { key: "kind", label: "Kind", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "is_done", label: "Done", type: "text" },
      { key: "group_name", label: "Group", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "due_on", label: "Due", type: "date" },
      { key: "url", label: "Link", type: "link" },
    ],
  },
  {
    source: "monday",
    id: "records",
    label: "Records",
    view: "records_v1",
    dateColumn: "occurred_at",
    dateKind: "timestamptz",
    searchColumns: ["title", "kind"],
    tieBreak: "id",
    columns: [
      { key: "title", label: "Title", type: "text" },
      { key: "kind", label: "Kind", type: "text" },
      { key: "occurred_at", label: "When", type: "datetime" },
      ATTRIBUTES,
    ],
  },
  {
    source: "meet",
    id: "messages",
    label: "Meeting notes",
    view: "messages_v1",
    dateColumn: "occurred_at",
    dateKind: "timestamptz",
    searchColumns: ["title", "kind"],
    tieBreak: "id",
    columns: [
      { key: "title", label: "Meeting", type: "text" },
      { key: "kind", label: "Kind", type: "text" },
      { key: "occurred_at", label: "When", type: "datetime" },
      { key: "participants", label: "Participants", type: "text" },
      { key: "body", label: "Notes", type: "details" },
      { key: "url", label: "Link", type: "link" },
    ],
  },
  {
    source: "drive",
    id: "files",
    label: "Files",
    view: "media_v1",
    liveOnly: true,
    dateColumn: "created_at",
    dateKind: "timestamptz",
    searchColumns: ["filename", "title", "mime"],
    tieBreak: "id",
    // Metadata only. No storage_path / thumb_path / attributes: this page never links to a file.
    columns: [
      { key: "filename", label: "File", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "mime", label: "Type", type: "text" },
      { key: "bytes", label: "Size", type: "bytes" },
      { key: "width", label: "Width", type: "number" },
      { key: "height", label: "Height", type: "number" },
      { key: "created_at", label: "Added", type: "datetime" },
    ],
  },
  {
    source: "drive",
    id: "records",
    label: "Records",
    view: "records_v1",
    dateColumn: "occurred_at",
    dateKind: "timestamptz",
    searchColumns: ["title", "kind"],
    tieBreak: "id",
    columns: [
      { key: "title", label: "Title", type: "text" },
      { key: "kind", label: "Kind", type: "text" },
      { key: "occurred_at", label: "When", type: "datetime" },
      ATTRIBUTES,
    ],
  },
];

export function viewsFor(source: string): ViewConfig[] {
  return DATA_VIEWS.filter((v) => v.source === source);
}

export function findView(source: string | null | undefined, id: string | null | undefined): ViewConfig | null {
  return DATA_VIEWS.find((v) => v.source === source && v.id === id) ?? null;
}

/** Every key a query for this view selects: displayed columns, currency codes, and the tie-break. No `*`. */
export function selectKeys(cfg: ViewConfig): string[] {
  const keys = new Set<string>();
  for (const c of cfg.columns) {
    keys.add(c.key);
    if (c.currencyKey) keys.add(c.currencyKey);
  }
  keys.add(cfg.tieBreak);
  return [...keys];
}

export type SourceState =
  | { kind: "ready" }
  | { kind: "pending"; message: string }
  | { kind: "reconnect"; message: string }
  | { kind: "none"; message: string };

/**
 * What a source's tab shows instead of a table when it has no data flowing.
 * connected -> ready. A health row that has never pulled -> "first sync in
 * progress". auth_failed is a row that exists but is broken, so it says
 * reconnect rather than promising a sync. No row at all -> Not connected.
 */
export function sourceState(card: Pick<SourceCard, "connected" | "status">): SourceState {
  if (card.connected) return { kind: "ready" };
  if (card.status === "none") return { kind: "none", message: "Not connected" };
  if (card.status === "auth_failed") return { kind: "reconnect", message: "Reconnect needed" };
  return { kind: "pending", message: "Connected, first sync in progress" };
}
