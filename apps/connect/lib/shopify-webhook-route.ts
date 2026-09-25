/**
 * The shared body of all three GDPR webhook routes. One file per topic under
 * app/api/webhooks/shopify/ because Shopify registers a separate URL per topic;
 * everything they actually do is here.
 */

import { NextResponse } from "next/server";
import { getConfig } from "./env";
import { sendMail } from "./request-connection";
import { handleGdprWebhook, isFreshTriggeredAt, oneLine, type GdprTopic } from "./shopify-webhooks";

/** Forwarding is best-effort: any failure here falls back to the operator email. */
const FORWARD_TIMEOUT_MS = 5_000;

export interface GdprRouteDeps {
  fetchImpl?: typeof fetch;
}

/**
 * shop/redact only: hand the ALREADY-HMAC-VERIFIED raw bytes to the
 * shopify-shop-redact Edge Function, which re-verifies the HMAC itself before
 * writing anything (docs/architecture/retention-30d-shop-redact.md). Returns
 * true only on a 2xx — anything else (unset URL is checked by the caller,
 * network error, timeout, non-2xx) means "fall back to email".
 */
async function forwardShopRedact(
  url: string,
  rawBody: string,
  hmacHeader: string,
  webhookId: string | null,
  triggeredAt: string | null,
  fetchImpl: typeof fetch
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "X-Shopify-Hmac-Sha256": hmacHeader,
        ...(webhookId ? { "X-Shopify-Webhook-Id": webhookId } : {}),
        ...(triggeredAt ? { "X-Shopify-Triggered-At": triggeredAt } : {}),
      },
      // Forwarding the exact string handleGdprWebhook already verified the HMAC
      // over — this route already treats the body as text end to end (`.text()`
      // above `handleGdprWebhook`), so there is no separate "raw bytes" form to
      // preserve; re-encoding a JS string to UTF-8 is what produced the bytes
      // Shopify's signature covers in the first place.
      body: rawBody,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function gdprRoute(request: Request, topic: GdprTopic, deps: GdprRouteDeps = {}): Promise<NextResponse> {
  const config = getConfig();
  // No approval gate here: Shopify calls these DURING review, before the source
  // is ever listed in OAUTH_APPROVED_SOURCES. Only the secret matters.
  if (!config.shopifyClientSecret) {
    console.warn(`[connect] shopify webhook ${topic} rejected: no SHOPIFY_CLIENT_SECRET`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Freshness, independent of the HMAC. Missing or unparseable is a reject.
  if (!isFreshTriggeredAt(request.headers.get("X-Shopify-Triggered-At"))) {
    console.warn(`[connect] shopify webhook ${topic} rejected: stale or missing X-Shopify-Triggered-At`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // .text(), never .json(): the signature is over these exact bytes.
  const raw = await request.text();
  const result = handleGdprWebhook(
    topic,
    raw,
    request.headers.get("X-Shopify-Hmac-Sha256"),
    config.shopifyClientSecret,
    {
      shopDomain: request.headers.get("X-Shopify-Shop-Domain"),
      webhookId: request.headers.get("X-Shopify-Webhook-Id"),
    }
  );
  if (result.status === 401) return NextResponse.json(result.body, { status: 401 });

  if (topic === "shop/redact" && config.shopRedactFunctionUrl) {
    const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256") ?? "";
    const forwarded = await forwardShopRedact(
      config.shopRedactFunctionUrl,
      raw,
      hmacHeader,
      request.headers.get("X-Shopify-Webhook-Id"),
      request.headers.get("X-Shopify-Triggered-At"),
      deps.fetchImpl ?? fetch
    );
    if (forwarded) return NextResponse.json(result.body, { status: 200 });
    console.warn(
      `[connect] shop/redact forward failed shop=${oneLine(request.headers.get("X-Shopify-Shop-Domain"))} ` +
        `webhookId=${oneLine(request.headers.get("X-Shopify-Webhook-Id"))}; falling back to operator email`
    );
  }

  // A failed notification must not 500: Shopify retries a non-2xx for days and
  // repeated failures count against the app. sendMail already logs either way.
  await sendMail(result.notify, topic, { apiKey: config.resendApiKey });
  return NextResponse.json(result.body, { status: 200 });
}
