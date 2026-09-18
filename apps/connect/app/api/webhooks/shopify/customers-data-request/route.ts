// Shopify mandatory privacy webhook: customers/data_request. Logic in lib/shopify-webhook-route.ts.
import type { NextRequest } from "next/server";
import { gdprRoute } from "@/lib/shopify-webhook-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return gdprRoute(request, "customers/data_request");
}
