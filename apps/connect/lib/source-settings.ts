/**
 * source-settings.ts — the per-source page (/sources/[source]): what it shows and what its two
 * owner buttons do. Pure: rows come in, a page model or a redirect path comes out. The owner
 * check and revalidate are injected (as in ai-settings.ts) so tests run without Next.
 *
 * Reads go through api.source_settings_v1() and api.connector_runs_v1(p_source), and writes through
 * api.reset_source_cursors and api.set_source_folder (20261007000400_source_settings.sql). The
 * database re-checks owner, tenant, the one-hour limit and the folder id. Everything here is
 * the friendly layer on top.
 */
import { HUB_SOURCES, TITLES, composeSources, disconnectingNote, type HealthRow, type HubSource, type Tone } from "./sources";
import { normalizeShop } from "./shopify-oauth";

/** The only config keys the page ever reads, matching TARGET_KEYS in the migration. */
export const TARGET_KEYS = ["folder_id", "notes_url", "board_url", "board_id", "admin_url", "shop", "realm_id"] as const;

/** Change-folder is offered for the two Google folder sources only, the same set the database allows. */
export const FOLDER_SOURCES: readonly HubSource[] = ["meet", "drive"];
/** Shopify re-syncs through its own install flow, so the database refuses it here too. */
export const RESYNC_SOURCES: readonly HubSource[] = ["meta", "monday", "meet", "drive", "quickbooks"];

export const RESET_COOLDOWN_MS = 60 * 60 * 1000;

export function isHubSource(value: unknown): value is HubSource {
  return typeof value === "string" && (HUB_SOURCES as readonly string[]).includes(value);
}

const FOLDER_ID = /^[A-Za-z0-9_-]{10,128}$/;

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/**
 * A Google Drive folder from what an owner pastes: the bare id, a /drive/folders/<id> link
 * (with or without /u/<n>/ and a ?usp= tail), or an open?id=<id> link. Anything not on
 * https://drive.google.com is refused. The stored link is rebuilt from the id, so nothing
 * else from the pasted text is kept.
 */
export function parseDriveFolder(input: unknown): { id: string; url: string } | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw || raw.length > 500) return null;
  if (FOLDER_ID.test(raw)) return { id: raw, url: folderUrl(raw) };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.username || url.password || url.port) {
    return null;
  }
  const path = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([^/]+)\/?$/);
  const id = path ? path[1] : url.pathname === "/open" ? url.searchParams.get("id") : null;
  return id && FOLDER_ID.test(id) ? { id, url: folderUrl(id) } : null;
}

export interface TargetLine {
  label: string;
  text: string;
  href: string | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;
}

