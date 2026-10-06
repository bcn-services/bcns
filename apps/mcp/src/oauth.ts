// A minimal OAuth 2.1 authorization server for MCP connectors (Claude.ai, ChatGPT, Claude Code).
// It signs the user in with their bcns Connect password and hands back an ordinary Supabase
// session, so /mcp keeps verifying plain Supabase JWTs and RLS stays the only authorization.
// Spec: docs/architecture/chunk6c-mcp-launch.md §2. Hand-written on node:http by decision.
//
// Cookies are ignored on purpose: the hub's session cookie is scoped to .bcn-services.com and
// reaches this host, and nothing here may read or reuse it.
import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { ALLOWED_ORIGIN, hasClientClaim, type SupabaseEnv } from './auth.js'

const ISSUER = ALLOWED_ORIGIN
const MCP_RESOURCE = `${ALLOWED_ORIGIN}/mcp`

export const CODE_TTL_MS = 60_000
/** Bound on live codes. Sign-in is rate limited per IP, so this only fills under attack. */
export const MAX_CODES = 1000
export const MAX_BODY_BYTES = 16 * 1024
/** Failed or successful, every POST /authorize counts. */
export const LOGIN_LIMIT_PER_MIN = 10

export interface Session {
  access_token: string
  refresh_token: string
  expires_in: number
}

/** `status` is the auth server's HTTP status, or 0 when it could not be reached. */
export type SessionResult = { ok: true; session: Session } | { ok: false; status: number }

export interface OAuthDeps {
  signIn(email: string, password: string): Promise<SessionResult>
  refresh(refreshToken: string): Promise<SessionResult>
  now(): number
  randomBytes(size: number): Buffer
  /** True while this IP is under its sign-in budget. */
  allowLogin(ip: string): boolean
}

// ---- Supabase-backed deps -------------------------------------------------------------------

/** A fresh client per call: sign-in and refresh set in-memory session state on the client, and
 *  concurrent users must never share one. Anon key only; nothing is persisted or auto-refreshed. */
export function supabaseSessionDeps(env: SupabaseEnv): Pick<OAuthDeps, 'signIn' | 'refresh'> {
  const client = () =>
    createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  const toResult = (r: {
    data: { session: { access_token: string; refresh_token: string; expires_in: number } | null }
    error: { status?: number } | null
  }): SessionResult => {
    const s = r.data.session
    if (r.error || !s) return { ok: false, status: r.error?.status ?? 0 }
    return { ok: true, session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in } }
  }
  return {
    async signIn(email, password) {
      try {
        return toResult(await client().auth.signInWithPassword({ email, password }))
      } catch {
        return { ok: false, status: 0 }
      }
    },
    async refresh(refreshToken) {
      try {
        return toResult(await client().auth.refreshSession({ refresh_token: refreshToken }))
      } catch {
        return { ok: false, status: 0 }
      }
    },
  }
}

export function realRandomBytes(size: number): Buffer {
  return nodeRandomBytes(size)
}

// ---- Validation -----------------------------------------------------------------------------

