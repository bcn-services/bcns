/**
 * @bcn-services/tenant/middleware — session refresh plus the tenant pin, as a
 * Next middleware handler.
 *
 * Edge-safe: nothing here (or anything it imports) touches `next/headers` or a
 * node builtin. Env is read per request, never at module load.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookieOptions, readTenantEnv } from "./cookies.js";
import { requireMembership } from "./membership.js";

export interface TenantMiddlewareOptions {
  /** Client apps pin themselves to one client id; the hub leaves it unset. */
  expectedClientId?: string;
  /** Where signed-out and rejected visitors land. Default "/login". */
  loginPath?: string;
}

/** Everything except the self-authenticating health route and static assets. */
export const TENANT_MATCHER = ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"];

export function tenantMiddleware(
  opts: TenantMiddlewareOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
  const loginPath = opts.loginPath ?? "/login";

  return async (request: NextRequest): Promise<NextResponse> => {
    const env = readTenantEnv();
    if (!env) return NextResponse.next();

    const shared = cookieOptions(request.headers.get("host"));
    let response = NextResponse.next({ request });
    const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, { ...options, ...shared });
          }
        },
      },
    });

    const result = await requireMembership(supabase, { expectedClientId: opts.expectedClientId });
    // The login page must stay reachable, or every rejection would loop.
    if (result.ok || request.nextUrl.pathname === loginPath) return response;

    if (result.reason === "wrong-client") {
      // Signed in, but to someone else's tenant: drop the session so the next
      // sign-in starts clean instead of bouncing off this app forever.
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(`${loginPath}?error=wrong-client`, request.url));
    }
    if (result.reason === "no-membership") {
      return NextResponse.redirect(new URL(`${loginPath}?error=no-membership`, request.url));
    }
    return NextResponse.redirect(new URL(loginPath, request.url));
  };
}
