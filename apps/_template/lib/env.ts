/**
 * env.ts — Single, lazy accessor for all runtime configuration.
 *
 * Every value is read from process.env at CALL TIME, never at module import.
 * This keeps the app buildable and importable when no keys are set: nothing
 * here throws or reads env as a side effect of `import`. Missing values come
 * back as `undefined` and each consumer decides how to degrade gracefully.
 *
 * Shared-platform mode only (platform-v1): there is no per-client Supabase
 * project and no own/shared switch — every stamped app reads the one
 * platform project via @bcn-services/data-client (lib/data.ts).
 */

/** Read a single env var, trimming and treating empty/whitespace as unset. */
function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Coerce a truthy env flag ("1", "true", "yes", case-insensitive) to boolean. */
function readFlag(name: string): boolean {
  const v = readEnv(name)?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export interface AppConfig {
  /** Supabase project URL — browser-safe. The platform project, same for every app. */
  supabaseUrl?: string;
  /** Supabase anon key — browser-safe, subject to RLS. */
  supabaseAnonKey?: string;
  anthropicApiKey?: string;
  /** Master switch for the opt-in AI module. Default OFF. */
  aiEnabled: boolean;
  /** The client's smoke-user login that /api/health signs in with. */
  healthEmail?: string;
  healthPassword?: string;
  /** The per-client agent user (minted by `add-member --agent`) the CLI agent signs in as. */
  agentEmail?: string;
  agentPassword?: string;
  /**
   * True when a service-role key is present in the shell env or an .env file
   * this app loaded — presence only, the value itself is never exposed here.
   * A dashboard on the shared platform must never hold this key: it bypasses
   * RLS for every client. scripts/check-env.ts fails the build on it.
   */
  hasServiceRoleKey: boolean;
}

/**
 * Build the config snapshot from the current environment. Call this inside
 * request handlers / server components, not at module top level, so tests and
 * builds that run without env vars never trip over a missing value.
 */
export function getConfig(): AppConfig {
  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    anthropicApiKey: readEnv("ANTHROPIC_API_KEY"),
    aiEnabled: readFlag("AI_ENABLED"),
    healthEmail: readEnv("HEALTH_EMAIL"),
    healthPassword: readEnv("HEALTH_PASSWORD"),
    agentEmail: readEnv("AGENT_EMAIL"),
    agentPassword: readEnv("AGENT_PASSWORD"),
    hasServiceRoleKey: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
  };
}
