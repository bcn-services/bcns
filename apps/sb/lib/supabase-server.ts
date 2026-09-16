/**
 * supabase-server.ts — cookie-session Supabase client for server components,
 * server actions, and route handlers.
 *
 * The cookie rules (the shared `.bcn-services.com` domain) and the client
 * construction both live in @bcn-services/tenant now, so every app on the
 * platform reads the same session; middleware.ts refreshes it.
 *
 * Still returns null when Supabase env is unset, so keyless template runs
 * never construct a client.
 */

export { createServerSupabase as createSupabaseServer } from "@bcn-services/tenant";
