import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hardenCookie, sessionCookieOptions } from "./lib/cookie-options";
import { getConfig } from "./lib/env";
import { gate, type Check } from "./lib/gate";

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
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  return { ok: !!row, response };
};

export const middleware = (request: NextRequest) => gate(request, check);

export const config = { matcher: ["/((?!api/health$|_next/static|_next/image|favicon.ico).*)"] };
