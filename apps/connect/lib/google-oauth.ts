/**
 * google-oauth.ts — the Google handshake for `meet` and `drive` as pure functions.
 *
 * ONE bcns-owned External OAuth client serves both sources (docs/architecture/chunk7-google-flow.md).
 * Flow: Connect -> consent (offline) -> Google Picker folder pick -> api.connect_source.
 *
 * What the worker reads (platform/worker/src/connectors/{meet,drive}.ts):
 *   token  — source_tokens.secret = access token, refresh_secret = refresh token, kind `google_oauth_refresh`
 *   config — `folder_id` (the picked folder) and `oauth_client_id`
 * There is NO oauth_client_secret in the row: hub-connected rows rely on the worker's own env secret (item C2).
 */

import { PICK_TTL_MS, seal, unseal } from "./oauth-state";

export const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
/**
 * THE scope. Nothing else in the repo may hard-code it. `drive.readonly` (restricted), not
 * `drive.file`: a Picker-picked folder under drive.file exposes no children (gate test,
 * docs/architecture/chunk7-google-flow.md).
 */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"] as const;
/** `data.token_kind`; mirrors `meet.tokenKind` / `drive.tokenKind`. */
export const GOOGLE_TOKEN_KIND = "google_oauth_refresh";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export const GOOGLE_SOURCES = ["meet", "drive"] as const;
export type GoogleSource = (typeof GOOGLE_SOURCES)[number];

/** Mirrors each worker connector's `defaults`; tests fail if they drift. */
export const GOOGLE_DEFAULTS = {
  meet: { interval: "1 hour", backfillDepth: "unbounded" },
  drive: { interval: "1 hour", backfillDepth: "0" },
} as const;

/** Both flows share one client secret, so the state and the sealed cookie are keyed per source. */
export const stateSecret = (secret: string, source: GoogleSource) => `${source}:${secret}`;
export const googleStatePath = (source: GoogleSource) => `/api/oauth/${source}`;
export const googleStateCookie = (source: GoogleSource) => `${source}_oauth_state`;
export const googlePickPath = (source: GoogleSource) => `/api/oauth/${source}/pick`;
export const googlePickCookie = (source: GoogleSource) => `${source}_pick`;
const sealLabel = (source: GoogleSource) => `google-pick:${source}:v1`;

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent: Google only returns a refresh token on the first consent unless forced.
    // The worker runs unattended, so a grant without one is useless.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTHORIZE}?${query.toString()}`;
}

export type GoogleTokenResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; reason: "http_error" | "malformed" | "no_refresh_token" | "scope_missing"; detail?: string };

/** Turns the token endpoint's response into a token or a refusal. Never echoes the body. */
export function handleGoogleToken(status: number, body: unknown): GoogleTokenResult {
  if (status < 200 || status >= 300) return { ok: false, reason: "http_error", detail: `HTTP ${status}` };
  const p = body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown } | null;
  const accessToken = typeof p?.access_token === "string" ? p.access_token.trim() : "";
  const refreshToken = typeof p?.refresh_token === "string" ? p.refresh_token.trim() : "";
  if (!accessToken) return { ok: false, reason: "malformed" };
  // No refresh token = an unattended worker could never renew: refuse rather than store a row that dies in an hour.
  if (!refreshToken) return { ok: false, reason: "no_refresh_token" };
  // Google's granular consent lets the owner untick a scope. When it reports what was granted, all of ours must be there.
  if (typeof p?.scope === "string") {
    const granted = p.scope.split(/\s+/);
    if (!GOOGLE_SCOPES.every((s) => granted.includes(s))) return { ok: false, reason: "scope_missing" };
  }
  // Bounded so `new Date(Date.now() + expiresIn * 1000).toISOString()` can never throw downstream.
  const raw = p?.expires_in;
  const expiresIn = raw === undefined ? 3600 : raw;
  if (typeof expiresIn !== "number" || !Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn > 86400 * 7) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, accessToken, refreshToken, expiresIn };
}

/** `code` -> tokens. Client credentials go in the body (Google accepts that). `fetchImpl` is injectable. */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<GoogleTokenResult> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return handleGoogleToken(response.status, await response.json().catch(() => null));
}

export type FolderCheck = { ok: true } | { ok: false; reason: "http_error" | "not_a_folder"; detail?: string };

/**
 * The analogue of chooseOption: never write an id the token cannot see. Asks Drive, as the owner's own
 * token, for the picked id and requires a folder. The id reaches the URL only after the caller's FOLDER_ID regex.
 */
export async function verifyFolder(accessToken: string, folderId: string, fetchImpl: typeof fetch = fetch): Promise<FolderCheck> {
  const response = await fetchImpl(`${GOOGLE_FILES_URL}/${encodeURIComponent(folderId)}?fields=id,mimeType`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status < 200 || response.status >= 300) return { ok: false, reason: "http_error", detail: `HTTP ${response.status}` };
  const body = (await response.json().catch(() => null)) as { id?: unknown; mimeType?: unknown } | null;
  return body?.mimeType === FOLDER_MIME && body.id === folderId ? { ok: true } : { ok: false, reason: "not_a_folder" };
}

/** The one api.connect_source call the pick step makes. NO oauth_client_secret anywhere. */
export function connectArgs(
  source: GoogleSource,
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  folderId: string,
  clientId: string
) {
  return {
    p_source: source,
    p_kind: GOOGLE_TOKEN_KIND,
    p_secret: accessToken,
    p_refresh_secret: refreshToken,
    p_expires_at: expiresAt,
    p_config: { folder_id: folderId, oauth_client_id: clientId },
    p_interval: GOOGLE_DEFAULTS[source].interval,
    // api.connect_source runs `current_date - p_backfill_depth::interval` (20260924000200_quickbooks_connect_config.sql),
    // which rejects the worker's "unbounded". 100 years reaches before 1970, as onboard.ts backfillFrom does.
    p_backfill_depth: GOOGLE_DEFAULTS[source].backfillDepth === "unbounded" ? "100 years" : GOOGLE_DEFAULTS[source].backfillDepth,
  };
}

/* ------------------------------------------- sealed callback -> pick hand-off */

/** Carried from /callback to /pick, AES-GCM sealed in an httpOnly cookie scoped to the pick path. */
export interface PendingGoogle {
  /** The tenant the state named; /pick writes only for that tenant's owner. */
  clientId: string;
  accessToken: string;
  refreshToken: string;
  /** ISO time the access token dies, fixed at exchange time. */
  expiresAt: string;
  exp: number;
}

export function sealGoogle(pending: Omit<PendingGoogle, "exp">, secret: string, source: GoogleSource, now: number = Date.now()): string {
  return seal(pending, stateSecret(secret, source), sealLabel(source), PICK_TTL_MS, now);
}

export type OpenGoogleResult = { ok: true; pending: PendingGoogle } | { ok: false; reason: "malformed" | "expired" };

export function openGoogle(sealed: unknown, secret: string, source: GoogleSource, now: number = Date.now()): OpenGoogleResult {
  const opened = unseal(sealed, stateSecret(secret, source), sealLabel(source), now);
  if (!opened.ok) return opened;
  const p = opened.value as unknown as PendingGoogle;
  const str = (v: unknown) => typeof v === "string" && v !== "";
  if (!str(p.clientId) || !str(p.accessToken) || !str(p.refreshToken) || !str(p.expiresAt)) return { ok: false, reason: "malformed" };
  return { ok: true, pending: p };
}
