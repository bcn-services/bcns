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

/**
 * Callers merge these over @supabase/ssr's own options as `{ ...options,
 * ...shared }` — ours win. Deliberate: the four keys here are host-derived and
 * ssr's are generic defaults, and ssr sets no other key that this shadows
 * (`maxAge`/`expires`/`httpOnly` are absent here and survive the merge).
 */
export interface TenantCookieOptions {
  domain?: string;
  path: "/";
  sameSite: "lax";
  secure: boolean;
}

/** Hosts reached over plain http, where a Secure cookie would never be sent. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Host header minus its port. Bracketed IPv6 literals keep their brackets. */
function hostnameOf(host: string | null | undefined): string {
  const raw = (host ?? "").trim().toLowerCase();
  if (raw.startsWith("[")) return raw.slice(0, raw.indexOf("]") + 1);
  return raw.split(":")[0] ?? "";
}

/**
 * Cookie attributes for the request's host. Two independent decisions:
 *
 * - `domain`: only a real bcn-services.com host gets the shared parent domain,
 *   so a session minted at the hub is already valid at every app. Anything
 *   else (localhost, a Vercel preview) gets a host-only cookie.
 * - `secure`: derived from the hostname alone, NOT from the domain rule. A
 *   Vercel preview is https and must keep Secure; only loopback is http. An
 *   unknown/missing host is treated as public, which fails closed.
 */
export function cookieOptions(host: string | null | undefined): TenantCookieOptions {
  const hostname = hostnameOf(host);
  const onParentDomain = hostname === PARENT_HOST || hostname.endsWith(`.${PARENT_HOST}`);
  const secure = !LOOPBACK_HOSTS.has(hostname);
  return onParentDomain
    ? { domain: COOKIE_DOMAIN, path: "/", sameSite: "lax", secure }
    : { path: "/", sameSite: "lax", secure };
}
