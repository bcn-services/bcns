/**
 * gate.ts — HQ's fail-closed request gate. Everything not public needs a
 * session AND a `profiles` row (a signed-in auth user without one is denied:
 * Supabase signups must never grant access). Pure of Supabase so tests inject `check`.
 */

import { NextResponse, type NextRequest } from "next/server";

export const LOGIN_PATH = "/login";

/** Exact paths open without a session. /mcp /authorize /token /register are the OAuth surface of a later item. */
export const PUBLIC_PATHS = ["/login", "/signout", "/api/health", "/mcp", "/authorize", "/token", "/register"] as const;
export const PUBLIC_PREFIX = "/.well-known/";

export function isPublic(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname) || pathname.startsWith(PUBLIC_PREFIX);
}

/** Returns the response to continue with (session cookies refreshed), or null to deny. */
export type Check = (request: NextRequest) => Promise<NextResponse | null>;

export async function gate(request: NextRequest, check: Check): Promise<NextResponse> {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
  let pass: NextResponse | null = null;
  try {
    pass = await check(request);
  } catch {
    pass = null; // Supabase unreachable or misconfigured: deny, never admit.
  }
  if (pass) return pass;
  const to = request.nextUrl.clone();
  to.pathname = LOGIN_PATH;
  to.search = "";
  // 307 replays the method; a non-GET/HEAD (a server-action POST) is sent to /login as a GET with 303.
  return NextResponse.redirect(to, request.method === "GET" || request.method === "HEAD" ? 307 : 303);
}
