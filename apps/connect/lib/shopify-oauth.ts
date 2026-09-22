/**
 * shopify-oauth.ts — the whole Shopify handshake as pure functions.
 *
 * Nothing here touches process.env, the network, the clock (unless you pass it
 * one) or Next. The routes are thin wrappers; every security decision lives in
 * this file so tests/shopify-oauth.test.mjs can exercise it without a server,
 * a database or a Shopify account.
 *
 * Three separate signatures are in play and they are NOT interchangeable:
 *  1. OUR state — we mint it at /start and verify it at /callback. Proves the
 *     handshake began on our side, for this shop, recently. Hex HMAC.
 *  2. SHOPIFY'S query hmac — on the /callback redirect. Signed over the sorted
 *     query string minus `hmac` itself. Hex HMAC.
 *  3. SHOPIFY'S webhook hmac — `X-Shopify-Hmac-Sha256` over the RAW request
 *     body. BASE64, not hex. Getting this one wrong fails closed and looks
 *     like a Shopify outage, so it has its own test.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { seal, unseal } from "./oauth-state";
import type { HubConfig } from "./env"; // sb-bridge: remove after SB migrates to bcns Connect

/** Shopify's Admin API OAuth endpoints live on the shop's own domain. */
export const SHOPIFY_INSTALL_PATH = "/admin/oauth/authorize";
export const SHOPIFY_TOKEN_PATH = "/admin/oauth/access_token";

/**
 * The eight scopes the app requests, identical to SHOPIFY_SCOPES in
 * platform/scripts/checklist.ts. The checklist REFUSES a token missing any of
 * them, so a token minted here with a shorter list would onboard and then fail
 * the §9 check. chunk5-dashboard-steps.md §"Action for W1" keeps read_inventory
 * until a narrowed install proves it unnecessary against a real store.
 *
 * read_shopify_payments_accounts is load-bearing and was missing until W3. The
 * first install that authenticated far enough to run Q_PAYOUTS
 * (worker/src/connectors/shopify.ts) came back ACCESS_DENIED on 2026-09-19:
 * "Access denied for shopifyPaymentsAccount field. Required access: the
 * `read_shopify_payments` or the `read_shopify_payments_accounts` access
 * scope." read_shopify_payments_payouts does NOT open that root field —
 * Shopify grants it without complaint, which is why the gap survived review.
 * Both are kept: the accounts scope opens shopifyPaymentsAccount, and the
 * payouts scope is the documented one for the payouts connection under it. An
 * install with one of them dropped would settle which is strictly required.
 */
export const SHOPIFY_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_inventory",
  "read_shopify_payments_accounts",
  "read_shopify_payments_payouts",
  "read_reports",
  "read_customers",
] as const;

/** Five minutes: long enough for a consent screen, short enough that a leaked URL is dead. */
export const STATE_TTL_MS = 5 * 60 * 1000;

/**
 * A shop domain we are willing to redirect a browser to. Shopify sends `shop`
 * on the callback and we send it on /start, so an unvalidated value is an open
 * redirect AND a way to point the token exchange at an attacker's host. Only
 * `<handle>.myshopify.com` — the canonical form — is accepted; a custom storefront
 * domain is never the OAuth host.
 */
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Normalise anything an operator or a query param might carry into the
 * canonical `<handle>.myshopify.com`, or null if it cannot be one.
 *
 * Deliberately stricter than shopHandle() in worker/src/connectors/shopify-url.ts:
 * that one is a convenience for a trusted operator typing into a CLI prompt,
 * this one is a trust boundary for a value an attacker controls.
 */
export function normalizeShop(value: unknown): string | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (!raw) return null;
  const domain = raw.includes(".") ? raw : `${raw}.myshopify.com`;
  return SHOP_DOMAIN.test(domain) ? domain : null;
}

/** Compare two strings without leaking where they diverge. Length-safe. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a leak;
  // hashing both sides first makes every comparison fixed-width.
  const h = (buf: Buffer) => createHmac("sha256", "cmp").update(buf).digest();
  return timingSafeEqual(h(left), h(right));
}

export interface StatePayload {
  shop: string;
  /** The client the signed-in member belongs to. Bound into the state so the
   * callback cannot be replayed into a different tenant. INSTALL_CLIENT_ID when
   * Shopify started the handshake and nobody is signed in yet. */
  clientId: string;
  /** Epoch ms. */
  exp: number;
  /** Replay/CSRF nonce. */
  nonce: string;
}

