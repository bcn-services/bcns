// A minimal OAuth 2.1 authorization server for MCP connectors (Claude.ai, ChatGPT, Claude Code).
// It signs the user in with their bcns Connect password and hands back an ordinary Supabase
// session, so /mcp keeps verifying plain Supabase JWTs and RLS stays the only authorization.
// Spec: docs/architecture/chunk6c-mcp-launch.md §2. Hand-written on node:http by decision.
//
// Cookies are ignored on purpose: the hub's session cookie is scoped to .bcn-services.com and
// reaches this host, and nothing here may read or reuse it.
import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { ALLOWED_ORIGIN, hasClientClaim, type SupabaseEnv } from './auth.js'

const ISSUER = ALLOWED_ORIGIN
const MCP_RESOURCE = `${ALLOWED_ORIGIN}/mcp`

export const CODE_TTL_MS = 60_000
/** Bound on live codes. Sign-in is rate limited per IP, so this only fills under attack. */
export const MAX_CODES = 1000
export const MAX_BODY_BYTES = 16 * 1024
/** Failed or successful, every POST /authorize counts, per client IP (/64 for IPv6). */
export const LOGIN_LIMIT_PER_MIN = 10
// Every sign-in and refresh hits GoTrue from the droplet IP, sharing its per-IP buckets with the
// hub (sign_in_sign_ups 30/5 min, token_refresh 150/5 min). These process-wide caps on calls
// going upstream are what keep the hub's headroom.
export const SIGNIN_GLOBAL_LIMIT_PER_MIN = 3
export const REFRESH_GLOBAL_LIMIT_PER_MIN = 15
/** Per client IP, upstream sign-ins (right or wrong password). Below the global cap on purpose:
 *  one IP can never spend the whole global budget, so a junk flood needs two IPs or /64s. */
export const SIGNIN_IP_LIMIT_PER_MIN = 2
// Refresh admission is split by whether the IP has recently done a good exchange. Anthropic's and
// OpenAI's egress IPs do, for many users, and are "known": they only count against the global cap.
// An unknown IP is charged per ATTEMPT (junk and good alike) before any upstream call, and all
// unknown IPs together draw on one shared budget, so a flood can take at most
// REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN of the REFRESH_GLOBAL_LIMIT_PER_MIN slots.
export const REFRESH_UNKNOWN_IP_LIMIT_PER_MIN = 3
export const REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN = 5
export const KNOWN_IP_TTL_MS = 60 * 60_000
export const KNOWN_IP_MAX = 1000
/** Sign-in and refresh each finish inside this, retries included; Claude's endpoint timeout is 10 s. */
export const UPSTREAM_TIMEOUT_MS = 8000
/** Retry-After on a 503 caused by a cap, or by GoTrue answering with an error. */
export const RETRY_AFTER_SECONDS = 60
/** Retry-After when GoTrue could not be reached (timeout, network): GoTrue accepts a re-used
 *  refresh token for 10 s, so a retry inside that window still works if the first call got through. */
export const RETRY_AFTER_BLIP_SECONDS = 5

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
  /** Global cap on password sign-ins sent to GoTrue; true = may go upstream. */
  allowSignInUpstream(): boolean
  /** Per-IP cap on upstream sign-ins, checked before the global one. */
  allowSignInIp(ip: string): boolean
  /** Global cap on refreshes sent to GoTrue; true = may go upstream. */
  allowRefreshUpstream(): boolean
  /** Per-IP ATTEMPT cap for a refresh from an IP that is not "known". Counts every call. */
  allowUnknownIpRefresh(ip: string): boolean
  /** Budget shared by all unknown IPs; true = may go upstream. */
  allowUnknownRefresh(): boolean
}

// ---- Supabase-backed deps -------------------------------------------------------------------

/**
 * Plain fetch to GoTrue's token endpoint, not supabase-js: refreshSession retries network errors
 * with backoff (measured 25 s), far past Claude's 10 s endpoint timeout, and an `invalid_grant`
 * caused by a blip makes the MCP SDK throw away a good refresh token. One attempt, hard timeout,
 * and a timeout or network error is status 0 ("upstream unavailable"). Anon key only; the same
 * headers supabase-js's auth client sends. Nothing is stored here.
 */
