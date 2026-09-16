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

    // A rejection still has to carry whatever @supabase/ssr wrote onto
    // `response`: a refreshed token, or the cleared cookies `signOut()` just
    // queued. NextResponse.redirect() starts with empty headers, so copy them
    // across — otherwise the session change is silently dropped and the next
    // request arrives with the stale cookie, looping forever.
    //
    // Behind nginx (bcns-app@<slug>), request.url is the *internal* origin —
    // https://localhost:3101 — so a redirect built from it sends the browser to
    // localhost. The Host header is the public name: onboard-client.sh's vhost
    // sets `Host $host`, overriding anything the client sent, and the catch-all
    // vhost drops unknown hosts, so it is not attacker-controlled. Only Host is
    // used (never X-Forwarded-Host, which nginx passes through untouched).
    const publicOrigin = (): string => {
      const host = request.headers.get("host");
      if (!host) return request.url;
      const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "");
      return `${proto}://${host}`;
    };
    const redirectTo = (target: string): NextResponse => {
      const redirect = NextResponse.redirect(new URL(target, publicOrigin()));
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    };

    if (result.reason === "wrong-client") {
      // Signed in, but to someone else's tenant: drop the session so the next
      // sign-in starts clean instead of bouncing off this app forever.
      await supabase.auth.signOut();
      return redirectTo(`${loginPath}?error=wrong-client`);
    }
    if (result.reason === "no-membership") {
      // Same reason: a signed-in user with no membership keeps a valid session,
      // so without signOut() every request would bounce off this redirect.
      await supabase.auth.signOut();
      return redirectTo(`${loginPath}?error=no-membership`);
    }
    return redirectTo(loginPath);
  };
}