/**
 * Domain separation for OUR state signature.
 *
 * All three signatures in this file are HMAC-SHA256 under the SAME key — the
 * app's client secret — because Shopify signs the callback query and the
 * webhooks with it and we do not get to choose. Encoding is not a boundary:
 * hex and base64 are the same digest bytes rendered two ways. Without this
 * prefix, the hex state signature re-encoded to base64 is a VALID
 * `X-Shopify-Hmac-Sha256` for the state body, and /start hands any owner one
 * on request — so an owner could forge a `shop/redact` webhook and make the
 * operator erase a client's data on a fake 48-hour notice (W5a finding 1).
 *
 * `state:` closes it because a `signState` caller controls only the base64url
 * body, and a base64url string can never start with `state:` — the alphabet
 * has no `:`. The state HMAC is the one of the three that is entirely ours,
 * so it is the one that gets the tag.
 */
function stateSignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`state:${body}`).digest("hex");
}

/**
 * `<base64url(json)>.<hex hmac>`. Signed, not encrypted: none of the three
 * fields is a secret, and a reader who tampers invalidates the signature.
 */
export function signState(
  payload: Omit<StatePayload, "exp" | "nonce">,
  secret: string,
  now: number = Date.now(),
  nonce: string = randomBytes(16).toString("hex")
): string {
  const full: StatePayload = { ...payload, exp: now + STATE_TTL_MS, nonce };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${stateSignature(body, secret)}`;
}

export type StateResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "shop_mismatch" };

/**
 * Verify in this order: shape, signature, expiry, shop binding. Signature
 * before expiry on purpose — an unsigned blob's `exp` is attacker-chosen, so
 * reading it first would be trusting the thing we have not authenticated yet.
 */
export function verifyState(
  state: unknown,
  secret: string,
  expectedShop: string,
  now: number = Date.now()
): StateResult {
  const parts = String(state ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, signature] = parts;

  const expected = stateSignature(body, secret);
  if (!safeEqual(signature, expected)) return { ok: false, reason: "bad_signature" };

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload?.exp !== "number" || typeof payload?.shop !== "string" || typeof payload?.clientId !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp < now) return { ok: false, reason: "expired" };
  if (payload.shop !== expectedShop) return { ok: false, reason: "shop_mismatch" };
  return { ok: true, payload };
}

/**
 * Shopify's signature on the callback query string: sort the params, drop
 * `hmac`, join `k=v` with `&`, HMAC-SHA256 with the app's client secret, hex.
 *
 * `signature` (the legacy proxy param) is NOT excluded — current Shopify docs
 * exclude only `hmac`, and dropping an extra field would make a valid callback
 * fail. Anything Shopify sends is signed; anything an attacker adds breaks it.
 */
export function verifyQueryHmac(params: URLSearchParams, secret: string): boolean {
  const provided = params.get("hmac");
  if (!provided) return false;
  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac")
    .map(([key, value]) => [key, value] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return safeEqual(provided, createHmac("sha256", secret).update(message).digest("hex"));
}

/**
 * How old an install query's `timestamp` may be. The query HMAC never expires,
 * so without this a leaked app-URL hit (history, a proxy log, a Referer) starts
 * a fresh handshake forever. Shopify signs the URL as the admin opens the app
 * and the browser follows at once, so five minutes (the state's own TTL) is
 * slack for a slow load, not a working window. 90 s the other way is the clock
 * tolerance Shopify's own API library allows. Install path only: the callback
 * is already bounded by our state's expiry, which its HMAC also covers.
 */
export const INSTALL_TIMESTAMP_MAX_AGE_MS = 5 * 60 * 1000;
const INSTALL_TIMESTAMP_SKEW_MS = 90 * 1000;

/** `timestamp` is epoch seconds. Missing, non-numeric or outside the window is false. */
export function isFreshInstallTimestamp(value: unknown, now: number = Date.now()): boolean {
  const raw = String(value ?? "");
  if (!/^\d{1,12}$/.test(raw)) return false;
  const at = Number(raw) * 1000;
  return at <= now + INSTALL_TIMESTAMP_SKEW_MS && now - at <= INSTALL_TIMESTAMP_MAX_AGE_MS;
}

/**
 * Webhook signature: BASE64 HMAC-SHA256 over the raw body bytes. The body must
 * be the bytes as received — re-serialising parsed JSON changes whitespace and
 * key order and the signature stops matching.
 */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  return safeEqual(header, createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
}

/** Where the browser goes to see the consent screen. */
export function installUrl(shop: string, clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES.join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}${SHOPIFY_INSTALL_PATH}?${query.toString()}`;
}

