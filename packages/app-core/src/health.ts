/**
 * health.ts — Pure health evaluation for a client app's /api/health endpoint.
 *
 * The platform rule (hosting reference): every client app exposes a real
 * health endpoint that checks DB connectivity, not just process-up, so
 * UptimeRobot catches a dead database before the client does. The evaluation
 * is pure and separated from the route so it is unit-testable without network.
 *
 * Keyless behavior: with no Supabase env configured the app must still serve
 * (template contract), so "unconfigured" is healthy-with-a-caveat, while a
 * configured-but-failing DB ping is unhealthy (503 at the route).
 *
 * This module never reads process.env — the app passes its config in
 * (structurally compatible with the template's AppConfig).
 */

export interface HealthConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export type DbStatus = "connected" | "unconfigured" | "error";

export interface HealthReport {
  ok: boolean;
  db: DbStatus;
}

export type DbPing = (supabaseUrl: string, anonKey: string) => Promise<boolean>;

/**
 * Ping the Supabase REST endpoint with the anon key. Any response below 500
 * proves the project is reachable (an auth error still demonstrates
 * connectivity); only network failure or 5xx counts as down. Plain fetch —
 * no SDK dependency.
 */
export const pingSupabase: DbPing = async (supabaseUrl, anonKey) => {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
};

/** Evaluate health from config + an injectable ping (test seam). */
export async function evaluateHealth(
  config: HealthConfig,
  ping: DbPing = pingSupabase,
): Promise<HealthReport> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { ok: true, db: "unconfigured" };
  }
  const reachable = await ping(config.supabaseUrl, config.supabaseAnonKey);
  return reachable ? { ok: true, db: "connected" } : { ok: false, db: "error" };
}
