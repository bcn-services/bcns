/**
 * middleware.ts — shared-platform mode is the only mode: every request gets
 * its session refreshed and pinned to this app's client via
 * `@bcn-services/tenant`. Env is read inside the handler (not at module top
 * level) so edge bundling never inlines a build-time value.
 *
 * The pin FAILS CLOSED. With the platform configured but EXPECTED_CLIENT_ID
 * unset, an unpinned middleware would admit any signed-in member of any
 * client, so this denies instead (see DEPLOY.md, "Env").
 */

import { NextResponse, type NextRequest } from "next/server";
import { tenantMiddleware } from "@bcn-services/tenant/middleware";
import { pinOrDeny } from "@/lib/env";

const LOGIN_PATH = "/login";

export async function middleware(request: NextRequest) {
  const decision = pinOrDeny();
  if (decision.kind === "deny") {
    // An API caller gets a machine-readable 500; a browser gets the login page
    // with an explanation. /login itself must pass through, or it loops.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "misconfigured", detail: "EXPECTED_CLIENT_ID is unset" },
        { status: 500 }
      );
    }
    if (request.nextUrl.pathname === LOGIN_PATH) return NextResponse.next();
    // Same rule as @bcn-services/tenant's redirectTo: NextResponse.redirect()
    // defaults to 307, which replays a non-GET/HEAD (a POST on a misconfigured
    // deploy) as a POST against /login. 303 forces the browser's follow-up to a
    // GET; GET/HEAD keep 307 (no behavioural change for the common case).
    const status = request.method === "GET" || request.method === "HEAD" ? 307 : 303;
    return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=misconfigured`, request.url), status);
  }
  const opts = decision.kind === "pin" ? { expectedClientId: decision.clientId } : {};
  return tenantMiddleware(opts)(request);
}

// Next.js statically extracts `config.matcher` at build time and can't follow
// an imported identifier, so this literal must mirror
// `TENANT_MATCHER` in packages/tenant/src/middleware.ts.
// packages/tenant/tests/matcher.test.mjs fails if the two ever drift.
export const config = { matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"] };
