/**
 * /api/health — the external uptime probe target (UptimeRobot, and the deploy
 * job's post-activate check).
 *
 * Deliberately credential-free: apps/sb signs in as its smoke user, but the hub
 * has no single client to be, and a probe that needs a password fails for
 * reasons that have nothing to do with the hub being up. Reaching GoTrue is the
 * whole claim. This route is excluded from the tenant middleware matcher.
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/env";
import { evaluateHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const report = await evaluateHealth({ supabaseUrl, supabaseAnonKey });
  return NextResponse.json(report.body, { status: report.status });
}
