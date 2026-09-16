/**
 * /api/health — external uptime probe target (UptimeRobot per the hosting
 * reference). Shared-platform mode is the only mode: signs in as the
 * client's smoke user and reads its client row (lib/shared-health.ts).
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/env";
import { evaluateSharedHealth } from "@/lib/shared-health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await evaluateSharedHealth(getConfig());
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
