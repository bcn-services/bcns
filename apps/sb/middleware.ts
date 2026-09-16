/**
 * middleware.ts — shared-platform mode only (DATA_SOURCE=shared): refreshes
 * the cookie session on every request and sends signed-out visitors to /login.
 * In own-project mode, or with Supabase env unset, it passes every request
 * through untouched (R38: the template serves unchanged).
 *
 * Reads config through lib/env.ts's dynamic process.env lookup, which Next's
 * edge sandbox fills from the runtime env. A static `process.env.NEXT_PUBLIC_*`
 * reference here would be inlined at build time, and CI builds with no env.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getConfig } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const { dataSource, supabaseUrl, supabaseAnonKey } = getConfig();
  if (dataSource !== "shared" || !supabaseUrl || !supabaseAnonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() verifies the token with the auth server and refreshes it if expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // /api/health authenticates itself (lib/shared-health.ts); static assets need no session.
  matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"],
};
