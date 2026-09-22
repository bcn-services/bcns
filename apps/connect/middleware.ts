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
  // TENANT_MATCHER plus one exclusion, inlined so Next can statically extract the
  // matcher at build.
  //
  // api/webhooks/ is Shopify's three mandatory privacy webhooks. Shopify calls them
  // server-to-server with no cookie, so leaving them in the matcher would answer a
  // 307 to /login — and Shopify treats a non-2xx as a failed webhook and rejects the
  // app at review. They are not unauthenticated: every one verifies an HMAC over the
  // raw body against the client secret and 401s when it fails (lib/shopify-webhooks.ts).
  //
  // api/oauth/meta/data-deletion is Meta's data-deletion callback: same shape, a
  // server-to-server POST with no cookie, authenticated by verifying Meta's
  // signed_request against META_CLIENT_SECRET (lib/meta-oauth.ts). Its GET is the
  // public status page Meta links a user to.
  //
  // The other OAuth routes are deliberately NOT excluded: /start and /callback both need a
  // signed-in owner, and the middleware bounce is the first half of that check.
  matcher: ["/((?!api/health$|api/webhooks/|api/oauth/meta/data-deletion$|_next/static|_next/image|favicon.ico).*)"],
};
