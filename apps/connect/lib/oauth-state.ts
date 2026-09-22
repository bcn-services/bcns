/**
 * oauth-state.ts — signed handshake state for the Meta and Monday flows.
 *
 * A copy of the Shopify pattern (lib/shopify-oauth.ts), minus the shop binding:
 * neither source names a tenant-side host, so the state binds the tenant only.
 * The state is copied rather than shared; the sealed hand-off below IS shared,
 * with Shopify's pending cookie (lib/shopify-oauth.ts) built on it.
 *
 * The signature is domain-separated with `state:` for the same reason as
 * Shopify's (W5a finding 1): Meta's `signed_request` is HMAC-SHA256 under the
 * SAME app secret, so an unprefixed state signature could be re-encoded into a
 * valid `signed_request`. A base64url body can never start with `state:`.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const STATE_TTL_MS = 5 * 60 * 1000;

/** Compare two strings without leaking where they diverge. Length-safe. */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHmac("sha256", "cmp").update(s, "utf8").digest();
  return timingSafeEqual(h(a), h(b));
}

export interface StatePayload {
  /** Tenant the signed-in owner belongs to; the callback refuses any other. */
  clientId: string;
  /** Epoch ms. */
  exp: number;
  nonce: string;
}

function stateSignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`state:${body}`).digest("hex");
}

/** `<base64url(json)>.<hex hmac>`. Signed, not encrypted: nothing in it is secret. */
export function signState(
  clientId: string,
  secret: string,
  now: number = Date.now(),
  nonce: string = randomBytes(16).toString("hex")
): string {
  const full: StatePayload = { clientId, exp: now + STATE_TTL_MS, nonce };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${stateSignature(body, secret)}`;
}

export type StateResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** Shape, signature, then expiry: an unsigned blob's `exp` is attacker-chosen. */
export function verifyState(state: unknown, secret: string, now: number = Date.now()): StateResult {
  const parts = String(state ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, signature] = parts;
  if (!safeEqual(signature, stateSignature(body, secret))) return { ok: false, reason: "bad_signature" };

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload?.exp !== "number" || typeof payload?.clientId !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/* --------------------------------------------------- sealed hand-off cookie */

/**
 * AES-256-GCM, not just signed: a sealed value carries a live token. The key is
 * derived from the source's client secret under its own label, so a sealed
 * cookie is never an HMAC a state, webhook or signed_request check would take,
 * and one label's cookie never opens under another's.
 */
function sealKey(secret: string, label: string): Buffer {
  return createHmac("sha256", secret).update(label).digest();
}

export function seal(value: object, secret: string, label: string, ttlMs: number, now: number = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secret, label), iv, { authTagLength: 16 });
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...value, exp: now + ttlMs }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export type UnsealResult =
  | { ok: true; value: Record<string, unknown> & { exp: number } }
  | { ok: false; reason: "malformed" | "expired" };

/** Decrypt-and-authenticate, then expiry. The caller checks the shape of `value`. */
export function unseal(sealed: unknown, secret: string, label: string, now: number = Date.now()): UnsealResult {
  let value: Record<string, unknown> & { exp: number };
  try {
    const raw = Buffer.from(String(sealed ?? ""), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", sealKey(secret, label), raw.subarray(0, 12), { authTagLength: 16 });
    decipher.setAuthTag(raw.subarray(12, 28));
    value = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof value?.exp !== "number") return { ok: false, reason: "malformed" };
  if (value.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, value };
}

/* ------------------------------------------ account / board picker (W5b #1) */

export type PickSource = "meta" | "monday";

/** One ad account or board the provider returned for the token. */
export interface PickOption {
  id: string;
  name: string;
}

/**
 * Carried from /callback to /pick when the token can see more than one account
 * or board. `options` is the provider's answer for THIS token, sealed in the
 * same ciphertext as the token, so the owner's choice is checked against it.
 */
export interface PendingPick {
  /** The tenant the state named; /pick writes only for that tenant's owner. */
  clientId: string;
  accessToken: string;
  /** ISO time the token dies, fixed at exchange time; null when it does not. */
  expiresAt: string | null;
  options: PickOption[];
  exp: number;
}

/** Long enough to read a list and click once. */
export const PICK_TTL_MS = 10 * 60 * 1000;
export const pickPath = (source: PickSource) => `/api/oauth/${source}/pick`;
export const pickCookie = (source: PickSource) => `${source}_pick`;
const pickLabel = (source: PickSource) => `pick:${source}:v1`;

export function sealPick(pick: Omit<PendingPick, "exp">, secret: string, source: PickSource, now: number = Date.now()): string {
  return seal(pick, secret, pickLabel(source), PICK_TTL_MS, now);
}

export type PickResult = { ok: true; pick: PendingPick } | { ok: false; reason: "malformed" | "expired" };

export function openPick(sealed: unknown, secret: string, source: PickSource, now: number = Date.now()): PickResult {
  const opened = unseal(sealed, secret, pickLabel(source), now);
  if (!opened.ok) return opened;
  const p = opened.value as unknown as PendingPick;
  if (
    typeof p.clientId !== "string" || typeof p.accessToken !== "string" || !p.accessToken ||
    !Array.isArray(p.options) || !p.options.every((o) => typeof o?.id === "string" && typeof o?.name === "string")
  ) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, pick: p };
}

/**
 * The owner's choice, only if it is one of the ids the provider returned for
 * this token. The form value is never written as-is: the returned id is the
 * option's own, so nothing the browser sent reaches p_config.
 */
export function chooseOption(options: readonly PickOption[], chosen: unknown): string | null {
  return options.find((o) => o.id === chosen)?.id ?? null;
}

/* --------------------------------------------------- cross-site POST (W5b #3) */

/**
 * True for a request a third-party page made. Sec-Fetch-Site when the browser
 * sends it, else Origin (every browser sends it on a POST). Neither present is a
 * non-browser client, which carries no victim's session cookie.
 */
export function isCrossSite(headers: Headers, hubBaseUrl: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return true;
  const origin = headers.get("origin");
  return origin !== null && origin !== new URL(hubBaseUrl).origin;
}
