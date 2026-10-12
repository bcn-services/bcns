/**
 * POST /api/oauth/meet/start — owner-only redirect to Google's consent screen with a freshly signed
 * state. POST, not GET, and a cross-site request is refused, so a third-party page cannot force a
 * reconnect. Logic: lib/google-connect.ts.
 */
import type { NextRequest, NextResponse } from "next/server";
import { startPOST } from "@/lib/google-connect";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest): Promise<NextResponse> {
  return startPOST(request, "meet");
}
