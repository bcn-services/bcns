/**
 * sources.ts — pure composition of the Sources page.
 *
 * Everything here is a total function over rows already fetched by the page:
 * no Supabase, no env, no clock reads beyond what the caller passes in. That
 * is what makes tests/sources.test.mjs possible without a database.
 *
 * "Connected" is deliberately defined as "a connector_health_v1 row exists and
 * has actually run". `data.source_tokens` is the real secret store and has no
 * api view on purpose, so the hub can never read it — health is the only
 * signal a member is allowed to see.
 */

/**
 * The five sources a connector actually runs for — `platform/worker/src/connectors`
 * exports exactly these, and `data.connector_health` rows only ever exist for a
 * `data.connector_schedule` row, which `add-source` gates on that same registry.
 *
 * `data.source` also holds 'upload', 'dashboard' and 'platform'. None of them is a
 * connector: 'platform' is bookkeeping, and the other two are the client's own manual
 * channels. A card for them could never leave "Not connected / Request connection",
 * so they are deliberately not listed here (platform-v1 §9, dropped 2026-09-19).
 */
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
  status: HealthStatus | "none";
  /** Human label for the Badge. */
  label: string;
  tone: Tone;
  lastSuccessAt: string | null;
  /** Truncated — a connector error can be a whole stack trace. */
  lastError: string | null;
}

const TITLES: Record<HubSource, string> = {
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
  never_ran: { label: "Awaiting first pull", tone: "idle" },
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
export function composeSources(rows: readonly HealthRow[] | null | undefined): SourceCard[] {
  const bySource = new Map<string, HealthRow>();
  for (const row of rows ?? []) if (!bySource.has(row.source)) bySource.set(row.source, row);

  return HUB_SOURCES.map((source) => {
    const row = bySource.get(source);
    const status = row ? asStatus(row.status) : "none";
    const { label, tone } = STATES[status];
    return {
      source,
      title: TITLES[source],
      // never_ran is a row that exists but has never pulled: the card says
      // "Awaiting first pull", and `connected` below still counts it as not
      // yet connected — there is no data flowing to show a control for.
      // auth_failed is "connected but broken": the card's own label says Reconnect
      // needed, and the page hides the Connect form on any connected card — so
      // counting it as connected leaves that card with no control at all.
      connected: status !== "none" && status !== "never_ran" && status !== "auth_failed",
      status,
      label,
      tone,
      lastSuccessAt: row?.last_success_at ?? null,
      lastError: truncate(row?.last_error ?? null),
    };
  });
}

export interface ClientRow {
  name?: string | null;
  slug?: string | null;
  /** Added by 20260916000100_clients_app_url.sql. Absent on an older database. */
  app_url?: string | null;
}

/**
 * Where "Open your dashboard" points. `app_url` wins when the column exists and
 * is set; otherwise the convention. The optional property is what lets the page
 * `select("*")` against a database that has not run the migration yet.
 */
export function dashboardUrl(client: ClientRow | null | undefined): string | null {
  const appUrl = client?.app_url?.trim();
  if (appUrl) return appUrl;
  const slug = client?.slug?.trim();
  return slug ? `https://${slug}.bcn-services.com` : null;
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
