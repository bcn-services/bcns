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

import type { PickOption } from "./oauth-state";

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

/** Up to 25 active boards the token can read, with names for the picker. */
export const BOARDS_QUERY = "{ boards(limit: 25, state: active, order_by: created_at) { id name } }";

/**
 * Every board the token returned. The callback connects the only one, or makes
 * the owner choose; it never guesses (W5b #1). Names are cut short to keep the
 * sealed picker cookie under the browser's 4 KB limit.
 */
export function listBoards(body: unknown): PickOption[] {
  const boards = (body as { data?: { boards?: unknown } } | null)?.data?.boards;
  if (!Array.isArray(boards)) return [];
  const out: PickOption[] = [];
  for (const b of boards as { id?: unknown; name?: unknown }[]) {
    const id = typeof b?.id === "string" || typeof b?.id === "number" ? String(b.id) : "";
    if (!/^\d+$/.test(id)) continue;
    out.push({ id, name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 40) : id });
  }
  return out;
}

export const scheduleConfig = (boardId: string): Record<string, string> => ({ board_id: boardId });

/** The one api.connect_source call, shared by /callback and /pick. Monday tokens do not expire. */
export function connectArgs(accessToken: string, boardId: string) {
  return {
    p_source: "monday",
    p_kind: MONDAY_TOKEN_KIND,
    p_secret: accessToken,
    p_config: scheduleConfig(boardId),
    p_interval: MONDAY_DEFAULTS.interval,
    p_backfill_depth: MONDAY_DEFAULTS.backfillDepth,
  };
}
