/**
 * health.ts — pure evaluation behind /api/health.
 *
 * The hub's probe deliberately does NOT sign in (unlike apps/sb, which signs in
 * as the client's smoke user): an uptime probe that needs credentials fails for
 * the wrong reasons and puts a password in /srv/connect/env for no gain. GoTrue's
 * own /auth/v1/health is enough to say "the hub can reach the platform".
 */

export interface HealthEnv {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface HealthReport {
  status: number;
  body: { ok: boolean; platform: "unconfigured" | "connected" | "unreachable" };
}

export async function evaluateHealth(
  env: HealthEnv,
  fetchImpl: typeof fetch = fetch
): Promise<HealthReport> {
  // A keyless run (CI, a fresh droplet before the env lands) is not "down".
  if (!env.supabaseUrl) return { status: 200, body: { ok: true, platform: "unconfigured" } };

  try {
    const response = await fetchImpl(`${env.supabaseUrl.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {},
      cache: "no-store",
      // Shorter than the uptime monitor's own timeout, so a half-open GoTrue reads as unreachable.
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return { status: 200, body: { ok: true, platform: "connected" } };
  } catch {
    // fall through: unreachable is the same answer as a bad status.
  }
  return { status: 503, body: { ok: false, platform: "unreachable" } };
}
