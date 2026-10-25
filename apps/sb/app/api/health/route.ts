/**
 * /api/health — external uptime probe target (UptimeRobot per the hosting
 * reference). Thin adapter over lib/health.ts's pure evaluation.
 *
 * Own-project mode: 200 when the DB is connected OR no DB is configured
 * (keyless template runs must not look down); 503 when a configured DB fails
 * its ping. Shared-platform mode (DATA_SOURCE=shared): signs in as the client's
 * smoke user and reads its client row; see lib/shared-health.ts.
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/env";
import { evaluateHealth } from "@/lib/health";
import { evaluateSharedHealth } from "@/lib/shared-health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getConfig();
  const report =
    config.dataSource === "shared" ? await evaluateSharedHealth(config) : await evaluateHealth(config);
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
