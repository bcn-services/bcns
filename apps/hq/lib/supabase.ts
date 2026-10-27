/**
 * supabase.ts — cookie-session Supabase client for server components, server
 * actions and route handlers. HOST-ONLY cookies: no `domain` option anywhere,
 * so the session never reaches *.bcn-services.com. HQ auth is separate from Connect.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getConfig } from "./env";

/** Null when Supabase env is unset (callers treat that as signed-out / unconfigured). */
export function createSupabaseServer() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const jar = cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (all) => {
        // Server components cannot set cookies; middleware refreshes the session instead.
        try {
          all.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // read-only cookie store
        }
      },
    },
  });
}