function httpsOn(value: unknown, ok: (host: string) => boolean): string | null {
  const raw = str(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ok(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * What this source is pointed at, from the allow-listed target only. Keys outside TARGET_KEYS
 * are dropped before anything is read, and every link is re-checked for https and the
 * expected host, so a bad stored value shows as text or not at all.
 */
export function targetFor(source: HubSource, target: unknown): TargetLine[] {
  const t: Partial<Record<(typeof TARGET_KEYS)[number], unknown>> = {};
  if (target && typeof target === "object" && !Array.isArray(target)) {
    for (const key of TARGET_KEYS) t[key] = (target as Record<string, unknown>)[key];
  }
  switch (source) {
    case "meet":
    case "drive": {
      const id = str(t.folder_id);
      if (!id) return [];
      // The link is rebuilt from the id: a notes_url left over from an older folder is ignored.
      return [{ label: "Folder", text: id, href: FOLDER_ID.test(id) ? folderUrl(id) : null }];
    }
    case "monday": {
      const id = str(t.board_id);
      const href = httpsOn(t.board_url, (h) => h === "monday.com" || h.endsWith(".monday.com"));
      return id || href ? [{ label: "Board", text: id ?? "Open board", href }] : [];
    }
    case "shopify": {
      const shop = normalizeShop(str(t.shop));
      const href =
        httpsOn(t.admin_url, (h) => h === "admin.shopify.com" || h.endsWith(".myshopify.com")) ??
        (shop ? `https://admin.shopify.com/store/${shop.split(".")[0]}` : null);
      return shop || href ? [{ label: "Store", text: shop ?? "Shopify admin", href }] : [];
    }
    case "quickbooks": {
      const realm = str(t.realm_id);
      return realm ? [{ label: "Company ID", text: realm, href: null }] : [];
    }
    default:
      return [];
  }
}

export type ResetState =
  | { kind: "ready" }
  | { kind: "running" }
  | { kind: "wait"; until: string };

/** Whether "Sync everything again" can run now. Mirrors the database guard; the database decides. */
export function resetState(lastResetAt: string | null | undefined, syncRunning: boolean, now: Date): ResetState {
  if (syncRunning) return { kind: "running" };
  const last = lastResetAt ? new Date(lastResetAt).getTime() : NaN;
  if (Number.isNaN(last)) return { kind: "ready" };
  const until = last + RESET_COOLDOWN_MS;
  return until > now.getTime() ? { kind: "wait", until: new Date(until).toISOString() } : { kind: "ready" };
}

export interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** RPC error → the `?error=` flag the page turns into a message. Unknown → "failed". */
export function errorFlag(error: RpcError | null | undefined): string {
  if (!error) return "failed";
  switch (error.code) {
    case "BCNS2":
      return "forbidden";
    case "BCNS3":
      return error.details === "folder_id" || error.details === "folder_url" ? "invalid-folder" : "failed";
    case "BCNS4":
      return "not-connected";
    case "BCNS9":
      return error.message === "sync_running" ? "sync-running" : "rate-limited";
    default:
      return "failed";
  }
}

export const OK_MESSAGES: Record<string, string> = {
  resync: "Done. Everything will be pulled again on the next sync, within the hour.",
  folder: "Folder saved. It will be checked on the next sync, within the hour.",
};

export const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Only an owner can change this source.",
  "rate-limited": "This was synced again less than an hour ago. Try again later.",
  "sync-running": "A sync is running right now. Try again in a few minutes.",
  "not-connected": "This source isn't connected.",
  "invalid-folder": "That doesn't look like a Google Drive folder link. Open the folder in Drive and copy the address bar.",
  failed: "That didn't work. Try again, or email bcns.",
};

/**
 * A sync error in plain words. The raw text stays available behind a "Details" toggle, so
 * this only has to point at the fix.
 */
export function friendlyError(raw: string | null | undefined): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const t = text.toLowerCase();
  // The worker's empty-listing guard (§4.1, Drive only): nothing listed, so nothing was removed.
  if (/found nothing to sync/.test(t)) return EMPTY_FOLDER_WARNING;
  if (/invalid_grant|token (has been )?(expired|revoked)|unauthori[sz]ed|\b401\b/.test(t)) {
    return "The connection was signed out. Reconnect it from the Sources page.";
  }
  if (/insufficient ?permission|permission denied|forbidden|\b403\b/.test(t) && !/rate ?limit/.test(t)) {
    return "We couldn't open that folder. Check that it is shared with the Google account you connected.";
  }
  if (/not ?found|\b404\b/.test(t)) return "We couldn't find that folder. Check the link.";
  if (/folder walk stopped/.test(t)) return "That folder has too many subfolders to read. Pick a folder closer to the files.";
  if (/rate ?limit|too many requests|\b429\b/.test(t)) return "The service asked us to slow down. We'll keep trying.";
  if (/timeout|timed out|\b50[0-4]\b|econnreset|fetch failed/.test(t)) {
    return "The service didn't answer in time. We'll try again on the next sync.";
  }
  return "The last sync hit a problem. We'll try again on the next sync. Email us if it keeps happening.";
}

export interface RunRow {
  source?: string;
  mode: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_fetched: number | null;
  rows_upserted: number | null;
  error: string | null;
}

export type FolderCheck = "none" | "pending" | "found" | "empty" | "failed";

export const EMPTY_FOLDER_WARNING =
  "We didn't find any files in that folder. Check the link, and that the folder is shared with the Google account you connected.";

/**
 * How the folder set at `folderChangedAt` turned out, from the full syncs started after it.
 * An empty or unshared Drive folder fails the worker run with "found nothing to sync"
 * (a 0-row ok run counts the same). Any full sync that found files wins. "pending" only
 * until some sync finishes after the change; once one has and none was a full sync (it
 * fell out of the recent-runs window), there is nothing left to judge: "none".
 */
export function folderCheck(runs: readonly RunRow[], folderChangedAt: string | null | undefined): FolderCheck {
  const since = folderChangedAt ? new Date(folderChangedAt).getTime() : NaN;
  if (Number.isNaN(since)) return "none";
  const after = runs.filter(
    (r) => r.finished_at && r.status !== "running" && new Date(r.started_at).getTime() >= since
  );
  if (after.length === 0) return "pending";
  const full = after.filter((r) => r.mode === "backfill");
  const ok = full.filter((r) => r.status === "ok");
  if (ok.some((r) => (r.rows_fetched ?? 0) > 0)) return "found";
  if (ok.length > 0 || full.some((r) => /found nothing to sync/i.test(r.error ?? ""))) return "empty";
  return full.length > 0 ? "failed" : "none";
}

const MODE_LABELS: Record<string, string> = { backfill: "Full sync", incremental: "Update", renormalize: "Recalculate" };
const STATUS_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "error" | "idle" }> = {
  ok: { label: "Done", tone: "ok" },
  running: { label: "Running", tone: "idle" },
  error: { label: "Failed", tone: "error" },
  auth_failed: { label: "Needs reconnect", tone: "error" },
};

