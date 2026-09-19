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

/** Shopify's Admin API OAuth endpoints live on the shop's own domain. */
export const SHOPIFY_INSTALL_PATH = "/admin/oauth/authorize";
export const SHOPIFY_TOKEN_PATH = "/admin/oauth/access_token";

/**
 * The seven scopes the app requests, identical to SHOPIFY_SCOPES in
 * platform/scripts/checklist.ts. The checklist REFUSES a token missing any of
 * them, so a token minted here with a shorter list would onboard and then fail
 * the §9 check. chunk5-dashboard-steps.md §"Action for W1" keeps all seven,
 * including read_inventory, until W3 proves it unnecessary against a real store.
 */
export const SHOPIFY_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_inventory",
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
   * callback cannot be replayed into a different tenant. */
  clientId: string;
  /** Epoch ms. */
  exp: number;
  /** Replay/CSRF nonce. */
  nonce: string;
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
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
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

  const expected = createHmac("sha256", secret).update(body).digest("hex");
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
   * Parsed but NOT stored yet: api.connect_source takes no p_refresh_secret /
   * p_expires_at (20260918000100_attach_source_rpc.sql), even though the
   * data.attach_source it wraps has both. Until that migration lands the row
   * holds an access token that dies in an hour and cannot be renewed.
   */
  refreshToken: string;
}

export type ExchangeResult =
  | { ok: true; token: TokenExchange }
  | { ok: false; reason: "http_error" | "malformed" | "missing_scopes" | "not_expiring"; detail?: string };

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
export function scheduleConfig(shop: string): Record<string, string> {
  return { shop, admin_url: `https://admin.shopify.com/store/${shop.split(".")[0]}` };
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
