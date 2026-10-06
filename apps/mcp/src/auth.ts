// Bearer auth for the MCP endpoint. There is no privileged credential here on purpose:
// the caller's own Supabase JWT is forwarded to Postgres and RLS is the only authorization.
// Connectors obtain that JWT from the authorization server in oauth.ts — see
// docs/architecture/chunk6c-mcp-launch.md §2.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDataClient, type DataClient } from '@bcn-services/data-client'

/** Same shape as platform/supabase/functions/_shared/guard.ts:44. */
const BEARER_RE = /^Bearer\s+(\S+)$/i

/** This server's own origin; also the OAuth issuer and the only Origin POST /authorize accepts. */
export const ALLOWED_ORIGIN = 'https://mcp.bcn-services.com'

/** Origins that may reach /mcp from a browser: ours, and the two hosted connector UIs.
 *  Anything else is a DNS-rebinding attempt. Absent Origin (CLI, server-side connector) is fine. */
const MCP_ORIGINS: ReadonlySet<string> = new Set([ALLOWED_ORIGIN, 'https://claude.ai', 'https://chatgpt.com'])

/** What a 401 points a connector at to discover the authorization server (RFC 9728). */
export const RESOURCE_METADATA_URL = `${ALLOWED_ORIGIN}/.well-known/oauth-protected-resource/mcp`

export type HeaderBag = Record<string, string | string[] | undefined>

function header(headers: HeaderBag, name: string): string | undefined {
  // Node lowercases incoming header names; a hand-built bag may not.
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== lower) continue
    const value = headers[key]
    return Array.isArray(value) ? value[0] : value
  }
  return undefined
}

/** The raw JWT from `Authorization: Bearer <jwt>`, or null. */
export function bearer(headers: HeaderBag): string | null {
  const match = header(headers, 'authorization')?.match(BEARER_RE)
  return match?.[1] ?? null
}

/** Absent Origin is fine (a CLI has none). Present and wrong is rejected. */
export function originAllowed(headers: HeaderBag): boolean {
  const origin = header(headers, 'origin')
  return origin === undefined || MCP_ORIGINS.has(origin)
}

export interface SupabaseEnv {
  url: string
  anonKey: string
}

/** Anon key only. The service-role key must never reach this process. */
export function supabaseEnv(env: NodeJS.ProcessEnv = process.env): SupabaseEnv {
  const url = env.SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
  return { url, anonKey }
}

// One client for the process, not one per request. getUser(jwt) takes the token as an argument
// and never touches the session store, so there is nothing per-caller to keep apart.
// autoRefreshToken must stay false: outside a browser auth-js arms a 30s setInterval on construct
// (GoTrueClient _handleVisibilityChange) that nothing here would ever clear.
let cached: { key: string; client: SupabaseClient } | null = null

function authClient(env: SupabaseEnv): SupabaseClient {
  const key = `${env.url}\u0000${env.anonKey}`
  if (cached?.key !== key) {
    cached = {
      key,
      client: createClient(env.url, env.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    }
  }
  return cached.client
}

/** Verify a token the way deps.ts:68 does. Returns the user id, or null. */
export async function verifyToken(token: string, env: SupabaseEnv): Promise<string | null> {
  const { data, error } = await authClient(env).auth.getUser(token)
  if (error) return null
  return data.user?.id ?? null
}

/** The caller's own token goes down to Postgres, so RLS scopes every read and write. */
export function clientForToken(token: string, env: SupabaseEnv): DataClient {
  return createDataClient({ supabaseUrl: env.url, anonKey: env.anonKey, accessToken: token })
}

export interface AuthDeps {
  /** Resolve a token to a user id, or null when it is not valid. */
  verify(token: string): Promise<string | null>
  /** True while the caller is under its per-minute budget. */
  allow(token: string): boolean
  /** Called with the offending Origin so a surprise from a real connector shows up in the journal. */
  warn?(message: string): void
}

export type AuthResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; status: number; body: { error: string }; headers?: Record<string, string> }

const UNAUTHORIZED = {
  ok: false as const,
  status: 401,
  body: { error: 'unauthorized' },
  headers: { 'WWW-Authenticate': `Bearer resource_metadata="${RESOURCE_METADATA_URL}"` },
}

/**
 * The tenant claim the access-token hook writes. Decode-only: called after `verify` has had the
 * auth server check this exact token. A pending self-service sign-up (P1) is issued a session
 * with no client_id, so it is refused here instead of reaching tools that RLS would empty anyway.
 */
export function hasClientClaim(token: string): boolean {
  try {
    const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    const clientId = (claims as Record<string, unknown> | null)?.client_id
    return typeof clientId === 'string' && clientId.length > 0
  } catch {
    return false
  }
}

/** Origin, then Bearer, then rate limit, then token verification, then the tenant claim. */
export async function authorize(headers: HeaderBag, deps: AuthDeps): Promise<AuthResult> {
  if (!originAllowed(headers)) {
    // JSON-quoted and clipped: the value is attacker-controlled and this lands in the journal.
    deps.warn?.(`mcp: rejected Origin ${JSON.stringify(String(header(headers, 'origin')).slice(0, 200))}`)
    return { ok: false, status: 403, body: { error: 'forbidden_origin' } }
  }

  const token = bearer(headers)
  if (!token) return UNAUTHORIZED

  if (!deps.allow(token)) return { ok: false, status: 429, body: { error: 'rate_limited' } }

  const userId = await deps.verify(token)
  if (!userId) return UNAUTHORIZED
  if (!hasClientClaim(token)) return { ok: false, status: 403, body: { error: 'no_membership' } }

  return { ok: true, token, userId }
}
