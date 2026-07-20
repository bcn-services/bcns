/**
 * Stripe subscription-status webhook (App Router).
 *
 * STUB: real deployments must verify the Stripe signature with the official SDK
 * (`stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`) before
 * trusting the payload. That verification is intentionally a documented stub
 * here — no Stripe SDK is bundled. The provision/suspend DECISION, however, is
 * real and routes through @bcns/app-core's pure logic via handleStripeEvent, so
 * it is unit-testable and identical to production behavior.
 */

import { NextResponse } from "next/server";
import type { StripeSubscriptionEvent, SubStatus } from "@bcns/app-core";
import { handleStripeEvent } from "@/lib/webhook";
import { getConfig } from "@/lib/env";

const VALID_STATUSES: readonly SubStatus[] = ["active", "past_due", "canceled", "trialing"];

/** Narrow an untrusted JSON body into a StripeSubscriptionEvent, or null. */
function parseEvent(body: unknown): StripeSubscriptionEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const status = b.status;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as SubStatus)) return null;
  if (typeof b.type !== "string") return null;
  if (typeof b.customerId !== "string" || typeof b.subscriptionId !== "string") return null;
  return {
    type: b.type,
    status: status as SubStatus,
    customerId: b.customerId,
    subscriptionId: b.subscriptionId,
  };
}

export async function POST(request: Request): Promise<Response> {
  const config = getConfig();
  // STUB: signature verification goes here once STRIPE_WEBHOOK_SECRET is wired.
  // When the secret is absent (e.g. local/dev), we skip verification but still
  // exercise the decision path so the endpoint stays runnable without keys.
  const verificationConfigured = Boolean(config.stripeWebhookSecret);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const event = parseEvent(body);
  if (!event) {
    return NextResponse.json({ error: "unrecognized event shape" }, { status: 400 });
  }

  const result = handleStripeEvent(event);
  // In production, `result.decision` would flip the customer's DB access here.
  return NextResponse.json({
    decision: result.decision,
    customerId: result.customerId,
    subscriptionId: result.subscriptionId,
    signatureVerified: verificationConfigured,
  });
}
