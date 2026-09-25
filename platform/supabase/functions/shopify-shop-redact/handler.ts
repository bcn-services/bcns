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
 */

import { verifyShopifyHmac } from "../_shared/shopify-hmac.ts";

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
/** Generous but bounded — Shopify's webhook ids are UUIDs; this only stops an absurd header. */
const MAX_WEBHOOK_ID_LEN = 200;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export interface ShopRedactDeps {
  /** Insert one row via api.record_shop_redact; `inserted: false` means the webhook id already existed (idempotent replay). */
  recordShopRedact(shop: string, webhookId: string): Promise<{ inserted: boolean }>;
  /** Shop + webhook id + outcome ONLY — never the payload, the HMAC header, or the secret. */
  log(event: string, data: Record<string, unknown>): void;
}

export async function handle(request: Request, secret: string | undefined, deps: ShopRedactDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Auth first: verify over the raw bytes before anything else is trusted, including the body's shape.
  const bodyBytes = new Uint8Array(await request.arrayBuffer());
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!(await verifyShopifyHmac(bodyBytes, hmacHeader, secret ?? ""))) {
    deps.log("shop_redact_rejected", { reason: "bad_or_missing_hmac" });
    return json({ error: "unauthorized" }, 401);
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
  const bodyShop = (parsed as { shop_domain?: unknown } | null)?.shop_domain;
  const shop = typeof bodyShop === "string" ? bodyShop.trim().toLowerCase() : "";
  if (!SHOP_DOMAIN.test(shop)) {
    deps.log("shop_redact_rejected", { reason: "bad_shop_domain" });
    return json({ error: "bad_request" }, 400);
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
