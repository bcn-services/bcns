/**
 * @bcn-services/tenant — the shared auth seam for every app on the platform.
 *
 * Server entry point: may import `next/headers`, so it is only usable from
 * server components, server actions and route handlers. Middleware imports
 * "@bcn-services/tenant/middleware" instead, which stays edge-safe.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookieOptions, readTenantEnv } from "./cookies.js";

export { COOKIE_DOMAIN, cookieOptions, readTenantEnv } from "./cookies.js";
export type { TenantCookieOptions, TenantEnv } from "./cookies.js";
export { membershipFromUser, requireMembership } from "./membership.js";
export type { Membership, MembershipResult, RequireMembershipOptions } from "./membership.js";

/**
 * Cookie-session Supabase client for server components, server actions and
 * route handlers. Returns null when Supabase env is unset, so keyless runs
 * never construct a client.
 */
export function createServerSupabase(): SupabaseClient | null {
  const env = readTenantEnv();
  if (!env) return null;
  const store = cookies();
  const shared = cookieOptions(headers().get("host"));
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, { ...options, ...shared });
          }
        } catch {
          // Server components can't write cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}