export interface RunLine {
  kind: string;
  status: string;
  tone: "ok" | "warn" | "error" | "idle";
  startedAt: string;
  finishedAt: string | null;
  rows: number;
  problem: string | null;
  raw: string | null;
}

export interface SettingsRow {
  source: string;
  enabled: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  next_run_at: string | null;
  last_reset_at: string | null;
  folder_changed_at: string | null;
  sync_running: boolean | null;
  target: unknown;
}

export interface SourcePage {
  source: HubSource;
  title: string;
  /** An enabled schedule: gates the owner controls. */
  connected: boolean;
  /** The Status badge: the Sources card's label and tone (connector health), or Syncing now. */
  status: { label: string; tone: Tone };
  /** The health row's last error: plain words plus the raw text for "Details". */
  lastError: { problem: string; raw: string } | null;
  /** The pending-delete note after an owner Disconnect, else null. Then nothing else is offered. */
  disconnecting: string | null;
  isOwner: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  syncRunning: boolean;
  target: TargetLine[];
  runs: RunLine[];
  /** Null when the button is not offered (members, Shopify, not connected). */
  resync: (ResetState & { lastResetAt: string | null }) | null;
  /** Null when change-folder is not offered. */
  folder: { current: string | null; check: FolderCheck } | null;
  /** Shopify: switching store is an email to bcns, never a form here. */
  shopSwitchByEmail: boolean;
}

/** Everything the page renders, from the two reads. `settings` may hold every source of the client. */
export function sourcePage(input: {
  source: HubSource;
  settings: readonly SettingsRow[] | null | undefined;
  runs: readonly RunRow[] | null | undefined;
  role: string | null | undefined;
  now: Date;
  /** connector_health_v1 rows; null or absent when the read failed. */
  health?: readonly HealthRow[] | null;
  /** api.disconnecting_sources_v1; null or absent when the read failed. */
  disconnecting?: readonly string[] | null;
}): SourcePage {
  const { source, now } = input;
  const disconnecting = input.disconnecting?.includes(source) ? disconnectingNote(source) : null;
  const row = disconnecting ? null : ((input.settings ?? []).find((s) => s.source === source && s.enabled) ?? null);
  const isOwner = input.role === "owner";
  const connected = row !== null;
  const syncRunning = row?.sync_running === true;
  const runs = disconnecting ? [] : (input.runs ?? []).slice(0, 20);
  const target = row ? targetFor(source, row.target) : [];
  const healthRow = disconnecting ? null : ((input.health ?? []).find((h) => h.source === source) ?? null);
  const card = composeSources(healthRow ? [healthRow] : []).find((c) => c.source === source);
  const lastErrorRaw = healthRow?.last_error?.trim() ? healthRow.last_error.trim() : null;
  return {
    source,
    title: TITLES[source],
    connected,
    status: disconnecting
      ? { label: "Disconnecting", tone: "idle" }
      : connected && syncRunning
        ? { label: "Syncing now", tone: "warn" }
        : card && card.status !== "none"
          ? { label: card.label, tone: card.tone }
          : connected
            ? { label: "Connected", tone: "ok" }
            : { label: "Not connected", tone: "idle" },
    lastError: lastErrorRaw ? { problem: friendlyError(lastErrorRaw) ?? lastErrorRaw, raw: lastErrorRaw } : null,
    disconnecting,
    isOwner,
    lastRunAt: row?.last_run_at ?? null,
    lastSuccessAt: row?.last_success_at ?? null,
    nextRunAt: row?.next_run_at ?? null,
    syncRunning,
    target,
    runs: runs.map((r) => {
      const st = STATUS_LABELS[r.status] ?? { label: "Failed", tone: "error" as const };
      return {
        kind: MODE_LABELS[r.mode] ?? "Sync",
        status: st.label,
        tone: st.tone,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        rows: r.rows_fetched ?? 0,
        problem: friendlyError(r.error),
        raw: r.error && r.error.trim() ? r.error : null,
      };
    }),
    resync:
      isOwner && connected && RESYNC_SOURCES.includes(source)
        ? { ...resetState(row?.last_reset_at, syncRunning, now), lastResetAt: row?.last_reset_at ?? null }
        : null,
    folder:
      isOwner && connected && FOLDER_SOURCES.includes(source)
        ? { current: target[0]?.text ?? null, check: folderCheck(runs, row?.folder_changed_at) }
        : null,
    shopSwitchByEmail: source === "shopify",
  };
}

