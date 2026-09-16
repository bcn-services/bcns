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
}

export function getConfig(): HubConfig {
  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    resendApiKey: readEnv("RESEND_API_KEY"),
  };
}
