/**
 * quickbooks-oauth.ts — QuickBooks Online handshake as pure functions.
 *
 * Intuit sends no HMAC on the callback, so the signed state (lib/oauth-state.ts)
 * is the only CSRF defense, same as Monday. Unlike Monday/Meta there is no
 * picker: the callback's query string already carries `realmId` (QuickBooks'
 * numeric company id) — no board/account list to fetch, no extra API call.
 *
 * What the worker reads (platform/worker/src/connectors/quickbooks.ts):
 *   token  — source_tokens.secret, kind `quickbooks_oauth_refresh`, sent as a
 *            Bearer access token (60 min); refresh_secret rotates roughly every
 *            24-26 hours, valid up to 5 years with continued use (Intuit's Nov
 *            2025 policy change from a fixed 100-day life rotated per-use)
 *   config — `realm_id` (required by configSchema)
 */

export const QUICKBOOKS_AUTHORIZE = "https://appcenter.intuit.com/connect/oauth2";
export const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QUICKBOOKS_SCOPES = ["com.intuit.quickbooks.accounting"] as const;
/** `data.token_kind`; mirrors `quickbooks.tokenKind`. */
export const QUICKBOOKS_TOKEN_KIND = "quickbooks_oauth_refresh";
/** Mirrors `quickbooks.defaults`; tests fail if they drift. */
export const QUICKBOOKS_DEFAULTS = { interval: "1 hour", backfillDepth: "24 months" } as const;
/** Kept in the lib file, not a route.ts: Next's App Router only allows HTTP-method exports there. */
export const QUICKBOOKS_STATE_COOKIE = "quickbooks_oauth_state";

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QUICKBOOKS_SCOPES.join(" "),
    state,
  });
  return `${QUICKBOOKS_AUTHORIZE}?${query.toString()}`;
}

export type QuickbooksTokenResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; reason: "http_error" | "malformed"; detail?: string };

/** Turns the token endpoint's response into a token or a refusal. Never echoes the body. */
export function handleQuickbooksToken(status: number, body: unknown): QuickbooksTokenResult {
  if (status < 200 || status >= 300) return { ok: false, reason: "http_error", detail: `HTTP ${status}` };
  const p = body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown } | null;
  const accessToken = typeof p?.access_token === "string" ? p.access_token.trim() : "";
  const refreshToken = typeof p?.refresh_token === "string" ? p.refresh_token.trim() : "";
  if (!accessToken || !refreshToken) return { ok: false, reason: "malformed" };
  const expiresIn = typeof p?.expires_in === "number" && p.expires_in > 0 ? p.expires_in : 3600;
  return { ok: true, accessToken, refreshToken, expiresIn };
}

/** HTTP Basic client_id:client_secret — Intuit's token endpoint takes no client creds in the body. */
export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

/** `code` → tokens. The one network call this flow needs; `fetchImpl` is injectable for tests. */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<QuickbooksTokenResult> {
  const response = await fetchImpl(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuth(clientId, clientSecret),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return handleQuickbooksToken(response.status, await response.json().catch(() => null));
}

export const scheduleConfig = (realmId: string): Record<string, string> => ({ realm_id: realmId });

/** The one api.connect_source call the callback makes. QuickBooks rotates the refresh token every use. */
export function connectArgs(accessToken: string, refreshToken: string, expiresAt: string, realmId: string) {
  return {
    p_source: "quickbooks",
    p_kind: QUICKBOOKS_TOKEN_KIND,
    p_secret: accessToken,
    p_config: scheduleConfig(realmId),
    p_interval: QUICKBOOKS_DEFAULTS.interval,
    p_backfill_depth: QUICKBOOKS_DEFAULTS.backfillDepth,
    p_refresh_secret: refreshToken,
    p_expires_at: expiresAt,
  };
}
