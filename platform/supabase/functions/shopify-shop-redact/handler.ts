/**
 * shopify-shop-redact — queues a Shopify `shop/redact` webhook for the worker to act on
 * (docs/architecture/retention-30d-shop-redact.md). Pure `handle(req, secret, deps)`: every side
 * effect is a dep, so the whole policy is testable on node without Deno, without a database and
 * without the service-role key. index.ts is the only file that knows about Deno.
 *
 * No caller JWT: apps/connect/lib/shopify-webhook-route.ts forwards this AFTER its own HMAC check
 * already passed, but that trust is not extended here — this function re-verifies the HMAC itself
 * against the Supabase-side SHOPIFY_CLIENT_SECRET, because forwarding is the one hop where a bug
 * or a misrouted request must not turn into an unauthenticated delete queue. HMAC is the only
 * auth; there is deliberately no requireOwner/bearer check (see _shared/guard.ts) to bypass.
 *
 * It also takes `app/uninstalled` (App Store rule 1.2.2), forwarded by the same hub file through
 * the same URL: that webhook needs exactly this function's shape — no JWT, HMAC re-verified, one
 * narrow service-role RPC — so it is a second topic here rather than a second function, secret
 * and hub env var to deploy. The two topics cannot be confused: each reads its shop from a body
 * field the other's payload does not have (`shop_domain` vs the Shop object's `myshopify_domain`).
 */

import { verifyShopifyHmac } from "../_shared/shopify-hmac.ts";

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
/** Generous but bounded — Shopify's webhook ids are UUIDs; this only stops an absurd header. */
const MAX_WEBHOOK_ID_LEN = 200;
/** N2: a shop/redact body is a handful of fields; 64KB is generous but bounded either way. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export interface ShopRedactDeps {
  /** Insert one row via api.record_shop_redact; `inserted: false` means the webhook id already existed (idempotent replay). */
  recordShopRedact(shop: string, webhookId: string): Promise<{ inserted: boolean }>;
  /**
   * Revoke the shop's public-app connection via api.record_app_uninstalled; `revoked` is how many
   * rows changed (0: unknown shop, replay, or a reinstall newer than `triggeredAt`).
   */
  recordAppUninstalled(shop: string, triggeredAt: string): Promise<{ revoked: number }>;
  /** Shop + webhook id + outcome ONLY — never the payload, the HMAC header, or the secret. */
  log(event: string, data: Record<string, unknown>): void;
}

/**
 * N2: reads at most maxBytes off the wire regardless of what Content-Length claims — a header can
 * be absent, wrong, or bypassed via chunked transfer-encoding, so the real defense is capping the
 * bytes actually read, not trusting the header. Returns null (never a partial buffer) on overflow.
 */
async function readBodyCapped(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(await request.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function handle(request: Request, secret: string | undefined, deps: ShopRedactDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // N2 fast path: reject on the declared size before reading anything, when Shopify (or anyone
  // else) sends one. The actual read below is capped independently, since this header is never
  // trusted alone.
  const declaredLength = Number(request.headers.get("Content-Length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    deps.log("shop_redact_rejected", { reason: "payload_too_large" });
    return json({ error: "payload_too_large" }, 413);
  }

  // Auth first: verify over the raw bytes before anything else is trusted, including the body's shape.
  const bodyBytes = await readBodyCapped(request, MAX_BODY_BYTES);
  if (!bodyBytes) {
    deps.log("shop_redact_rejected", { reason: "payload_too_large" });
    return json({ error: "payload_too_large" }, 413);
  }
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!(await verifyShopifyHmac(bodyBytes, hmacHeader, secret ?? ""))) {
    deps.log("shop_redact_rejected", { reason: "bad_or_missing_hmac" });
    return json({ error: "unauthorized" }, 401);
  }

  // The HMAC covers the body only, so a validly signed customers/redact body (which also carries
  // shop_domain) would pass it. The topic header is unsigned, so this stops misrouted deliveries,
  // not a deliberate forger; the wall against that is the worker's dead-token guard.
  const topic = request.headers.get("X-Shopify-Topic");
  if (topic !== "shop/redact" && topic !== "app/uninstalled") {
    deps.log("shop_redact_rejected", { reason: "wrong_topic" });
    return json({ error: "bad_request" }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    deps.log("shop_redact_rejected", { reason: "malformed_body" });
    return json({ error: "bad_request" }, 400);
  }

  // The shop is bound from the HMAC-SIGNED body, never the unsigned X-Shopify-Shop-Domain header
  // — a caller cannot forge which shop it names without the secret this just verified against.
  const body = parsed as { shop_domain?: unknown; myshopify_domain?: unknown } | null;
  const bodyShop = topic === "app/uninstalled" ? body?.myshopify_domain : body?.shop_domain;
  const shop = typeof bodyShop === "string" ? bodyShop.trim().toLowerCase() : "";
  if (!SHOP_DOMAIN.test(shop)) {
    deps.log("shop_redact_rejected", { reason: "bad_shop_domain" });
    return json({ error: "bad_request" }, 400);
  }

  if (topic === "app/uninstalled") {
    // Unsigned like the webhook id below, and used only so a late delivery cannot revoke a
    // reinstall (data.revoke_shopify_install). Unparseable is a shaped-request problem: 400.
    const triggeredAt = request.headers.get("X-Shopify-Triggered-At") ?? "";
    if (triggeredAt.length > 64 || Number.isNaN(Date.parse(triggeredAt))) {
      deps.log("app_uninstalled_rejected", { reason: "bad_triggered_at", shop });
      return json({ error: "bad_request" }, 400);
    }
    const { revoked } = await deps.recordAppUninstalled(shop, new Date(triggeredAt).toISOString());
    deps.log("app_uninstalled_recorded", { shop, revoked });
    return json({ ok: true }, 200);
  }

  // Webhook id is an UNSIGNED header, required only for idempotency bookkeeping — a bad one is a
  // shaped-request problem (400), not an authentication failure (401), since the HMAC above is
  // what already proved this request came from Shopify.
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  if (!webhookId || webhookId.length > MAX_WEBHOOK_ID_LEN) {
    deps.log("shop_redact_rejected", { reason: "bad_webhook_id", shop });
    return json({ error: "bad_request" }, 400);
  }

  const result = await deps.recordShopRedact(shop, webhookId);
  deps.log("shop_redact_queued", { shop, webhookId, inserted: result.inserted });
  return json({ ok: true }, 200);
}