export function supabaseSessionDeps(
  env: SupabaseEnv,
  opts: { timeoutMs?: number; fetch?: typeof fetch; log?: (line: string) => void } = {},
): Pick<OAuthDeps, 'signIn' | 'refresh'> {
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS
  const doFetch = opts.fetch ?? fetch
  const log = opts.log ?? ((line: string) => console.error(line))
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: env.anonKey }
  // New-format keys are not JWTs and must never be sent as a Bearer token.
  if (!/^sb_(publishable|secret)_/.test(env.anonKey)) headers.Authorization = `Bearer ${env.anonKey}`

  // Status only, never the body or a token: a rotated key (401) or a wrong URL (404) would
  // otherwise look like a user's mistake, and nothing else says so.
  const fail = (event: string, status: number): SessionResult => {
    log(JSON.stringify({ level: 'error', event, status }))
    return { ok: false, status }
  }

  async function grant(type: 'password' | 'refresh_token', body: Record<string, string>): Promise<SessionResult> {
    const event = type === 'password' ? 'gotrue_signin_failed' : 'gotrue_refresh_failed'
    try {
      const res = await doFetch(`${env.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=${type}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        await res.body?.cancel()
        return fail(event, res.status)
      }
      const s = (await res.json()) as Partial<Session> | null
      if (!s || typeof s.access_token !== 'string' || typeof s.refresh_token !== 'string' || typeof s.expires_in !== 'number') {
        return fail(event, 0)
      }
      return { ok: true, session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in } }
    } catch {
      return fail(event, 0) // timeout, DNS, refused, reset, bad JSON
    }
  }
  return {
    signIn: (email, password) => grant('password', { email, password }),
    refresh: (refreshToken) => grant('refresh_token', { refresh_token: refreshToken }),
  }
}

export function realRandomBytes(size: number): Buffer {
  return nodeRandomBytes(size)
}

// ---- Validation -----------------------------------------------------------------------------

const REDIRECT_EXACT = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
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
  if (host === 'claude.com') return 'Claude (claude.com)'
  if (host === 'chatgpt.com') return 'ChatGPT (chatgpt.com)'
  return 'An app on your computer'
}

/** Noun phrase for "started connecting from ___", one per host so it reads naturally. */
function appNoun(redirectUri: string): string {
  const host = new URL(redirectUri).hostname
  if (host === 'claude.ai' || host === 'claude.com') return 'your Claude'
  if (host === 'chatgpt.com') return 'your ChatGPT'
  return 'an app on this computer'
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
    // same-origin, not no-referrer: with no-referrer the browser sends `Origin: null` on the form
    // POST, which POST /authorize rightly refuses, so every real sign-in would be a 403.
    'Referrer-Policy': 'same-origin',
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
<p>Only continue if you started connecting from ${esc(appNoun(p.redirectUri))} just now. If someone sent you this link, close this page.</p>
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

/** Limiter key for a client address: IPv4 whole, IPv4-mapped IPv6 as its IPv4, other IPv6 as its
 *  /64 (one subscriber holds a whole /64, so per-address keys would be free to rotate). */
export function ipKey(ip: string): string {
  const addr = ip.split('%')[0]!.toLowerCase()
  if (isIP(addr) !== 6) return addr
  const mapped = addr.match(/^(?:0*:)*:ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? addr.match(/^(?:0*:)*:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mapped) {
    if (mapped[2] === undefined) return mapped[1]!
    const hi = parseInt(mapped[1]!, 16)
    const lo = parseInt(mapped[2], 16)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  const [head, tail = ''] = addr.split('::')
  const h = head ? head.split(':') : []
  const t = addr.includes('::') && tail ? tail.split(':') : []
  const groups = addr.includes('::') ? [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t] : h
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
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
  // IPs that recently completed a good code exchange or refresh. Map order is last-success order,
  // so the first key is the one to evict.
  const knownIps = new Map<string, number>()

  function isKnown(ip: string): boolean {
    const at = knownIps.get(ip)
    if (at === undefined) return false
    if (deps.now() - at < KNOWN_IP_TTL_MS) return true
    knownIps.delete(ip)
    return false
  }

  function markKnown(ip: string): void {
    knownIps.delete(ip)
    while (knownIps.size >= KNOWN_IP_MAX) knownIps.delete(knownIps.keys().next().value as string)
    knownIps.set(ip, deps.now())
  }

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

    if (!deps.allowLogin(ipKey(clientIp(req)))) return show(429, 'Too many attempts. Wait a minute and try again.')

    const email = form.get('email') ?? ''
    const password = form.get('password') ?? ''
    if (!email || !password || email.length > 320 || password.length > 1024) return show(401, 'Wrong email or password')

    if (!deps.allowSignInIp(ipKey(clientIp(req))) || !deps.allowSignInUpstream()) return show(429, 'Too many sign-in attempts. Try again in a minute.')
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
      // 503, never invalid_grant, for anything that is our or GoTrue's trouble rather than the
      // token's: the MCP SDK discards stored tokens on invalid_grant, so a blip would sign every
      // connected user out. Only GoTrue's 400 and 403 (and a session with no tenant) mean "this
      // refresh token is dead"; a 401 or 404 is a rotated key or a wrong URL, which is ours.
      const unavailable = (seconds = RETRY_AFTER_SECONDS) =>
        sendJson(res, 503, { error: 'temporarily_unavailable' }, { ...NO_STORE, 'Retry-After': String(seconds) })
      const ip = ipKey(clientIp(req))
      // All checks are synchronous and run before the first await, so a burst of concurrent
      // requests is counted request by request, not after the first one finishes.
      if (!isKnown(ip) && !(deps.allowUnknownIpRefresh(ip) && deps.allowUnknownRefresh())) return unavailable()
      if (!deps.allowRefreshUpstream()) return unavailable()
      const result = await deps.refresh(refreshToken)
      if (!result.ok && result.status !== 400 && result.status !== 403) {
        return unavailable(result.status === 0 ? RETRY_AFTER_BLIP_SECONDS : RETRY_AFTER_SECONDS)
      }
      if (!result.ok || !hasClientClaim(result.session.access_token)) return tokenError(res, 'invalid_grant')
      markKnown(ip)
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
    markKnown(ipKey(clientIp(req)))
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
