/**
 * TEMPORARY — proves Sentry receives a real server error. Removed in the
 * follow-up PR. Lives under api/webhooks/ only because that prefix is outside
 * the tenant middleware matcher (no session needed); it is NOT a webhook.
 *
 * Inert unless SENTRY_TEST_TOKEN is set in /srv/connect/env: with no token, or
 * a wrong x-sentry-test header, it answers 404 and throws nothing.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.SENTRY_TEST_TOKEN;
  const given = request.headers.get("x-sentry-test");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return new NextResponse(null, { status: 404 });
  throw new Error(`sentry-test: route throw ${new Date().toISOString()}`);
}
