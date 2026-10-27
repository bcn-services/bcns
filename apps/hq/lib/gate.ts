/**
 * gate.ts — HQ's fail-closed request gate. Everything not public needs a
 * session AND a `profiles` row (a signed-in auth user without one is denied:
 * Supabase signups must never grant access). Pure of Supabase so tests inject `check`.
 */

import { NextResponse, type NextRequest } from "next/server";

export const LOGIN_PATH = "/login";

/** Exact paths open without a session. /mcp /authorize /token /register are the OAuth surface of a later item. */
export const PUBLIC_PATHS = [
  "/login",
  "/signout",
  "/api/health",
  "/mcp",
  "/authorize",
  "/token",
  "/register",
] as const;
export const PUBLIC_PREFIX = "/.well-known/";

export function isPublic(pathname: string): boolean {
  return (
    (PUBLIC_PATHS as readonly string[]).includes(pathname) || pathname.startsWith(PUBLIC_PREFIX)
  );
}

/**
 * `ok` admits `response` (session cookies refreshed). Not ok denies, but `response` still carries
 * the cookies Supabase set (a rotated refresh token) so the redirect can keep them. null = nothing to carry.
 */
export type Check = (
  request: NextRequest
) => Promise<{ ok: boolean; response: NextResponse } | null>;

export async function gate(request: NextRequest, check: Check): Promise<NextResponse> {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
  let result: Awaited<ReturnType<Check>> = null;
  try {
    result = await check(request);
  } catch {
    result = null; // Supabase unreachable or misconfigured: deny, never admit.
  }
  if (result?.ok) return result.response;
  const to = request.nextUrl.clone();
  to.pathname = LOGIN_PATH;
  to.search = "";
  // 307 replays the method; a non-GET/HEAD (a server-action POST) is sent to /login as a GET with 303.
  const deny = NextResponse.redirect(
    to,
    request.method === "GET" || request.method === "HEAD" ? 307 : 303
  );
  result?.response.headers.getSetCookie().forEach((c) => deny.headers.append("set-cookie", c));
  return deny;
}
