/**
 * /api/oauth/meta/pick — the owner chooses which ad account to connect when the token
 * can see more than one (W5b #1). GET renders the list sealed by /callback;
 * POST checks the choice against that list and writes. lib/oauth-connect.ts.
 */

import type { NextRequest, NextResponse } from "next/server";
import { pickGET, pickPOST } from "@/lib/oauth-connect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<NextResponse> {
  return pickGET(request, "meta");
}

export function POST(request: NextRequest): Promise<NextResponse> {
  return pickPOST(request, "meta");
}