export interface TokenExchange {
  accessToken: string;
  /** Shopify echoes what it actually granted, which can be narrower than we asked. */
  scopes: string[];
  /** Seconds the access token is valid for. Shopify sends 3600. */
  expiresIn: number;
  /**
   * The 90-day refresh token that comes with every expiring access token.
   * Stored as p_refresh_secret (20260919000100_connect_source_refresh.sql); the
   * worker's shopify connector trades it for a new hour of access every tick.
   * Shopify rotates it on every refresh, so the row's copy is replaced too.
   */
  refreshToken: string;
}

export type ExchangeResult =
  | { ok: true; token: TokenExchange }
  | {
      ok: false;
      reason: "http_error" | "malformed" | "missing_scopes" | "not_expiring" | "network_error";
      detail?: string;
    };

/**
 * Turn Shopify's token response into either a token or a refusal.
 *
 * The missing-scopes check is the one that earns its keep: a merchant can be
 * shown a consent screen for seven scopes and land on a plan that grants six.
 * Storing that token would onboard cleanly and then fail the §9 checklist at
 * the first worker run, which reads as a connector bug rather than a missing
 * permission. Better to refuse here and say which scope is absent.
 */
export function handleTokenResponse(status: number, body: unknown): ExchangeResult {
  if (status < 200 || status >= 300) return { ok: false, reason: "http_error", detail: `HTTP ${status}` };

  const payload = body as {
    access_token?: unknown; scope?: unknown; expires_in?: unknown; refresh_token?: unknown;
  } | null;
  const accessToken = typeof payload?.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) return { ok: false, reason: "malformed" };

  const scopes = typeof payload?.scope === "string" ? payload.scope.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const missing = SHOPIFY_SCOPES.filter((s) => !scopes.includes(s));
  if (missing.length) return { ok: false, reason: "missing_scopes", detail: missing.join(",") };

  /**
   * An expiring token is not optional any more. Shopify answered the Admin API
   * with HTTP 403 "Non-expiring access tokens are no longer accepted" on
   * 2026-09-19, and public apps must be off them entirely by 2027-01-01.
   * `expiring: "1"` on the exchange (callback/route.ts) is what asks for one,
   * and `expires_in` is the only proof Shopify honoured it. Refuse here rather
   * than store a token that installs cleanly and 403s on the first worker run —
   * that failure reads as a connector bug and costs a debugging session.
   */
  const expiresIn = typeof payload?.expires_in === "number" ? payload.expires_in : 0;
  const refreshToken = typeof payload?.refresh_token === "string" ? payload.refresh_token.trim() : "";
  if (expiresIn <= 0) return { ok: false, reason: "not_expiring", detail: "no expires_in" };

  return { ok: true, token: { accessToken, scopes, expiresIn, refreshToken } };
}

/**
 * The `config` for the connector_schedule row. Mirrors what an operator types
 * at add-source's prompts (`shop`, `admin_url` — PROMPTS.shopify in
 * platform/scripts/onboard.ts). `currency` and `store_timezone` are left to the
 * worker: the §9 checklist fills them from the shop object on the CLI path, and
 * shopify.ts's configSchema marks both optional.
 */
export function scheduleConfig(shop: string, app?: string): Record<string, string> {
  const config = { shop, admin_url: `https://admin.shopify.com/store/${shop.split(".")[0]}` };
  return app ? { ...config, app } : config; // sb-bridge: remove after SB migrates to bcns Connect
}

// sb-bridge: remove after SB migrates to bcns Connect
/** `config.app` on a connection the bcns-data app issued; the worker refreshes by it. */
export const ALT_APP = "bcns-data"; // sb-bridge: remove after SB migrates to bcns Connect

/**
 * The credential pair for one shop. SB (SHOPIFY_ALT_SHOP) installs the
 * bcns-data custom app until bcns Connect is approved; every other shop, and
 * every shop when any ALT var is unset, gets the default pair. Callers gate on
 * oauthEnabled first, so the default pair is set whenever this runs.
 * sb-bridge: remove after SB migrates to bcns Connect
 */
