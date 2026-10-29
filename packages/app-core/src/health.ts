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
 * Ping PostgREST with the anon key. The root (`/rest/v1/`) is OpenAPI and
 * answers 401 to every non-secret key, so probe a table that does not exist:
 * a valid key gets 404 (PGRST205), a rejected key gets 401. 401/403 count as
 * down (reachable but the key is rejected, so every real query would fail);
 * network failure and 5xx too. Other <500 means up. Plain fetch — no SDK.
 */
export const pingSupabase: DbPing = async (supabaseUrl, anonKey) => {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/_health_probe?limit=1`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 500 && res.status !== 401 && res.status !== 403;
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
