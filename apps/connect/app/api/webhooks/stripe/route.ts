// Stripe webhook (self-serve billing). Under api/webhooks/ so the middleware matcher lets
// Stripe's cookie-less POST through; the signature check is in lib/stripe-billing.ts.
import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { stripeWebhookRoute } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return stripeWebhookRoute(request, getConfig());
}
