/**
 * supabase-server.ts — cookie-session Supabase client for server components,
 * server actions, and route handlers. The session cookie is shared across
 * every `*.bcn-services.com` app (packages/tenant's COOKIE_DOMAIN); the local
 * export name stays `createSupabaseServer` so page code is unchanged.
 */

export { createServerSupabase as createSupabaseServer } from "@bcn-services/tenant";
