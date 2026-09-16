/**
 * middleware.ts — shared-platform mode only (DATA_SOURCE=shared). Session
 * refresh, the /login redirect and the tenant pin all live in
 * @bcn-services/tenant/middleware; this file only decides whether SB is in
 * shared mode and which client it is pinned to. In own-project mode, or with
 * Supabase env unset, every request passes through untouched (R38: the
 * template serves unchanged).
 *
 * Both reads happen inside the handler through a dynamic process.env lookup,
 * which Next's edge sandbox fills from the runtime env. A static
 * `process.env.X` reference here would be inlined at build time, and CI builds
 * with no env.
 */

import { NextResponse, type NextRequest } from "next/server";
import { tenantMiddleware } from "@bcn-services/tenant/middleware";
import { getConfig } from "@/lib/env";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export async function middleware(request: NextRequest) {
  if (getConfig().dataSource !== "shared") return NextResponse.next();
  return tenantMiddleware({ expectedClientId: readEnv("EXPECTED_CLIENT_ID") })(request);
}

export const config = {
  // /api/health authenticates itself (lib/shared-health.ts); static assets need no session.
  // Equal to TENANT_MATCHER, inlined so Next can statically extract the matcher at build.
  matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"],
};
