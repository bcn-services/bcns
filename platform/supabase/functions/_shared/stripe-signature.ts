/**
 * stripe-signature.ts — the stripe-webhook Edge Function's OWN `Stripe-Signature` check,
 * independent of packages/app-core/src/webhooks.ts (verifyStripeSignature), which the hub runs
 * first. Same rule, separate code, so one bug cannot open both doors: HMAC-SHA256 of
 * `${t}.${rawBody}` keyed with the `whsec_...` secret, any v1 may match, constant-time compare,
 * `t` within the tolerance of `now`, fail closed on anything missing or malformed.
 *
 * WebCrypto, like _shared/shopify-hmac.ts: runs unmodified in Deno and under vitest on Node.
 * Pure: no Deno globals, no imports.
 */

export const STRIPE_TOLERANCE_SEC = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, payload: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fixed-width digest compare (SubtleCrypto has no timingSafeEqual), as in shopify-hmac.ts. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const av = new Uint8Array(ah);
  const bv = new Uint8Array(bh);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

/** `rawBody` is the exact wire bytes; `now` is unix seconds. */
export async function verifyStripeSignature(
  rawBody: Uint8Array<ArrayBuffer>,
  header: string | null,
  secret: string,
  now: number,
  toleranceSec = STRIPE_TOLERANCE_SEC,
): Promise<boolean> {
  if (!secret || !header || header.length > 2048) return false;
  let t: number | null = null;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") t = /^\d{1,12}$/.test(value) ? Number(value) : null;
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) candidates.push(value);
  }
  if (t === null || candidates.length === 0) return false;
  if (Math.abs(now - t) > toleranceSec) return false;

  const prefix = encoder.encode(`${t}.`);
  const payload = new Uint8Array(prefix.byteLength + rawBody.byteLength);
  payload.set(prefix, 0);
  payload.set(rawBody, prefix.byteLength);
  const expected = await hmacHex(secret, payload);
  let ok = false;
  for (const candidate of candidates) if (await safeEqual(candidate, expected)) ok = true;
  return ok;
}