export function shopifyAppFor(
  config: HubConfig,
  shop: string | null
): { clientId: string; clientSecret: string; app?: string } {
  const { shopifyAltShop: altShop, shopifyAltClientId: altId, shopifyAltClientSecret: altSecret } = config; // sb-bridge: remove after SB migrates to bcns Connect
  if (altShop && altId && altSecret && shop !== null && shop === normalizeShop(altShop)) {
    return { clientId: altId, clientSecret: altSecret, app: ALT_APP }; // sb-bridge: remove after SB migrates to bcns Connect
  }
  // Non-null: oauthEnabled(config, "shopify") requires both before any caller gets here.
  return { clientId: config.shopifyClientId!, clientSecret: config.shopifyClientSecret! };
}

/**
 * The connector's own defaults, mirrored from `shopify.defaults` in
 * platform/worker/src/connectors/shopify.ts (the `interval` and `backfillDepth`
 * fields). Mirrored rather than imported: apps/connect does not depend on
 * `platform/`, and adding that dependency to read two string literals would drag
 * the worker's zod schemas and the whole connector registry into the hub's
 * bundle. tests/shopify-oauth.test.mjs reads the connector file and fails if
 * these two drift, which is the cheap half of an import.
 */
export const SHOPIFY_DEFAULTS = { interval: "1 hour", backfillDepth: "13 months" } as const;

/** `data.token_kind` for a Shopify Admin token; mirrors `shopify.tokenKind`. */
export const SHOPIFY_TOKEN_KIND = "shopify_admin";

/**
 * Install-initiated handshakes (W6a). Shopify's review installs from the admin:
 * the browser arrives at the app URL with `shop`/`hmac`/`timestamp` and no bcns
 * session, and Shopify requires OAuth to start immediately. So /start runs the
 * handshake on Shopify's query HMAC alone, with no tenant in the state, and the
 * callback parks the token in a sealed cookie instead of writing it. /finish
 * binds it only once an OWNER is signed in. A shop is never bound to a tenant
 * without one.
 */
export const INSTALL_CLIENT_ID = "";

/** Where every handshake ends; the only `next` the login page will follow. */
export const FINISH_PATH = "/api/oauth/shopify/finish";

/** Cookie that carries a sealed PendingConnection from /callback to /finish. */
export const PENDING_COOKIE = "shopify_pending";

/** Long enough to sign in; an owner with no account yet reopens the app from Shopify. */
export const PENDING_TTL_MS = 15 * 60 * 1000;

export interface PendingConnection {
  /** The tenant the state named, or INSTALL_CLIENT_ID for an install-initiated handshake. */
  clientId: string;
  shop: string;
  app?: string; // sb-bridge: remove after SB migrates to bcns Connect
  accessToken: string;
  refreshToken: string;
  /** ISO time the access token dies, fixed at exchange time. */
  expiresAt: string;
  /** Epoch ms the cookie stops being honoured. */
  exp: number;
}

/**
 * Sealed with lib/oauth-state.ts (AES-256-GCM, key derived from the client
 * secret under this label): the payload IS the access and refresh token.
 */
const PENDING_LABEL = "pending-connection:v1";

export function sealPending(
  pending: Omit<PendingConnection, "exp">,
  secret: string,
  now: number = Date.now()
): string {
  return seal(pending, secret, PENDING_LABEL, PENDING_TTL_MS, now);
}

export type PendingResult =
  | { ok: true; pending: PendingConnection }
  | { ok: false; reason: "malformed" | "expired" | "tenant_mismatch" };

/**
 * Open the cookie for the signed-in owner of `clientId`. A state minted for a
 * tenant binds only to that tenant; an install-initiated one binds to whichever
 * owner signs in, in the browser that ran the handshake.
 */
export function openPending(
  sealed: unknown,
  secret: string,
  clientId: string,
  now: number = Date.now()
): PendingResult {
  const opened = unseal(sealed, secret, PENDING_LABEL, now);
  if (!opened.ok) return opened;
  const pending = opened.value as unknown as PendingConnection;
  if (typeof pending.clientId !== "string" || !normalizeShop(pending.shop)) return { ok: false, reason: "malformed" };
  if (pending.clientId !== INSTALL_CLIENT_ID && pending.clientId !== clientId) return { ok: false, reason: "tenant_mismatch" };
  return { ok: true, pending };
}
