// Shopify webhook: app/uninstalled. Logic in lib/shopify-webhook-route.ts.
import type { NextRequest } from "next/server";
import { appUninstalledRoute } from "@/lib/shopify-webhook-route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return appUninstalledRoute(request);
}
