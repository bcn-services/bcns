/**
 * Stripe subscription-status webhook (App Router).
 *
 * SECURITY — FAIL-CLOSED STUB. Real Stripe signature verification is
 * intentionally NOT implemented here (no Stripe SDK is bundled). Because this is
 * a template that clients clone, the route must never *look* production-ready
 * while trusting unauthenticated input. So it behaves in two honest modes:
 *
 *   1. STRIPE_WEBHOOK_SECRET IS set (i.e. a real/prod deploy) → REFUSE the
 *      request with 501 Not Implemented. A configured secret signals "verify me,"
 *      but verification is not wired, so we route NOTHING to the provision/suspend
 *      decision. You MUST wire real verification before production:
 *          stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
 *      then feed the constructed event through parseEvent + handleStripeEvent.
 *
 *   2. STRIPE_WEBHOOK_SECRET is UNSET (local dev / not yet configured) → process
 *      the event so the endpoint stays runnable without keys, but mark the
 *      response honestly: signatureVerified:false, mode:"unverified-dev". The
 *      provision/suspend DECISION still routes through @nseluga/app-core's pure
 *      logic via handleStripeEvent, so it is unit-testable and identical to
 *      production decision behavior.
 *
 * The route NEVER claims a signature was verified when it was not.
 */

import { NextResponse } from "next/server";
import type { StripeSubscriptionEvent, SubStatus } from "@nseluga/app-core";
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

  // FAIL-CLOSED: a configured signing secret means "authenticate me," but real
  // verification is not wired in this template. Refuse rather than trust
  // unauthenticated input, and do NOT touch the provision/suspend decision.
  if (config.stripeWebhookSecret) {
    return NextResponse.json(
      {
        error: "signature verification not wired",
        message:
          "STRIPE_WEBHOOK_SECRET is set but this template does not verify Stripe " +
          "signatures. Wire stripe.webhooks.constructEvent before production; " +
          "until then the webhook refuses configured-secret requests.",
      },
      { status: 501 },
    );
  }

  // Unverified DEV path only (no secret configured). Never reachable once a
  // secret is set. The response marks itself as unverified so it can never be
  // mistaken for authenticated production traffic.
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
    signatureVerified: false,
    mode: "unverified-dev",
  });
}
