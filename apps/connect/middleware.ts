/**
 * middleware.ts — the hub gate.
 *
 * Unlike a client app, `apps/connect` serves EVERY client, so there is no
 * `expectedClientId` pin: any signed-in user with a membership gets in and the
 * pages scope themselves through RLS. Session refresh, the /login redirect and
 * the `no-membership` bounce all live in @bcn-services/tenant/middleware.
 */

import { tenantMiddleware } from "@bcn-services/tenant/middleware";

export const middleware = tenantMiddleware({ loginPath: "/login" });

export const config = {
  // /api/health is an unauthenticated uptime probe; static assets need no session.
  // Equal to TENANT_MATCHER, inlined so Next can statically extract the matcher at build.
  matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"],
};
