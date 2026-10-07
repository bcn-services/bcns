/**
 * sources.ts — pure composition of the Sources page.
 *
 * Everything here is a total function over rows already fetched by the page:
 * no Supabase, no env, no clock reads beyond what the caller passes in. That
 * is what makes tests/sources.test.mjs possible without a database.
 *
 * "Connected" is deliberately defined as "a connector_health_v1 row exists" (a row
 * means attached and not revoked; never_ran is connected but not yet synced). `data.source_tokens` is the real secret store and has no
 * api view on purpose, so the hub can never read it — health is the only
 * signal a member is allowed to see.
 */

/**
 * The six sources a connector actually runs for — `platform/worker/src/connectors`
 * exports exactly these, and `data.connector_health` rows only ever exist for a
 * `data.connector_schedule` row, which `add-source` gates on that same registry.
 *
 * `data.source` also holds 'upload', 'dashboard' and 'platform'. None of them is a
 * connector: 'platform' is bookkeeping, and the other two are the client's own manual
 * channels. A card for them could never leave "Not connected / Request connection",
 * so they are deliberately not listed here (platform-v1 §9, dropped 2026-09-19).
 */
import { normalizeShop } from "./shopify-oauth";
import { BCNS_EMAIL } from "./request-connection";

export const HUB_SOURCES = ["shopify", "meta", "monday", "meet", "drive", "quickbooks"] as const;

export type HubSource = (typeof HUB_SOURCES)[number];

/** `data.health_status`. An unknown value from a newer migration reads as "error". */
export type HealthStatus = "ok" | "stale" | "auth_failed" | "error" | "never_ran";

export interface HealthRow {
  source: string;
  status: string | null;
  last_run_at?: string | null;
  last_success_at: string | null;
  last_error: string | null;
}

export type Tone = "ok" | "warn" | "error" | "idle";

export interface SourceCard {
  source: HubSource;
  /** Title case for the card heading. */
  title: string;
  connected: boolean;
  /** never_ran: token active + schedule enabled, first sync not yet done. Card shows "First sync pending". */
  pending: boolean;
  status: HealthStatus | "none";
  /** Human label for the Badge. */
  label: string;
  tone: Tone;
  lastSuccessAt: string | null;
  /** Truncated — a connector error can be a whole stack trace. */
  lastError: string | null;
  /** Owner disconnected it and the worker has not deleted its data yet (api.disconnecting_sources_v1). */
  disconnecting: boolean;
  /** What the card says instead of "Last success" while disconnecting, else null. */
  disconnectingNote: string | null;
}

export const TITLES: Record<HubSource, string> = {
  shopify: "Shopify",
  meta: "Meta Ads",
  monday: "Monday.com",
  meet: "Google Meet",
  drive: "Google Drive",
  quickbooks: "QuickBooks",
};

const STATES: Record<HealthStatus | "none", { label: string; tone: Tone }> = {
  ok: { label: "Connected", tone: "ok" },
  stale: { label: "Stale", tone: "warn" },
  auth_failed: { label: "Reconnect needed", tone: "error" },
  error: { label: "Error", tone: "error" },
  never_ran: { label: "Connected", tone: "ok" },
  none: { label: "Not connected", tone: "idle" },
};

function asStatus(value: string | null | undefined): HealthStatus | "none" {
  if (!value) return "none";
  return value in STATES && value !== "none" ? (value as HealthStatus) : "error";
}

