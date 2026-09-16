/**
 * cookies.ts — the auth-cookie and Supabase-env rules every bcns app shares.
 *
 * Edge-safe on purpose: no `next/headers`, no node builtins. `middleware.ts`
 * runs in Next's edge sandbox and imports from here.
 */

/**
 * Parent domain the auth cookie is written on, so a session minted at the hub
 * (`connect.bcn-services.com`) is already valid at `sb.bcn-services.com`
 * (platform-v1 §2).
 */
export const COOKIE_DOMAIN = ".bcn-services.com";

/** COOKIE_DOMAIN without the leading dot — the apex the rule matches against. */
const PARENT_HOST = "bcn-services.com";

export interface TenantEnv {
  /** Supabase project URL — browser-safe. */
  supabaseUrl: string;
  /** Supabase anon key — browser-safe, subject to RLS. */
  supabaseAnonKey: string;
}

/**
 * Read one env var at CALL TIME through a dynamic lookup. The dynamic key
 * matters: Next inlines statically-written `process.env.NEXT_PUBLIC_*`
 * references into the edge bundle at build time, and CI builds with no env.
 */
function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Supabase env, or null when either value is unset/blank (keyless runs). */
export function readTenantEnv(): TenantEnv | null {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

export interface TenantCookieOptions {
  domain?: string;
  path: "/";
  sameSite: "lax";
  secure: boolean;
}

/**
 * Cookie attributes for the request's host. Only a real bcn-services.com host
 * gets the shared parent domain (and therefore Secure); localhost and Vercel
 * preview hosts get a plain host-only, non-secure cookie so they still work
 * over http.
 */
export function cookieOptions(host: string | null | undefined): TenantCookieOptions {
  const hostname = (host ?? "").split(":")[0]?.toLowerCase() ?? "";
  const onParentDomain = hostname === PARENT_HOST || hostname.endsWith(`.${PARENT_HOST}`);
  return onParentDomain
    ? { domain: COOKIE_DOMAIN, path: "/", sameSite: "lax", secure: true }
    : { path: "/", sameSite: "lax", secure: false };
}
