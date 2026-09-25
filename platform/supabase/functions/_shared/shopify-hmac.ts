/**
 * shopify-hmac.ts — the shopify-shop-redact Edge Function's OWN HMAC check, independent of
 * apps/connect's. It must reach the same verdict as apps/connect/lib/shopify-oauth.ts's
 * verifyWebhookHmac (base64 HMAC-SHA256 over the raw body bytes, constant-time compare, fail
 * closed on a missing header or secret) — see platform/test's parity test — without importing
 * that file, which pulls in `next/server` and does not belong in a Deno function.
 *
 * WebCrypto (`crypto.subtle`), not node:crypto: this file runs unmodified in Deno (the deployed
 * function) and under vitest on Node (both expose WebCrypto as a global), so it needs no mock to
 * test. Pure: no Deno globals, no imports, same as _shared/guard.ts.
 */

const encoder = new TextEncoder();

async function hmacSha256Base64(secret: string, body: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, body);
  let binary = "";
  for (const byte of new Uint8Array(sig)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Fixed-width digest compare (SubtleCrypto has no timingSafeEqual) — same trick as safeEqual in shopify-oauth.ts. */
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

/**
 * `rawBody` must be the exact wire bytes (`await request.arrayBuffer()`), never a re-decoded or
 * re-serialized string — Shopify signs those bytes. Fails closed on a missing header or secret.
 */
export async function verifyShopifyHmac(rawBody: Uint8Array<ArrayBuffer>, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  return safeEqual(header, await hmacSha256Base64(secret, rawBody));
}