/** Cut a connector's last error down to one readable line. */
export function truncate(value: string | null | undefined, max = 140): string | null {
  if (!value) return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * One card per hub source, always in HUB_SOURCES order, whether or not the
 * client has a health row for it. A row for a source the hub does not show
 * (e.g. 'platform') is ignored rather than rendered.
 */
export function composeSources(
  rows: readonly HealthRow[] | null | undefined,
  disconnecting?: readonly string[] | null,
): SourceCard[] {
  const bySource = new Map<string, HealthRow>();
  for (const row of rows ?? []) if (!bySource.has(row.source)) bySource.set(row.source, row);

  return HUB_SOURCES.map((source) => {
    if (disconnecting?.includes(source)) {
      // disconnect_source deletes the health row, so there is nothing else to show.
      return {
        source,
        title: TITLES[source],
        connected: false,
        pending: false,
        status: "none",
        label: "Disconnecting",
        tone: "idle",
        lastSuccessAt: null,
        lastError: null,
        disconnecting: true,
        disconnectingNote: disconnectingNote(source),
      };
    }
    const row = bySource.get(source);
    const status = row ? asStatus(row.status) : "none";
    const { label, tone } = STATES[status];
    return {
      source,
      title: TITLES[source],
      // Row exists = attached and not revoked (attach_source writes it never_ran;
      // revoke deletes it), so never_ran is
      // connected, just not yet synced. auth_failed is "connected but broken": the
      // page hides the Connect form on connected cards, so it stays not connected.
      connected: status !== "none" && status !== "auth_failed",
      pending: status === "never_ran",
      status,
      label,
      tone,
      lastSuccessAt: row?.last_success_at ?? null,
      lastError: truncate(row?.last_error ?? null),
      disconnecting: false,
      disconnectingNote: null,
    };
  });
}

/** Between Disconnect and the worker's delete: the data is going, so no reconnect is offered yet. */
export function disconnectingNote(source: HubSource): string {
  // A stuck upstream revoke keeps this up with no Connect button, so it always names a way out.
  return `bcns is deleting the ${TITLES[source]} data it stored for this workspace. You can connect it again once that is done. If this still shows tomorrow, email ${BCNS_EMAIL}.`;
}

export interface ClientRow {
  name?: string | null;
  slug?: string | null;
  /** Added by 20260916000100_clients_app_url.sql. Absent on an older database. */
  app_url?: string | null;
  /** clients.timezone (IANA); the owner confirms it equals the store's (DESIGN.md U2). */
  timezone?: string | null;
}

/**
 * The client's custom dashboard (`app_url`), or null when it has none — then the
 * hub shows no dashboard button or link at all; "Your data" in the top bar is the
 * only way to /data. The optional property is what lets the page `select("*")`
 * against a database that has not run the migration yet.
 */
export function dashboardUrl(client: ClientRow | null | undefined): string | null {
  return client?.app_url?.trim() || null;
}

/** Binary units, one decimal, because quotas are set in GiB. */
export function formatBytes(bytes: number | null | undefined): string {
  const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

export interface EgressRow {
  bytes_used?: number | null;
  quota_bytes?: number | null;
  exceeded?: boolean | null;
}

/** "1.2 GB of 10.0 GB used this month" — or null when there is no row to show. */
export function egressLine(row: EgressRow | null | undefined): string | null {
  if (!row) return null;
  const line = `${formatBytes(row.bytes_used)} of ${formatBytes(row.quota_bytes)} used this month`;
  return row.exceeded ? `${line} — quota exceeded` : line;
}

export type ShopifyControl =
  | { kind: "form"; shop: string; label: string }
  | { kind: "reconnect-in-shopify" }
  | { kind: "install"; url: string | null };

/**
 * The Shopify card's control. Merchants never type a shop domain (App Store 2.3.1):
 * a hub-initiated form only for an operator's explicit ?shop= query; a stored source
 * reconnects via Shopify admin (keeps the managed-pricing gate); no row installs from the App Store.
 */
export function shopifyControl(
  card: Pick<SourceCard, "status">,
  shop: string | undefined,
  error: string | undefined,
  appHandle: string | null | undefined,
): ShopifyControl {
  const valid = error ? null : normalizeShop(shop);
  if (valid) return { kind: "form", shop: valid, label: `${card.status === "none" ? "Connect" : "Reconnect"} ${valid}` };
  if (card.status !== "none") return { kind: "reconnect-in-shopify" };
  return { kind: "install", url: appHandle ? `https://apps.shopify.com/${appHandle}` : null };
}

/**
 * Sources an owner can disconnect (api.disconnect_source's allow-list, migration
 * 20261007000500; the worker's DISCONNECT_SOURCES). Never Shopify: its own uninstall
 * flow owns that.
 */
export const DISCONNECTABLE = ["quickbooks", "meet", "drive", "monday", "meta"] as const;

export type Disconnectable = (typeof DISCONNECTABLE)[number];

export function isDisconnectable(value: unknown): value is Disconnectable {
  return typeof value === "string" && (DISCONNECTABLE as readonly string[]).includes(value);
}

/** The hub route that disconnects `source` (app/api/sources/[source]/disconnect). */
export function disconnectPath(source: Disconnectable): string {
  return `/api/sources/${source}/disconnect`;
}

/**
 * Whether to offer Disconnect: a disconnectable source, owners only, and only when
 * something is stored — including "Reconnect needed", whose token the owner may want gone.
 */
export function canDisconnect<C extends Pick<SourceCard, "source" | "status">>(
  card: C,
  role: string | null | undefined,
): card is C & { source: Disconnectable } {
  return isDisconnectable(card.source) && role === "owner" && card.status !== "none";
}

/**
 * Whether the other Google source (meet <-> drive) is connected: its card is not "Not
 * connected". A health row exists while that token is active or auth_failed (disconnect and
 * the worker's health step drop it for a revoked one), the rule
 * platform/worker/src/disconnect.ts googleRevokeNeeded uses to keep the shared grant.
 */
export function googleSiblingConnected(
  source: string,
  cards: readonly Pick<SourceCard, "source" | "status">[],
): boolean {
  const other = source === "meet" ? "drive" : source === "drive" ? "meet" : null;
  return other !== null && cards.some((c) => c.source === other && c.status !== "none");
}

const GOOGLE_BOTH = `Google removes bcns's access once both ${TITLES.meet} and ${TITLES.drive} are disconnected.`;

/**
 * The confirm text behind Disconnect, one paragraph per entry. Promises only what
 * platform/worker/src/disconnect.ts does: deletes that source's stored data, cancels
 * access upstream where the provider allows it (for meet/drive, only when the other
 * Google source is not connected; null = unknown), and a reconnect starts from scratch.
 */
export function disconnectCopy(source: Disconnectable, opts: { siblingConnected?: boolean | null } = {}): string[] {
  const title = TITLES[source];
  const lines = [
    `This disconnects ${title} and deletes the ${title} data bcns has stored for this workspace. Reconnecting later re-imports everything from the start.`,
  ];
  if (source === "quickbooks" || source === "meta") {
    lines.push(`bcns also cancels its access to your ${title} account.`);
  } else if (source === "monday") {
    lines.push(
      "Monday has no way for bcns to cancel its access, so remove it in Monday as well. If you connected with the Connect button, uninstall bcns (your profile picture, then Administration, then Apps, then Uninstall). If you gave bcns an API token, regenerate it (your profile picture, then Developers, then My access tokens); anything else using that token stops working too.",
    );
  } else if (opts.siblingConnected === null) {
    // Could not read the other Google source: only the sentence that is true either way.
    lines.push(GOOGLE_BOTH);
  } else if (opts.siblingConnected) {
    const other = TITLES[source === "meet" ? "drive" : "meet"];
    lines.push(`${other} stays connected: it is connected separately. ${GOOGLE_BOTH}`);
  } else {
    lines.push("bcns also cancels its access to your Google account.");
  }
  return lines;
}

/** The banner after a disconnect, or null for anything that is not a disconnectable source. */
export function disconnectedNote(source: string | undefined): string | null {
  if (!isDisconnectable(source)) return null;
  return `${TITLES[source]} is disconnected. bcns is deleting the ${TITLES[source]} data it stored for this workspace.`;
}
