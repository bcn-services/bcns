// Bearer-only auth for the MCP endpoint. There is no privileged credential here on purpose:
// the caller's own Supabase JWT is forwarded to Postgres and RLS is the only authorization.
// Deliberate deviation from the OAuth 2.1 norm for v1 — see docs/architecture/chunk6-mcp-window.md.
import { createClient } from '@supabase/supabase-js'
import { createDataClient, type DataClient } from '@bcn-services/data-client'

/** Same shape as platform/supabase/functions/_shared/guard.ts:44. */
const BEARER_RE = /^Bearer\s+(\S+)$/i

/** The one origin a browser-based client may claim. Anything else is a DNS-rebinding attempt. */
export const ALLOWED_ORIGIN = 'https://mcp.bcn-services.com'

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
  return origin === undefined || origin === ALLOWED_ORIGIN
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

/** Verify a token the way deps.ts:68 does. Returns the user id, or null. */
export async function verifyToken(token: string, env: SupabaseEnv): Promise<string | null> {
  const auth = createClient(env.url, env.anonKey, { auth: { persistSession: false } })
  const { data, error } = await auth.auth.getUser(token)
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
}

export type AuthResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; status: number; body: { error: string }; headers?: Record<string, string> }

const UNAUTHORIZED = {
  ok: false as const,
  status: 401,
  body: { error: 'unauthorized' },
  headers: { 'WWW-Authenticate': 'Bearer realm="bcns"' },
}

/** Origin, then Bearer, then rate limit, then token verification. */
export async function authorize(headers: HeaderBag, deps: AuthDeps): Promise<AuthResult> {
  if (!originAllowed(headers)) return { ok: false, status: 403, body: { error: 'forbidden_origin' } }

  const token = bearer(headers)
  if (!token) return UNAUTHORIZED

  if (!deps.allow(token)) return { ok: false, status: 429, body: { error: 'rate_limited' } }

  const userId = await deps.verify(token)
  if (!userId) return UNAUTHORIZED

  return { ok: true, token, userId }
}
