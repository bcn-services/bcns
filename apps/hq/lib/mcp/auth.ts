// Bearer auth for POST /mcp. The bearer is an HQ-issued OPAQUE token (oauth.ts); the Supabase JWT
// it maps to stays server-side and only ever goes to Postgres, so RLS + is_hq() gate every query.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../env";
import { createRateLimiter, limitFromEnv, type RateLimiter } from "./limit";
import {
  createOAuth,
  jwtSub,
  LOGIN_LIMIT_PER_MIN,
  publicOrigin,
  REFRESH_GLOBAL_LIMIT_PER_MIN,
  REFRESH_KNOWN_IP_LIMIT_PER_MIN,
  REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN,
  REFRESH_UNKNOWN_IP_LIMIT_PER_MIN,
  realRandomBytes,
  SIGNIN_GLOBAL_LIMIT_PER_MIN,
  SIGNIN_IP_LIMIT_PER_MIN,
  supabaseSessionDeps,
  type Member,
  type OAuth,
} from "./oauth";

const BEARER_RE = /^Bearer\s+(\S+)$/i;

/** What a 401 points a connector at to discover the authorization server (RFC 9728). */
export const resourceMetadataUrl = () =>
  `${publicOrigin()}/.well-known/oauth-protected-resource/mcp`;

/** Origins that may reach /mcp from a browser: ours and the two hosted connector UIs. Absent Origin (CLI, server-side connector) is fine. */
export function originAllowed(origin: string | null): boolean {
  return (
    origin === null || [publicOrigin(), "https://claude.ai", "https://chatgpt.com"].includes(origin)
  );
}

/** supabase-js client acting as the user: anon key + their JWT, no session storage. */
export function clientForJwt(jwt: string): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase env is not set");
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/** The caller's profiles row, read as them (RLS: is_hq()). Null = not an HQ member. */
export async function memberFor(accessToken: string): Promise<Member | null> {
  const sub = jwtSub(accessToken);
  if (!sub) return null;
  const { data } = await clientForJwt(accessToken)
    .from("profiles")
    .select("id, handle")
    .eq("id", sub)
    .maybeSingle();
  const row = data as { id: string; handle: string | null } | null;
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle === "nate" || row.handle === "brandon" ? row.handle : null,
  };
}

export interface McpRuntime {
  oauth: OAuth;
  limiter: RateLimiter;
  client(jwt: string): SupabaseClient;
}

/** Process-wide runtime on globalThis (same single-process assumption as the OAuth state). Tests seed `__hqMcp`. */
export function getRuntime(): McpRuntime {
  const g = globalThis as { __hqMcp?: McpRuntime };
  if (g.__hqMcp) return g.__hqMcp;
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase env is not set");
  const bucket = (n: number) => createRateLimiter(n);
  const loginLimiter = bucket(LOGIN_LIMIT_PER_MIN);
  const signInIp = bucket(SIGNIN_IP_LIMIT_PER_MIN);
  const signInGlobal = bucket(SIGNIN_GLOBAL_LIMIT_PER_MIN);
  const refreshKnownIp = bucket(REFRESH_KNOWN_IP_LIMIT_PER_MIN);
  const refreshUnknownIp = bucket(REFRESH_UNKNOWN_IP_LIMIT_PER_MIN);
  const refreshUnknown = bucket(REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN);
  const refreshGlobal = bucket(REFRESH_GLOBAL_LIMIT_PER_MIN);
  const oauth = createOAuth({
    ...supabaseSessionDeps({ url: supabaseUrl, anonKey: supabaseAnonKey }),
    member: memberFor,
    now: () => Date.now(),
    randomBytes: realRandomBytes,
    allowLogin: (ip) => loginLimiter.allow(ip),
    allowSignInUpstream: () => signInGlobal.allow("global"),
    allowSignInIp: (ip) => signInIp.allow(ip),
    allowRefreshUpstream: () => refreshGlobal.allow("global"),
    allowKnownIpRefresh: (ip) => refreshKnownIp.allow(ip),
    allowUnknownIpRefresh: (ip) => refreshUnknownIp.allow(ip),
    allowUnknownRefresh: () => refreshUnknown.allow("global"),
  });
  g.__hqMcp = { oauth, limiter: createRateLimiter(limitFromEnv()), client: clientForJwt };
  return g.__hqMcp;
}

const UNAUTHORIZED = () =>
  new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl()}"`,
    },
  });

const err = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export interface McpCaller {
  sb: SupabaseClient;
  actor: { id: string; handle: "nate" | "brandon" | null };
}

/** Origin, then Bearer, then rate limit, then the opaque-token lookup. A Response is a refusal. */
export function authorizeMcp(req: Request, rt: McpRuntime): McpCaller | Response {
  if (!originAllowed(req.headers.get("origin"))) return err(403, "forbidden_origin");
  const opaque = req.headers.get("authorization")?.match(BEARER_RE)?.[1];
  if (!opaque) return UNAUTHORIZED();
  if (!rt.limiter.allow(opaque)) return err(429, "rate_limited");
  const hit = rt.oauth.resolve(opaque);
  if (!hit) return UNAUTHORIZED(); // unknown or expired: the connector refreshes
  return { sb: rt.client(hit.jwt), actor: hit.member };
}
