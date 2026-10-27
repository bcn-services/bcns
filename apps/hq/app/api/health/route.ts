/** /api/health — uptime probe. No DB hit: process liveness only. */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return NextResponse.json({ ok: true, app: "hq" });
}
