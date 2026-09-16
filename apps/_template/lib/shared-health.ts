/**
 * shared-health.ts — /api/health, the only health path (shared-platform mode
 * is the only mode).
 *
 * The uptime probe has no user session, and the platform answers only signed-in
 * users. So the app signs in as this client's smoke user (HEALTH_EMAIL /
 * HEALTH_PASSWORD, minted by platform `onboard`) and reads its `client_v1` row.
 * That is a real view read (R37): it proves the platform is up AND this client's
 * tenant, auth hook, and RLS path work. A deploy that can't read data fails the
 * health check and rolls back.
 *
 * Pure evaluation with an injectable probe (test seam), like app-core's
 * evaluateHealth. Never reads process.env; the route passes config in.
 */

import { signIn, type SignedInDataClient } from "@bcn-services/data-client";
import type { AppConfig } from "./env";

export interface SharedHealthReport {
  ok: boolean;
  platform: "connected" | "unconfigured" | "error";
  reason?: "service_key_present" | "tenant_pin_missing" | "health_login_missing" | "probe_failed";
}

export interface ProbeCreds {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
}

export type PlatformProbe = (creds: ProbeCreds) => Promise<void>;

const PROBE_TIMEOUT_MS = 5000;

// One sign-in per token lifetime, not per probe: UptimeRobot hits this every few
// minutes and each sign-in would leave a session row behind. `signIn`'s own token
// getter refreshes near expiry, so we only need to cache the sign-in itself here —
// reset to null on any failure so the next probe retries a fresh sign-in.
let client: Promise<SignedInDataClient> | null = null;

export const probePlatform: PlatformProbe = async (c) => {
  try {
    const signedIn = await (client ??= signIn({
      supabaseUrl: c.supabaseUrl,
      anonKey: c.anonKey,
      email: c.email,
      password: c.password,
    }));
    await signedIn.health();
  } catch (e) {
    client = null;
    throw e;
  }
};

export async function evaluateSharedHealth(
  config: AppConfig,
  probe: PlatformProbe = probePlatform,
): Promise<SharedHealthReport> {
  // Runtime twin of scripts/check-env.ts: the droplet env is never seen at build.
  if (config.hasServiceRoleKey) return { ok: false, platform: "error", reason: "service_key_present" };
  const { supabaseUrl, supabaseAnonKey, expectedClientId, healthEmail, healthPassword } = config;
  // Keyless template runs stay green (R38 contract).
  if (!supabaseUrl || !supabaseAnonKey) return { ok: true, platform: "unconfigured" };
  // /api/health sits outside the tenant middleware, so mirror pinOrDeny here:
  // a deploy without the pin denies every user request and must not look healthy.
  if (!expectedClientId?.trim()) return { ok: false, platform: "error", reason: "tenant_pin_missing" };
  // Pointed at the platform but no probe login: a deploy mistake, fail loudly.
  if (!healthEmail || !healthPassword) return { ok: false, platform: "error", reason: "health_login_missing" };
  try {
    await Promise.race([
      probe({ supabaseUrl, anonKey: supabaseAnonKey, email: healthEmail, password: healthPassword }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("health probe timed out")), PROBE_TIMEOUT_MS).unref?.()),
    ]);
    return { ok: true, platform: "connected" };
  } catch (e) {
    console.error("[health] shared platform probe failed:", e instanceof Error ? e.message : e);
    return { ok: false, platform: "error", reason: "probe_failed" };
  }
}
