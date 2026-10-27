/**
 * env.ts — lazy accessor for HQ runtime configuration. Read from process.env at
 * CALL TIME, never at import, so the app builds and imports with nothing set.
 * Missing values are `undefined`; each consumer decides how to degrade.
 */

function readEnv(name: string): string | undefined {
  const trimmed = process.env[name]?.trim();
  return trimmed ? trimmed : undefined;
}

export interface AppConfig {
  /** HQ Supabase project URL (browser-safe). */
  supabaseUrl?: string;
  /** HQ Supabase anon key (browser-safe, RLS applies). */
  supabaseAnonKey?: string;
  // Typed now, read by later items.
  hqLateStages?: string;
  platformOpsUrl?: string;
  stripeKey?: string;
  mercuryKey?: string;
  /** Optional dashboard links shown on Numbers (links only, no API calls). */
  instinctUrl?: string;
  sentryUrl?: string;
  /**
   * True when a service-role key is in the shell env or a loaded .env file —
   * presence only, never the value. HQ is an anon-key app; scripts/check-env.ts
   * fails the build on it.
   */
  hasServiceRoleKey: boolean;
}

export function getConfig(): AppConfig {
  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    hqLateStages: readEnv("HQ_LATE_STAGES"),
    platformOpsUrl: readEnv("PLATFORM_OPS_URL"),
    stripeKey: readEnv("STRIPE_KEY"),
    mercuryKey: readEnv("MERCURY_KEY"),
    instinctUrl: readEnv("INSTINCT_URL"),
    sentryUrl: readEnv("SENTRY_URL"),
    hasServiceRoleKey: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
  };
}