const REDIRECT_EXACT = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
])
const CHATGPT_CONNECTOR_RE = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/
const LOOPBACK_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}(\/[^#\s]*)?$/

/** Exact match for the hosted connectors, any port for loopback (Claude Code), http only there. */
export function redirectAllowed(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length > 512) return false
  if (REDIRECT_EXACT.has(uri) || CHATGPT_CONNECTOR_RE.test(uri)) return true
  if (!LOOPBACK_RE.test(uri)) return false
  try {
    const u = new URL(uri)
    return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.username === '' && u.password === ''
  } catch {
    return false // port above 65535
  }
}

const CLIENT_ID_RE = /^[A-Za-z0-9_.~-]{1,128}$/
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/
const MAX_STATE = 1024

interface AuthorizeParams {
  clientId: string
  redirectUri: string
  state: string | null
  challenge: string
  resource: string | null
}

/** Null on anything off-spec. Not redirected with an error: the caller shows a plain 400 page. */
function parseAuthorizeParams(q: URLSearchParams): AuthorizeParams | null {
  const clientId = q.get('client_id') ?? ''
  const redirectUri = q.get('redirect_uri')
  const challenge = q.get('code_challenge') ?? ''
  const state = q.get('state')
  const resource = q.get('resource')
  if (q.get('response_type') !== 'code') return null
  if (q.get('code_challenge_method') !== 'S256') return null
  if (!CLIENT_ID_RE.test(clientId)) return null
  if (!redirectAllowed(redirectUri)) return null
  if (!CHALLENGE_RE.test(challenge)) return null
  if (state !== null && state.length > MAX_STATE) return null
  if (resource !== null && resource !== '' && resource !== MCP_RESOURCE) return null
  return { clientId, redirectUri, state: state === null || state === '' ? null : state, challenge, resource: resource || null }
}

// ---- HTML -----------------------------------------------------------------------------------

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** Derived from the validated redirect, never from anything the client claims about itself. */
function appLabel(redirectUri: string): string {
  const host = new URL(redirectUri).hostname
  if (host === 'claude.ai') return 'Claude (claude.ai)'
  if (host === 'chatgpt.com') return 'ChatGPT (chatgpt.com)'
  return 'An app on your computer (Claude Code)'
}

/** Chromium also applies form-action to the redirect that follows the POST, so the allowlisted
 *  redirect origin has to be listed next to 'self' or the final hop to Claude is blocked. */
function pageHeaders(redirectUri?: string): Record<string, string> {
  const formAction = redirectUri ? `'self' ${new URL(redirectUri).origin}` : `'self'`
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'`,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  }
}

const STYLE = `body{font:16px system-ui,sans-serif;max-width:24rem;margin:3rem auto;padding:0 1rem;color:#2b2f36;background:#fafafa}
label{display:block;margin:1rem 0 .25rem}input{width:100%;box-sizing:border-box;padding:.6rem;font:inherit}
button{margin-top:1.25rem;padding:.65rem 1.2rem;font:inherit;cursor:pointer}.err{color:#a4262c;margin:1rem 0 0}`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`
}

function formHtml(p: AuthorizeParams, error?: string): string {
  const hidden = (name: string, value: string | null) =>
    value === null ? '' : `<input type="hidden" name="${name}" value="${esc(value)}">`
  return page(
    'Sign in to bcns',
    `<h1>Sign in to bcns</h1>
<p>${esc(appLabel(p.redirectUri))} wants read-only access to your bcns data.</p>
<form method="post" action="/authorize">
${hidden('response_type', 'code')}${hidden('code_challenge_method', 'S256')}${hidden('client_id', p.clientId)}${hidden('redirect_uri', p.redirectUri)}${hidden('state', p.state)}${hidden('code_challenge', p.challenge)}${hidden('resource', p.resource)}
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="320">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024">
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<button type="submit">Sign in and connect</button>
</form>`,
  )
}

// ---- HTTP helpers ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

function tokenError(res: ServerResponse, error: string, status = 400): void {
  sendJson(res, status, { error }, NO_STORE)
}

function sendPage(res: ServerResponse, status: number, html: string, redirectUri?: string): void {
  res.writeHead(status, pageHeaders(redirectUri))
  res.end(html)
}

const BAD_REQUEST_PAGE = page(
  'Cannot connect',
  '<h1>Cannot connect</h1><p>This connection request is not valid. Go back to the app and try again.</p>',
)

/** The body as text, or null when it exceeds the cap (the caller answers 413). */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) return resolve(null)
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0
        req.removeAllListeners('data')
        req.resume()
        return resolve(null)
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function tooLarge(req: IncomingMessage, res: ServerResponse): void {
  res.on('finish', () => req.destroy())
  sendJson(res, 413, { error: 'payload_too_large' }, { Connection: 'close' })
}

function contentType(req: IncomingMessage): string {
  return (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()
}

/** Behind nginx (proxy_add_x_forwarded_for) the LAST hop is the address nginx itself saw; earlier
 *  hops are whatever the caller claimed. Direct-to-port callers fall back to the socket. */
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for']
  const last = (Array.isArray(xff) ? xff.join(',') : xff)?.split(',').pop()?.trim()
  return last || req.socket.remoteAddress || 'unknown'
}

function sha256b64u(input: string): string {
  return createHash('sha256').update(input).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// ---- Handler --------------------------------------------------------------------------------

interface CodeRecord {
  session: Session
  challenge: string
  redirectUri: string
  clientId: string
  expiresAt: number
}

/**
 * Returns a handler that serves the OAuth routes and resolves `true` when it answered, `false`
 * when the request is none of its business (the caller falls through to /mcp or 404).
 */
// ponytail: codes live in this process's memory — a restart mid-sign-in means "click Connect
// again", and a second process would break the code hand-off. Move to Postgres if either bites.
export function createOAuthHandler(deps: OAuthDeps) {
  const codes = new Map<string, CodeRecord>()

  function sweep(): void {
    // Constant TTL means insertion order is expiry order: stop at the first live entry.
    const now = deps.now()
    for (const [code, rec] of codes) {
      if (rec.expiresAt > now) break
      codes.delete(code)
    }
  }

  async function authorizeGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const params = parseAuthorizeParams(new URL(req.url ?? '', ISSUER).searchParams)
    if (!params) return sendPage(res, 400, BAD_REQUEST_PAGE)
    sendPage(res, 200, formHtml(params), params.redirectUri)
  }

  async function authorizePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.origin !== ALLOWED_ORIGIN) return sendJson(res, 403, { error: 'forbidden_origin' })
    if (contentType(req) !== 'application/x-www-form-urlencoded') return sendPage(res, 400, BAD_REQUEST_PAGE)
    const raw = await readBody(req)
    if (raw === null) return tooLarge(req, res)
    const form = new URLSearchParams(raw)
    const params = parseAuthorizeParams(form)
    if (!params) return sendPage(res, 400, BAD_REQUEST_PAGE)
    const show = (status: number, error: string) => sendPage(res, status, formHtml(params, error), params.redirectUri)

    if (!deps.allowLogin(clientIp(req))) return show(429, 'Too many attempts. Wait a minute and try again.')

    const email = form.get('email') ?? ''
    const password = form.get('password') ?? ''
    if (!email || !password || email.length > 320 || password.length > 1024) return show(401, 'Wrong email or password')

    const result = await deps.signIn(email, password)
    if (!result.ok) {
      if (result.status === 403) return show(403, 'No active bcns membership')
      if (result.status === 0 || result.status === 429 || result.status >= 500) {
        return show(503, 'Sign-in is unavailable. Try again shortly.')
      }
      return show(401, 'Wrong email or password')
    }
    // A pending self-service sign-up signs in fine but carries no tenant.
    if (!hasClientClaim(result.session.access_token)) return show(403, 'No active bcns membership')

    sweep()
    if (codes.size >= MAX_CODES) return show(503, 'Sign-in is busy. Try again shortly.')
    const code = deps.randomBytes(32).toString('base64url')
    codes.set(code, {
      session: result.session,
      challenge: params.challenge,
      redirectUri: params.redirectUri,
      clientId: params.clientId,
      expiresAt: deps.now() + CODE_TTL_MS,
    })

    const location = new URL(params.redirectUri)
    location.searchParams.set('code', code)
    if (params.state) location.searchParams.set('state', params.state)
    location.searchParams.set('iss', ISSUER)
    res.writeHead(302, { Location: location.toString(), 'Cache-Control': 'no-store' })
    res.end()
  }

  function tokenBody(session: Session) {
    return { access_token: session.access_token, token_type: 'Bearer', expires_in: session.expires_in, refresh_token: session.refresh_token }
  }

  async function token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (contentType(req) !== 'application/x-www-form-urlencoded') return tokenError(res, 'invalid_request')
    const raw = await readBody(req)
    if (raw === null) return tooLarge(req, res)
    const form = new URLSearchParams(raw)
    const grant = form.get('grant_type')

    if (grant === 'refresh_token') {
      const refreshToken = form.get('refresh_token')
      if (!refreshToken) return tokenError(res, 'invalid_request')
      const result = await deps.refresh(refreshToken)
      if (!result.ok || !hasClientClaim(result.session.access_token)) return tokenError(res, 'invalid_grant')
      return sendJson(res, 200, tokenBody(result.session), NO_STORE)
    }

    if (grant !== 'authorization_code') return tokenError(res, grant ? 'unsupported_grant_type' : 'invalid_request')

    const code = form.get('code')
    const verifier = form.get('code_verifier')
    const redirectUri = form.get('redirect_uri')
    const clientId = form.get('client_id')
    if (!code || !verifier || !redirectUri || !clientId) return tokenError(res, 'invalid_request')

    // Single use: gone after the first attempt, whether or not it succeeds.
    const rec = codes.get(code)
    codes.delete(code)
    if (!rec || rec.expiresAt <= deps.now()) return tokenError(res, 'invalid_grant')
    if (rec.redirectUri !== redirectUri || rec.clientId !== clientId) return tokenError(res, 'invalid_grant')
    if (!VERIFIER_RE.test(verifier) || !safeEqual(sha256b64u(verifier), rec.challenge)) {
      return tokenError(res, 'invalid_grant')
    }
    sendJson(res, 200, tokenBody(rec.session), NO_STORE)
  }

  // Stateless DCR: validate the redirects, mint a random client_id, remember nothing.
  async function register(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await readBody(req)
    if (raw === null) return tooLarge(req, res)
    let meta: unknown
    try {
      meta = JSON.parse(raw)
    } catch {
      return sendJson(res, 400, { error: 'invalid_client_metadata' }, NO_STORE)
    }
    const uris = (meta as { redirect_uris?: unknown } | null)?.redirect_uris
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(redirectAllowed)) {
      return sendJson(res, 400, { error: 'invalid_redirect_uri' }, NO_STORE)
    }
    sendJson(
      res,
      201,
      {
        client_id: deps.randomBytes(16).toString('base64url'),
        client_id_issued_at: Math.floor(deps.now() / 1000),
        redirect_uris: uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      NO_STORE,
    )
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = (req.url ?? '').split('?')[0]
    const get = req.method === 'GET'
    const post = req.method === 'POST'

    if (get && (path === '/.well-known/oauth-protected-resource/mcp' || path === '/.well-known/oauth-protected-resource')) {
      sendJson(res, 200, { resource: MCP_RESOURCE, authorization_servers: [ISSUER] })
    } else if (get && path === '/.well-known/oauth-authorization-server') {
      sendJson(res, 200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        registration_endpoint: `${ISSUER}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
      })
    } else if (post && path === '/register') await register(req, res)
    else if (get && path === '/authorize') await authorizeGet(req, res)
    else if (post && path === '/authorize') await authorizePost(req, res)
    else if (post && path === '/token') await token(req, res)
    else return false
    return true
  }
}