/** Minimal shape of the `api` schema client this module calls. */
export interface SourceSettingsApi {
  rpc(fn: "reset_source_cursors", args: { p_source: HubSource }): PromiseLike<{ error: RpcError | null }>;
  rpc(
    fn: "set_source_folder",
    args: { p_source: HubSource; p_folder_id: string; p_folder_url: string }
  ): PromiseLike<{ error: RpcError | null }>;
}

export interface MutationDeps {
  requireOwner: (denyTo: string) => Promise<{ api: SourceSettingsApi }>;
  revalidate: (path: string) => void;
  now?: () => Date;
}

/**
 * A `rate_limited` refusal whose next-allowed time is (almost) a full hour away means the
 * reset landed a moment ago: a double-click, or a retried submit. Treat it as done.
 */
export function justReset(error: RpcError | null | undefined, now: Date): boolean {
  if (error?.code !== "BCNS9" || error.message !== "rate_limited") return false;
  const until = Date.parse(error.details ?? "");
  return !Number.isNaN(until) && until - now.getTime() >= 59 * 60_000;
}

function back(source: HubSource, flag: string): string {
  return `/sources/${source}?${flag}`;
}

/** "Sync everything again": the same reset as `add-source --reset-cursors`. Returns where to redirect. */
export async function resyncSource(form: FormData, deps: MutationDeps): Promise<string> {
  const source = form.get("source");
  if (!isHubSource(source)) return "/";
  const { api } = await deps.requireOwner(`/sources/${source}`);
  if (!RESYNC_SOURCES.includes(source)) return back(source, "error=failed");
  try {
    const { error } = await api.rpc("reset_source_cursors", { p_source: source });
    if (error && !justReset(error, deps.now?.() ?? new Date())) return back(source, `error=${errorFlag(error)}`);
  } catch {
    return back(source, "error=failed");
  }
  deps.revalidate(`/sources/${source}`);
  return back(source, "ok=resync");
}

/** Change folder (meet/drive). The id is checked here and again in the database. */
export async function changeFolder(form: FormData, deps: MutationDeps): Promise<string> {
  const source = form.get("source");
  if (!isHubSource(source)) return "/";
  const { api } = await deps.requireOwner(`/sources/${source}`);
  if (!FOLDER_SOURCES.includes(source)) return back(source, "error=failed");
  const folder = parseDriveFolder(form.get("folder"));
  if (!folder) return back(source, "error=invalid-folder");
  try {
    const { error } = await api.rpc("set_source_folder", {
      p_source: source,
      p_folder_id: folder.id,
      p_folder_url: folder.url,
    });
    if (error) return back(source, `error=${errorFlag(error)}`);
  } catch {
    return back(source, "error=failed");
  }
  deps.revalidate(`/sources/${source}`);
  return back(source, "ok=folder");
}
