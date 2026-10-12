/**
 * GET /api/oauth/meet/callback — verifies the signed state FIRST, then exchanges the code and seals
 * the tokens for the folder-pick step. Nothing is written here. Logic: lib/google-connect.ts.
 */
import type { NextRequest, NextResponse } from "next/server";
import { callbackGET } from "@/lib/google-connect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<NextResponse> {
  return callbackGET(request, "meet");
}
