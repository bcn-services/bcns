/**
 * meta-oauth.ts — the Meta Ads handshake and the data-deletion callback as pure
 * functions. Same rule as shopify-oauth.ts: no env, no network, no Next.
 *
 * What the worker reads (platform/worker/src/connectors/meta.ts):
 *   token  — source_tokens.secret, kind `meta_system_user`, sent as access_token.
 *            Despite the kind's name this flow stores a ~60-day USER token, not a
 *            system-user one; `p_expires_at` records when it dies (W5b #7).
 *   config — `act_id` (required by configSchema), the rest filled by accountMeta()
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PickOption } from "./oauth-state";

export const META_GRAPH = "https://graph.facebook.com/v21.0";
export const META_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
export const META_SCOPES = ["ads_read"] as const;
/**
 * `data.token_kind`; mirrors `meta.tokenKind`. The label predates the OAuth flow:
 * the token is a long-lived user token (~60 days, expiry stored), not a
 * non-expiring system-user token. Renaming it needs an enum migration.
 */
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
  | { ok: true; accessToken: string; /** Seconds; null when Meta sent no `expires_in`. */ expiresIn: number | null }
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

/** Graph fields /me/adaccounts is asked for; account_status 1 is ACTIVE. */
export const AD_ACCOUNT_FIELDS = "id,name,account_status";

/**
 * Every ACTIVE ad account on the token, as `act_<id>`. Disabled and closed
 * accounts are dropped. The callback connects the only one, or makes the owner
 * choose; it never guesses (W5b #1). Names are cut short to keep the sealed
 * picker cookie under the browser's 4 KB limit.
 */
export function listAdAccounts(body: unknown): PickOption[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: PickOption[] = [];
  for (const a of data as { id?: unknown; name?: unknown; account_status?: unknown }[]) {
    if (typeof a?.id !== "string" || !/^act_\d+$/.test(a.id) || a.account_status !== 1) continue;
    out.push({ id: a.id, name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 40) : a.id });
  }
  return out;
}

export const scheduleConfig = (actId: string): Record<string, string> => ({
  act_id: actId,
  ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actId.slice(4)}`,
});

/** The one api.connect_source call, shared by /callback and /pick. */
export function connectArgs(accessToken: string, expiresAt: string | null, actId: string) {
  return {
    p_source: "meta",
    p_kind: META_TOKEN_KIND,
    p_secret: accessToken,
    p_config: scheduleConfig(actId),
    p_interval: META_DEFAULTS.interval,
    p_backfill_depth: META_DEFAULTS.backfillDepth,
    p_refresh_secret: null,
    p_expires_at: expiresAt,
  };
}

/* --------------------------------------------------------- data deletion */

const b64u = (s: string) => Buffer.from(s, "base64url");

export type SignedRequestResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "bad_algorithm" | "bad_signature" | "stale" | "no_user" };

/**
 * How old a signed_request's `issued_at` may be (W5b #2, the W5a #3 fix shape:
 * one comparison, no storage). Meta posts the deletion callback server-to-server
 * the moment a user removes the app, so an hour is slack for queueing and clock
 * drift while bounding how long a leaked body can be replayed to flood the
 * notification mailbox. Unlike Shopify's X-Shopify-Triggered-At, issued_at is
 * inside the signed payload, so a replayer cannot refresh it. Five minutes of
 * future skew covers clocks, and anything further ahead is not a real request.
 */
export const MAX_SIGNED_REQUEST_AGE_MS = 60 * 60 * 1000;
const SIGNED_REQUEST_SKEW_MS = 5 * 60 * 1000;

/**
 * Meta's `signed_request`: `<b64url(raw hmac)>.<b64url(json)>`, HMAC-SHA256 over
 * the ENCODED payload string with the app secret. Compared as raw digests with
 * timingSafeEqual; a wrong-length signature is rejected before the compare
 * because timingSafeEqual throws on a length mismatch.
 */
export function verifySignedRequest(signedRequest: unknown, secret: string, now: number = Date.now()): SignedRequestResult {
  const parts = String(signedRequest ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [sig, payloadB64] = parts;

  const expected = createHmac("sha256", secret).update(payloadB64, "utf8").digest();
  const provided = b64u(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: { algorithm?: unknown; user_id?: unknown; issued_at?: unknown };
  try {
    payload = JSON.parse(b64u(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (String(payload?.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return { ok: false, reason: "bad_algorithm" };
  // issued_at is epoch SECONDS. Missing or non-numeric is a reject, not a pass.
  if (typeof payload.issued_at !== "number" || !Number.isFinite(payload.issued_at)) return { ok: false, reason: "stale" };
  const age = now - payload.issued_at * 1000;
  if (age > MAX_SIGNED_REQUEST_AGE_MS || age < -SIGNED_REQUEST_SKEW_MS) return { ok: false, reason: "stale" };
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
