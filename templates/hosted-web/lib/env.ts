/**
 * env.ts — Single, lazy accessor for all runtime configuration.
 *
 * Every value is read from process.env at CALL TIME, never at module import.
 * This keeps the app buildable and importable when no keys are set: nothing
 * here throws or reads env as a side effect of `import`. Missing values come
 * back as `undefined` and each consumer decides how to degrade gracefully.
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
  databaseUrl?: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  anthropicApiKey?: string;
  /** Master switch for the opt-in AI module. Default OFF. */
  aiEnabled: boolean;
}

/**
 * Build the config snapshot from the current environment. Call this inside
 * request handlers / server components, not at module top level, so tests and
 * builds that run without env vars never trip over a missing value.
 */
export function getConfig(): AppConfig {
  return {
    databaseUrl: readEnv("DATABASE_URL"),
    clerkPublishableKey: readEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    clerkSecretKey: readEnv("CLERK_SECRET_KEY"),
    stripeSecretKey: readEnv("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: readEnv("STRIPE_WEBHOOK_SECRET"),
    anthropicApiKey: readEnv("ANTHROPIC_API_KEY"),
    aiEnabled: readFlag("AI_ENABLED"),
  };
}
