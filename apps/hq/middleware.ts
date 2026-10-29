import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hardenCookie, sessionCookieOptions } from "./lib/cookie-options";
import { getConfig } from "./lib/env";
import { gate, type Check } from "./lib/gate";
import { encodeSession, SESSION_HEADER, type Profile } from "./lib/session-header";

// Session AND profiles row. getUser() validates the JWT with Supabase Auth (getSession() would trust the cookie).
const check: Check = async (request) => {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        // Host-only: no `domain` option. Refreshed tokens go to the downstream request and the browser.
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        all.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, hardenCookie(options))
        );
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, response };
  const { data: row } = await supabase
    .from("profiles")
    .select("id, handle, role, display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!row) return { ok: false, response };
  // Forward what was just validated so getSession() skips its own getUser() + profiles; set() overwrites any client-sent copy.
  const forwarded = new Headers(request.headers);
  // untyped client: the select above is the shape
  forwarded.set(
    SESSION_HEADER,
    encodeSession({ user: { id: data.user.id, email: data.user.email }, profile: row as Profile })
  );
  const admitted = NextResponse.next({ request: { headers: forwarded } });
  response.cookies.getAll().forEach((c) => admitted.cookies.set(c)); // refreshed session cookies, already hardened
  return { ok: true, response: admitted };
};

export const middleware = (request: NextRequest) => gate(request, check);

export const config = { matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"] };
