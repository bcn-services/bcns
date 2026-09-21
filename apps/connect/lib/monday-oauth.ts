/**
 * monday-oauth.ts — Monday.com handshake as pure functions.
 *
 * Monday sends no HMAC on the callback, so the signed state (lib/oauth-state.ts)
 * is the only CSRF defense; the callback must verify it before anything else.
 *
 * What the worker reads (platform/worker/src/connectors/monday.ts):
 *   token  — source_tokens.secret, kind `monday_personal`, sent as the raw
 *            Authorization header (no Bearer)
 *   config — `board_id` (required by configSchema); columns/done_statuses default
 */

export const MONDAY_AUTHORIZE = "https://auth.monday.com/oauth2/authorize";
export const MONDAY_TOKEN_URL = "https://auth.monday.com/oauth2/token";
export const MONDAY_API = "https://api.monday.com/v2";
export const MONDAY_SCOPES = ["boards:read", "me:read"] as const;
/** `data.token_kind`; mirrors `monday.tokenKind`. */
export const MONDAY_TOKEN_KIND = "monday_personal";
/** Mirrors `monday.defaults`; tests fail if they drift. */
export const MONDAY_DEFAULTS = { interval: "1 hour", backfillDepth: "0" } as const;

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: MONDAY_SCOPES.join(" "),
    state,
  });
  return `${MONDAY_AUTHORIZE}?${query.toString()}`;
}

export type MondayTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "http_error" | "malformed"; detail?: string };

export function handleMondayToken(status: number, body: unknown): MondayTokenResult {
  if (status < 200 || status >= 300) return { ok: false, reason: "http_error", detail: `HTTP ${status}` };
  const t = (body as { access_token?: unknown } | null)?.access_token;
  const accessToken = typeof t === "string" ? t.trim() : "";
  return accessToken ? { ok: true, accessToken } : { ok: false, reason: "malformed" };
}

/** First board the token can read; the connector syncs exactly one. */
export function pickBoard(body: unknown): string | null {
  const boards = (body as { data?: { boards?: unknown } } | null)?.data?.boards;
  if (!Array.isArray(boards)) return null;
  for (const b of boards) {
    const id = (b as { id?: unknown })?.id;
    if ((typeof id === "string" || typeof id === "number") && /^\d+$/.test(String(id))) return String(id);
  }
  return null;
}

export const scheduleConfig = (boardId: string): Record<string, string> => ({ board_id: boardId });
