/**
 * meta-oauth.ts — the Meta Ads handshake and the data-deletion callback as pure
 * functions. Same rule as shopify-oauth.ts: no env, no network, no Next.
 *
 * What the worker reads (platform/worker/src/connectors/meta.ts):
 *   token  — source_tokens.secret, kind `meta_system_user`, sent as access_token
 *   config — `act_id` (required by configSchema), the rest filled by accountMeta()
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const META_GRAPH = "https://graph.facebook.com/v21.0";
export const META_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
export const META_SCOPES = ["ads_read"] as const;
/** `data.token_kind`; mirrors `meta.tokenKind`. */
export const META_TOKEN_KIND = "meta_system_user";
/** Mirrors `meta.defaults`; tests/meta-monday-oauth.test.mjs fails if they drift. */
export const META_DEFAULTS = { interval: "6 hours", backfillDepth: "13 months" } as const;

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: META_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `${META_DIALOG}?${query.toString()}`;
}

/** Client secret goes in a POST form body, never a URL a proxy or log could keep. */
export function codeExchangeBody(clientId: string, clientSecret: string, redirectUri: string, code: string): string {
  return new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }).toString();
}

export function longLivedBody(clientId: string, clientSecret: string, shortLivedToken: string): string {
  return new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  }).toString();
}

export type MetaTokenResult =
  | { ok: true; accessToken: string; /** Seconds; null when Meta sent none (non-expiring). */ expiresIn: number | null }
  | { ok: false; reason: "http_error" | "malformed"; detail?: string };

/** Turn either token response into a token or a refusal. Never echoes the body. */
export function handleMetaToken(status: number, body: unknown): MetaTokenResult {
  if (status < 200 || status >= 300) return { ok: false, reason: "http_error", detail: `HTTP ${status}` };
  const p = body as { access_token?: unknown; expires_in?: unknown } | null;
  const accessToken = typeof p?.access_token === "string" ? p.access_token.trim() : "";
  if (!accessToken) return { ok: false, reason: "malformed" };
  const expiresIn = typeof p?.expires_in === "number" && p.expires_in > 0 ? p.expires_in : null;
  return { ok: true, accessToken, expiresIn };
}

/** First ad account on the token, as `act_<id>`; the connector needs exactly one. */
export function pickAdAccount(body: unknown): string | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  for (const a of data) {
    const id = (a as { id?: unknown })?.id;
    if (typeof id === "string" && /^act_\d+$/.test(id)) return id;
  }
  return null;
}

export const scheduleConfig = (actId: string): Record<string, string> => ({
  act_id: actId,
  ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actId.slice(4)}`,
});

/* --------------------------------------------------------- data deletion */

const b64u = (s: string) => Buffer.from(s, "base64url");

export type SignedRequestResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "bad_algorithm" | "bad_signature" | "no_user" };

/**
 * Meta's `signed_request`: `<b64url(raw hmac)>.<b64url(json)>`, HMAC-SHA256 over
 * the ENCODED payload string with the app secret. Compared as raw digests with
 * timingSafeEqual; a wrong-length signature is rejected before the compare
 * because timingSafeEqual throws on a length mismatch.
 */
export function verifySignedRequest(signedRequest: unknown, secret: string): SignedRequestResult {
  const parts = String(signedRequest ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [sig, payloadB64] = parts;

  const expected = createHmac("sha256", secret).update(payloadB64, "utf8").digest();
  const provided = b64u(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: { algorithm?: unknown; user_id?: unknown };
  try {
    payload = JSON.parse(b64u(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (String(payload?.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return { ok: false, reason: "bad_algorithm" };
  const userId = typeof payload.user_id === "string" ? payload.user_id : typeof payload.user_id === "number" ? String(payload.user_id) : "";
  if (!/^\d+$/.test(userId)) return { ok: false, reason: "no_user" };
  return { ok: true, userId };
}

/**
 * Deterministic and unguessable: HMAC of the user id under the app secret, so a
 * status link needs no store and discloses nothing. `deletion:` keeps it a
 * different message space from state and signed_request signatures.
 */
export function confirmationCode(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`deletion:${userId}`).digest("hex").slice(0, 20);
}
