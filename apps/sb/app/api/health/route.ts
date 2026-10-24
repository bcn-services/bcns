/**
 * /api/health — external uptime probe target (UptimeRobot per the hosting
 * reference). Thin adapter over lib/health.ts's pure evaluation.
 *
 * Own-project mode: 200 when the DB is connected OR no DB is configured
 * (keyless template runs must not look down); 503 when a configured DB fails
 * its ping. Shared-platform mode (DATA_SOURCE=shared): signs in as the client's
 * smoke user and reads its client row; see lib/shared-health.ts.
 */

import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
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

/**
 * TEMPORARY — proves Sentry receives a scrubbed server error from sb. Removed in
 * the follow-up PR. Sits on /api/health only because that path is outside the
 * tenant middleware matcher (no session needed); it is NOT part of health.
 *
 * Inert unless SENTRY_TEST_TOKEN is set in /srv/sb/env: with no token, or a
 * wrong x-sentry-test header, it answers 404 and throws nothing.
 */
function sentryTestAuthorized(request: NextRequest): boolean {
  const expected = process.env.SENTRY_TEST_TOKEN;
  const given = request.headers.get("x-sentry-test");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sentryTestAuthorized(request)) return new NextResponse(null, { status: 404 });
  Sentry.getIsolationScope().setUser({ id: "sentry-test-user", email: "sentry-test@example.invalid" });
  throw new Error(`sentry-test: sb route throw ${new Date().toISOString()}`);
}
