/**
 * /api/oauth/drive/pick — GET opens the Google Picker for one folder; POST verifies the folder
 * server-side and connects. Logic: lib/google-connect.ts.
 */
import type { NextRequest, NextResponse } from "next/server";
import { pickGET, pickPOST } from "@/lib/google-connect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<NextResponse> {
  return pickGET(request, "drive");
}

export function POST(request: NextRequest): Promise<NextResponse> {
  return pickPOST(request, "drive");
}
