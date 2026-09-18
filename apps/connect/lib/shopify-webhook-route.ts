/**
 * The shared body of all three GDPR webhook routes. One file per topic under
 * app/api/webhooks/shopify/ because Shopify registers a separate URL per topic;
 * everything they actually do is here.
 */

import { NextResponse } from "next/server";
import { getConfig } from "./env";
import { sendMail } from "./request-connection";
import { handleGdprWebhook, type GdprTopic } from "./shopify-webhooks";

export async function gdprRoute(request: Request, topic: GdprTopic): Promise<NextResponse> {
  const config = getConfig();
  // No approval gate here: Shopify calls these DURING review, before the source
  // is ever listed in OAUTH_APPROVED_SOURCES. Only the secret matters.
  if (!config.shopifyClientSecret) {
    console.warn(`[connect] shopify webhook ${topic} rejected: no SHOPIFY_CLIENT_SECRET`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // .text(), never .json(): the signature is over these exact bytes.
  const raw = await request.text();
  const result = handleGdprWebhook(
    topic,
    raw,
    request.headers.get("X-Shopify-Hmac-Sha256"),
    config.shopifyClientSecret
  );
  if (result.status === 401) return NextResponse.json(result.body, { status: 401 });

  // A failed notification must not 500: Shopify retries a non-2xx for days and
  // repeated failures count against the app. sendMail already logs either way.
  await sendMail(result.notify, topic, { apiKey: config.resendApiKey });
  return NextResponse.json(result.body, { status: 200 });
}
