/**
 * env.ts — every value read from process.env at CALL TIME, never at import.
 * Missing values come back undefined and each caller degrades; nothing here
 * throws, so the app builds and boots with no env at all.
 */

function readEnv(name: string): string | undefined {
  const trimmed = process.env[name]?.trim();
  return trimmed ? trimmed : undefined;
}

export interface HubConfig {
  /** Supabase project URL — browser-safe. */
  supabaseUrl?: string;
  /** Supabase anon key — browser-safe, subject to RLS. */
  supabaseAnonKey?: string;
  /** Optional. Unset = connection requests fall back to a mailto link. */
  resendApiKey?: string;
  /** Shopify app client id (public). Unset = the Connect button stays hidden. */
  shopifyClientId?: string;
  /** Shopify app client secret. Server-only: never reaches a client component. */
  shopifyClientSecret?: string;
  /**
   * Sources whose OAuth app is approved and may show a "Connect" button.
   * Everything absent from this list keeps the chunk-4 "Request connection"
   * email, so a source stays exactly as it was until its review lands.
   */
  approvedOAuthSources: string[];
  /** Where Shopify sends the browser back. Overridable for a local dev-store install. */
  hubBaseUrl: string;
}

/** The hub's own origin in production; matches the redirect URL registered with Shopify. */
export const HUB_BASE_URL = "https://connect.bcn-services.com";

export function getConfig(): HubConfig {
  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    resendApiKey: readEnv("RESEND_API_KEY"),
    shopifyClientId: readEnv("SHOPIFY_CLIENT_ID"),
    shopifyClientSecret: readEnv("SHOPIFY_CLIENT_SECRET"),
    approvedOAuthSources: (readEnv("OAUTH_APPROVED_SOURCES") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    hubBaseUrl: (readEnv("HUB_BASE_URL") ?? HUB_BASE_URL).replace(/\/+$/, ""),
  };
}
