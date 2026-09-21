/**
 * oauth-state.ts — signed handshake state for the Meta and Monday flows.
 *
 * A copy of the Shopify pattern (lib/shopify-oauth.ts), minus the shop binding:
 * neither source names a tenant-side host, so the state binds the tenant only.
 * Copied rather than shared so the Shopify files stay untouched.
 *
 * The signature is domain-separated with `state:` for the same reason as
 * Shopify's (W5a finding 1): Meta's `signed_request` is HMAC-SHA256 under the
 * SAME app secret, so an unprefixed state signature could be re-encoded into a
 * valid `signed_request`. A base64url body can never start with `state:`.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
