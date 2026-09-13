/**
 * supabase-server.ts — cookie-session Supabase client for server components,
 * server actions, and route handlers (@supabase/ssr). The session lives in a
 * cookie, so server-rendered pages can read data as the signed-in user;
 * middleware.ts refreshes it.
 *
 * Returns null when Supabase env is unset, so keyless template runs never
 * construct a client.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getConfig } from "./env";

export function createSupabaseServer() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const store = cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't write cookies; middleware.ts refreshes the session instead.
        }
      },
    },
  });
}
