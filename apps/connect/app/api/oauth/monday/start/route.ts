/**
 * POST /api/oauth/monday/start — owner-only redirect to the consent screen with a
 * freshly signed state (lib/oauth-connect.ts, startPOST). POST, not GET, and a
 * cross-site request is refused, so a third-party page cannot force a
 * reconnect (W5b #3). Shopify's /start stays a GET: its install flow needs it.
 */

import type { NextRequest, NextResponse } from "next/server";
import { startPOST } from "@/lib/oauth-connect";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest): Promise<NextResponse> {
  return startPOST(request, "monday");
}
