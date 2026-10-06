// The authorization server, driven over a real node:http server with every dependency faked:
// no Supabase, no clock, no entropy. Imports the compiled output like the other tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import {
  createOAuthHandler,
  redirectAllowed,
  clientIp,
  ipKey,
  supabaseSessionDeps,
  CODE_TTL_MS,
  MAX_CODES,
  MAX_BODY_BYTES,
  LOGIN_LIMIT_PER_MIN,
  REFRESH_GLOBAL_LIMIT_PER_MIN,
  REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN,
  REFRESH_UNKNOWN_IP_LIMIT_PER_MIN,
  SIGNIN_GLOBAL_LIMIT_PER_MIN,
  SIGNIN_IP_LIMIT_PER_MIN,
  KNOWN_IP_TTL_MS,
  KNOWN_IP_MAX,
  RETRY_AFTER_BLIP_SECONDS,
  UPSTREAM_TIMEOUT_MS,
  RETRY_AFTER_SECONDS,
} from '../dist/oauth.js'
import { createRateLimiter } from '../dist/limit.js'

const ISS = 'https://mcp.bcn-services.com'
const RESOURCE = `${ISS}/mcp`
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback'
const CLAUDE_COM = 'https://claude.com/api/mcp/auth_callback'
const jwt = (claims) => `h.${Buffer.from(JSON.stringify({ sub: 'u1', ...claims })).toString('base64url')}.s`
const MEMBER_TOKEN = jwt({ client_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' })
const PENDING_TOKEN = jwt({ client_status: 'pending' })
const b64u = (s) => createHash('sha256').update(s).digest('base64url')
const VERIFIER = 'v'.repeat(43)
const CHALLENGE = b64u(VERIFIER)

/** Boots the handler on an ephemeral port. `over` replaces any dep; `state` exposes the fakes. */
async function boot(over = {}) {
  const state = { now: 1_000_000, signIns: [], refreshes: [], ips: [], counter: 0 }
  const deps = {
    signIn: async (email, password) => {
      state.signIns.push([email, password])
      return { ok: true, session: { access_token: MEMBER_TOKEN, refresh_token: 'refresh-1', expires_in: 600 } }
    },
    refresh: async (rt) => {
      state.refreshes.push(rt)
      return { ok: true, session: { access_token: MEMBER_TOKEN, refresh_token: 'refresh-2', expires_in: 600 } }
    },
    now: () => state.now,
    // Deterministic and distinct per call, so a code is predictable but never repeats.
    randomBytes: (n) => {
      const b = Buffer.alloc(n)
      b.writeUInt32BE(++state.counter)
      return b
    },
    allowLogin: (ip) => (state.ips.push(ip), true),
    allowSignInUpstream: () => true,
    allowSignInIp: () => true,
    allowRefreshUpstream: () => true,
    allowUnknownIpRefresh: () => true,
    allowUnknownRefresh: () => true,
    ...over,
  }
  const handle = createOAuthHandler(deps)
  const server = createServer((req, res) => {
    handle(req, res).then((done) => {
      if (!done) {
        res.writeHead(404)
        res.end()
      }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const req = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init })
  return { req, state, close: () => (server.close(), server.closeAllConnections()), server }
}

const authQuery = (over = {}) =>
  new URLSearchParams({
    response_type: 'code',
    client_id: 'client-1',
    redirect_uri: CLAUDE,
    state: 'st-1',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    resource: RESOURCE,
    ...over,
  })

const form = (params) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
})

const login = (over = {}, headers = {}) => {
  const q = authQuery(over)
  q.set('email', over.email ?? 'owner@example.com')
  q.set('password', over.password ?? 'pw')
  const init = form(q)
  init.headers = { ...init.headers, origin: ISS, ...headers }
  return init
}

/** Runs a good sign-in and returns the code from the 302. */
async function getCode(t, over = {}) {
  const res = await t.req('/authorize', login(over))
  assert.equal(res.status, 302)
  return new URL(res.headers.get('location')).searchParams.get('code')
}

const tokenReq = (params) => form(new URLSearchParams(params))
const exchange = (code, over = {}) =>
  tokenReq({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CLAUDE,
    client_id: 'client-1',
    code_verifier: VERIFIER,
    ...over,
  })

// ---- metadata ---------------------------------------------------------------------------------

test('protected-resource metadata, both paths', async () => {
  const t = await boot()
  for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const res = await t.req(path)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { resource: RESOURCE, authorization_servers: [ISS] })
  }
  t.close()
})

test('authorization-server metadata', async () => {
  const t = await boot()
  const res = await t.req('/.well-known/oauth-authorization-server')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    issuer: ISS,
    authorization_endpoint: `${ISS}/authorize`,
    token_endpoint: `${ISS}/token`,
    registration_endpoint: `${ISS}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  })
  t.close()
})

test('routes it does not own fall through', async () => {
  const t = await boot()
  assert.equal((await t.req('/mcp', { method: 'POST' })).status, 404)
  assert.equal((await t.req('/token')).status, 404)
  assert.equal((await t.req('/.well-known/nope')).status, 404)
  t.close()
})

// ---- redirect allowlist -----------------------------------------------------------------------

test('redirectAllowed: exactly the spec list', () => {
  for (const ok of [
    CLAUDE,
    CLAUDE_COM,
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'https://chatgpt.com/connector/oauth/abc_DEF-123',
    'http://localhost:54321/callback',
    'http://127.0.0.1:8080/cb?x=1',
    'http://localhost:3000',
  ]) assert.equal(redirectAllowed(ok), true, ok)
  for (const bad of [
    undefined,
    '',
    'https://claude.ai/api/mcp/auth_callback/',
    'https://claude.com/api/mcp/auth_callback/',
    'https://claude.com/api/mcp/auth_callback?x=1',
    'https://www.claude.com/api/mcp/auth_callback',
    'http://claude.com/api/mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback?x=1',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    'http://claude.ai/api/mcp/auth_callback',
    'https://chatgpt.com/connector/oauth/',
    'https://chatgpt.com/connector/oauth/a/b',
    'https://chatgpt.com/connector/oauth/a?x=1',
    'https://localhost:3000/cb',
    'http://localhost/cb',
    'http://localhost:99999/cb',
    'http://localhost:3000@evil.example/cb',
    'http://localhost.evil.example:3000/cb',
    'http://evil.example:3000/cb',
    'http://[::1]:3000/cb',
    'http://localhost:3000/cb#frag',
    'javascript:alert(1)',
  ]) assert.equal(redirectAllowed(bad), false, String(bad))
})

// ---- /register --------------------------------------------------------------------------------

const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('register: good redirects get a random client_id, nothing stored', async () => {
  const t = await boot()
  const res = await t.req('/register', json({ redirect_uris: [CLAUDE, 'http://localhost:5555/cb'], client_name: '<script>' }))
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.match(body.client_id, /^[A-Za-z0-9_-]{22}$/)
  assert.deepEqual(body.redirect_uris, [CLAUDE, 'http://localhost:5555/cb'])
  assert.equal(body.token_endpoint_auth_method, 'none')
  assert.deepEqual(body.grant_types, ['authorization_code', 'refresh_token'])
  assert.equal('client_name' in body, false)
  t.close()
})

test('register: any bad redirect, missing list, or bad JSON is refused', async () => {
  const t = await boot()
  for (const body of [
    { redirect_uris: [CLAUDE, 'https://evil.example/cb'] },
    { redirect_uris: ['https://evil.example/cb'] },
    { redirect_uris: [] },
    { redirect_uris: CLAUDE },
    {},
    null,
  ]) {
    const res = await t.req('/register', json(body))
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.match((await res.json()).error, /^invalid_(redirect_uri|client_metadata)$/)
  }
  const res = await t.req('/register', { method: 'POST', body: '{nope' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'invalid_client_metadata')
  t.close()
})

// ---- GET /authorize ---------------------------------------------------------------------------

test('authorize GET: good request renders the form with hardened headers', async () => {
  const t = await boot()
  const res = await t.req(`/authorize?${authQuery()}`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^text\/html/)
  const csp = res.headers.get('content-security-policy')
  assert.match(csp, /default-src 'none'/)
  assert.match(csp, /style-src 'unsafe-inline'/)
  assert.match(csp, /form-action 'self' https:\/\/claude\.ai(;|$)/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const html = await res.text()
  assert.match(html, /Claude \(claude\.ai\) wants read-only access to your bcns data/)
  assert.match(html, /name="email"/)
  assert.match(html, /name="password"/)
  for (const [name, value] of [
    ['client_id', 'client-1'],
    ['redirect_uri', CLAUDE],
    ['state', 'st-1'],
    ['code_challenge', CHALLENGE],
    ['resource', RESOURCE],
  ]) assert.match(html, new RegExp(`name="${name}" value="${value}"`), name)
  t.close()
})

test('authorize GET: reflected values are escaped', async () => {
  const t = await boot()
  const evil = `"><script>alert(1)</script>&'`
  const res = await t.req(`/authorize?${authQuery({ state: evil })}`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /name="state" value="&#34;&#62;&#60;script&#62;alert\(1\)&#60;\/script&#62;&#38;&#39;"/)
  t.close()
})

test('authorize GET: loopback redirect lists its own origin in form-action', async () => {
  const t = await boot()
  const res = await t.req(`/authorize?${authQuery({ redirect_uri: 'http://localhost:54321/cb' })}`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-security-policy'), /form-action 'self' http:\/\/localhost:54321;/)
  const html = await res.text()
  assert.match(html, /An app on your computer wants read-only access/)
  assert.doesNotMatch(html, /Claude Code/)
  t.close()
})

test('authorize GET: off-spec requests get a 400 page, never a redirect', async () => {
  const t = await boot()
  const bad = [
    { response_type: 'token' },
    { response_type: '' },
    { code_challenge_method: 'plain' },
    { code_challenge_method: '' },
    { code_challenge: 'short' },
    { redirect_uri: 'https://evil.example/cb' },
    { redirect_uri: 'http://claude.ai/api/mcp/auth_callback' },
    { resource: 'https://other.example/mcp' },
    { client_id: '' },
    { client_id: '<x>' },
    { state: 's'.repeat(2000) },
  ]
  for (const over of bad) {
    const res = await t.req(`/authorize?${authQuery(over)}`)
    assert.equal(res.status, 400, JSON.stringify(over))
    assert.equal(res.headers.get('location'), null)
    assert.equal((await res.text()).includes('name="password"'), false)
  }
  // Absent resource and absent state are fine.
  const q = authQuery()
  q.delete('resource')
  q.delete('state')
  assert.equal((await t.req(`/authorize?${q}`)).status, 200)
  t.close()
})

// ---- POST /authorize --------------------------------------------------------------------------

test('authorize POST: success is a 302 with code, state and iss; cookies are ignored', async () => {
  const t = await boot()
  const res = await t.req('/authorize', login({}, { cookie: 'sb-access-token=hub-session; sb-refresh-token=x' }))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const loc = new URL(res.headers.get('location'))
  assert.equal(`${loc.origin}${loc.pathname}`, CLAUDE)
  assert.equal(loc.searchParams.get('state'), 'st-1')
  assert.equal(loc.searchParams.get('iss'), ISS)
  const code = loc.searchParams.get('code')
  assert.match(code, /^[A-Za-z0-9_-]{43}$/) // 32 bytes, base64url
  assert.deepEqual(t.state.signIns, [['owner@example.com', 'pw']])
  t.close()
})

test('authorize POST: loopback redirect keeps its own query and gets the params appended', async () => {
  const t = await boot()
  const res = await t.req('/authorize', login({ redirect_uri: 'http://localhost:54321/cb?keep=1' }))
  assert.equal(res.status, 302)
  const loc = new URL(res.headers.get('location'))
  assert.equal(loc.origin + loc.pathname, 'http://localhost:54321/cb')
  assert.equal(loc.searchParams.get('keep'), '1')
  assert.ok(loc.searchParams.get('code'))
  t.close()
})

test('authorize POST: wrong or absent Origin is 403 and nothing is attempted', async () => {
  const t = await boot()
  const noOrigin = login()
  delete noOrigin.headers.origin
  for (const init of [login({}, { origin: 'https://evil.example' }), login({}, { origin: 'https://claude.ai' }), noOrigin]) {
    const res = await t.req('/authorize', init)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { error: 'forbidden_origin' })
  }
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

test('authorize POST: wrong password re-renders the form with a generic error, no code', async () => {
  const t = await boot({ signIn: async () => ({ ok: false, status: 400 }) })
  const res = await t.req('/authorize', login({ state: '"><b>' }))
  assert.equal(res.status, 401)
  assert.equal(res.headers.get('location'), null)
  const html = await res.text()
  assert.match(html, /Wrong email or password/)
  assert.equal(html.includes('<b>'), false)
  assert.match(html, /name="code_challenge"/) // hidden fields survive the re-render
  t.close()
})

test('authorize POST: the hook refusing the user (403) says no active membership', async () => {
  const t = await boot({ signIn: async () => ({ ok: false, status: 403 }) })
  const res = await t.req('/authorize', login())
  assert.equal(res.status, 403)
  assert.match(await res.text(), /No active bcns membership/)
  t.close()
})

test('authorize POST: a pending sign-up (session without client_id) gets no code', async () => {
  const t = await boot({
    signIn: async () => ({ ok: true, session: { access_token: PENDING_TOKEN, refresh_token: 'r', expires_in: 600 } }),
  })
  const res = await t.req('/authorize', login())
  assert.equal(res.status, 403)
  assert.equal(res.headers.get('location'), null)
  assert.match(await res.text(), /No active bcns membership/)
  t.close()
})

test('authorize POST: upstream outage is a 503 form error, not a wrong-password message', async () => {
  const t = await boot({ signIn: async () => ({ ok: false, status: 0 }) })
  const res = await t.req('/authorize', login())
  assert.equal(res.status, 503)
  assert.doesNotMatch(await res.text(), /Wrong email or password/)
  t.close()
})

test('authorize POST: over the per-IP limit is 429 and signIn is never called', async () => {
  const t = await boot({ allowLogin: () => false })
  const res = await t.req('/authorize', login())
  assert.equal(res.status, 429)
  assert.match(await res.text(), /Too many attempts/)
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

test('authorize POST: the limiter key is the last X-Forwarded-For hop, else the socket', async () => {
  const t = await boot()
  await t.req('/authorize', login({}, { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))
  await t.req('/authorize', login())
  assert.equal(t.state.ips[0], '203.0.113.9')
  assert.match(t.state.ips[1], /127\.0\.0\.1/)
  assert.equal(clientIp({ headers: { 'x-forwarded-for': ' 1.1.1.1 ,2.2.2.2 ' }, socket: {} }), '2.2.2.2')
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }), '9.9.9.9')
  t.close()
})

test('authorize POST: invalid hidden params are a 400 page (a tampered form cannot redirect anywhere)', async () => {
  const t = await boot()
  const res = await t.req('/authorize', login({ redirect_uri: 'https://evil.example/cb' }))
  assert.equal(res.status, 400)
  assert.equal(res.headers.get('location'), null)
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

test('authorize POST: oversized body is 413', async () => {
  const t = await boot()
  const res = await t.req('/authorize', login({ password: 'x'.repeat(MAX_BODY_BYTES + 1) }))
  assert.equal(res.status, 413)
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

test('authorize POST: a full code store refuses new codes; expired ones are swept to make room', async () => {
  const t = await boot()
  for (let i = 0; i < MAX_CODES; i++) await getCode(t)
  const full = await t.req('/authorize', login())
  assert.equal(full.status, 503)
  assert.equal(full.headers.get('location'), null)
  t.state.now += CODE_TTL_MS + 1
  assert.equal((await t.req('/authorize', login())).status, 302)
  t.close()
})

// ---- /token: authorization_code ---------------------------------------------------------------

test('token: success returns the Supabase session, uncached', async () => {
  const t = await boot()
  const code = await getCode(t)
  const res = await t.req('/token', exchange(code))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await res.json(), {
    access_token: MEMBER_TOKEN,
    token_type: 'Bearer',
    expires_in: 600,
    refresh_token: 'refresh-1',
  })
  t.close()
})

async function assertGrantError(res, error = 'invalid_grant') {
  assert.equal(res.status, 400)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await res.json(), { error })
}

test('token: PKCE mismatch is invalid_grant, and burns the code', async () => {
  const t = await boot()
  const code = await getCode(t)
  await assertGrantError(await t.req('/token', exchange(code, { code_verifier: 'w'.repeat(43) })))
  await assertGrantError(await t.req('/token', exchange(code)))
  t.close()
})

test('token: a code works once; reuse is invalid_grant', async () => {
  const t = await boot()
  const code = await getCode(t)
  assert.equal((await t.req('/token', exchange(code))).status, 200)
  await assertGrantError(await t.req('/token', exchange(code)))
  t.close()
})

test('token: an expired code is invalid_grant', async () => {
  const t = await boot()
  const code = await getCode(t)
  t.state.now += CODE_TTL_MS
  await assertGrantError(await t.req('/token', exchange(code)))
  t.close()
})

test('token: a code is valid right up to its TTL', async () => {
  const t = await boot()
  const code = await getCode(t)
  t.state.now += CODE_TTL_MS - 1
  assert.equal((await t.req('/token', exchange(code))).status, 200)
  t.close()
})

test('token: redirect_uri mismatch is invalid_grant, and burns the code', async () => {
  const t = await boot()
  const code = await getCode(t)
  await assertGrantError(await t.req('/token', exchange(code, { redirect_uri: 'http://localhost:1234/cb' })))
  await assertGrantError(await t.req('/token', exchange(code)))
  t.close()
})

test('token: client_id mismatch is invalid_grant', async () => {
  const t = await boot()
  const code = await getCode(t)
  await assertGrantError(await t.req('/token', exchange(code, { client_id: 'someone-else' })))
  t.close()
})

test('token: unknown code, missing params, bad grant_type, wrong content type', async () => {
  const t = await boot()
  await assertGrantError(await t.req('/token', exchange('nope')))
  await assertGrantError(await t.req('/token', tokenReq({ grant_type: 'authorization_code', code: 'x' })), 'invalid_request')
  await assertGrantError(await t.req('/token', tokenReq({ grant_type: 'password', username: 'a' })), 'unsupported_grant_type')
  await assertGrantError(await t.req('/token', tokenReq({})), 'invalid_request')
  await assertGrantError(
    await t.req('/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"grant_type":"refresh_token"}' }),
    'invalid_request',
  )
  t.close()
})

test('token: oversized body is 413', async () => {
  const t = await boot()
  const res = await t.req('/token', tokenReq({ grant_type: 'authorization_code', code: 'x'.repeat(MAX_BODY_BYTES + 1) }))
  assert.equal(res.status, 413)
  t.close()
})

// ---- /token: refresh_token --------------------------------------------------------------------

test('refresh: ok returns the rotated session', async () => {
  const t = await boot()
  const res = await t.req('/token', tokenReq({ grant_type: 'refresh_token', refresh_token: 'refresh-1' }))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await res.json(), {
    access_token: MEMBER_TOKEN,
    token_type: 'Bearer',
    expires_in: 600,
    refresh_token: 'refresh-2',
  })
  assert.deepEqual(t.state.refreshes, ['refresh-1'])
  t.close()
})

test('refresh: any failure is 400 invalid_grant', async () => {
  const t = await boot({ refresh: async () => ({ ok: false, status: 400 }) })
  await assertGrantError(await t.req('/token', tokenReq({ grant_type: 'refresh_token', refresh_token: 'dead' })))
  t.close()
})

test('refresh: a session that lost its tenant claim is invalid_grant', async () => {
  const t = await boot({
    refresh: async () => ({ ok: true, session: { access_token: PENDING_TOKEN, refresh_token: 'r', expires_in: 600 } }),
  })
  await assertGrantError(await t.req('/token', tokenReq({ grant_type: 'refresh_token', refresh_token: 'r' })))
  t.close()
})

test('refresh: missing refresh_token is invalid_request', async () => {
  const t = await boot()
  await assertGrantError(await t.req('/token', tokenReq({ grant_type: 'refresh_token' })), 'invalid_request')
  t.close()
})

// ---- review round: constants, labels, header, caps, upstream bounds ---------------------------

test('limits and sizes are pinned by value', () => {
  assert.equal(CODE_TTL_MS, 60_000)
  assert.equal(MAX_CODES, 1000)
  assert.equal(MAX_BODY_BYTES, 16384)
  assert.equal(LOGIN_LIMIT_PER_MIN, 10)
  assert.equal(REFRESH_GLOBAL_LIMIT_PER_MIN, 15)
  assert.equal(SIGNIN_GLOBAL_LIMIT_PER_MIN, 3)
  assert.equal(SIGNIN_IP_LIMIT_PER_MIN, 2)
  assert.equal(REFRESH_UNKNOWN_IP_LIMIT_PER_MIN, 3)
  assert.equal(REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN, 5)
  assert.equal(KNOWN_IP_TTL_MS, 3_600_000)
  assert.equal(KNOWN_IP_MAX, 1000)
  assert.equal(RETRY_AFTER_BLIP_SECONDS, 5)
  assert.equal(UPSTREAM_TIMEOUT_MS, 8000)
  assert.equal(RETRY_AFTER_SECONDS, 60)
})

test('form page: Referrer-Policy is same-origin so the browser POSTs a real Origin', async () => {
  const t = await boot()
  const res = await t.req(`/authorize?${authQuery()}`)
  assert.equal(res.headers.get('referrer-policy'), 'same-origin')
  t.close()
})

test('claude.com callback: allowed everywhere and labelled Claude (claude.com)', async () => {
  const t = await boot()
  const reg = await t.req('/register', json({ redirect_uris: [CLAUDE_COM] }))
  assert.equal(reg.status, 201)
  const res = await t.req(`/authorize?${authQuery({ redirect_uri: CLAUDE_COM })}`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /Claude \(claude\.com\) wants read-only access/)
  assert.match(res.headers.get('content-security-policy'), /form-action 'self' https:\/\/claude\.com;/)
  const ok = await t.req('/authorize', login({ redirect_uri: CLAUDE_COM }))
  assert.equal(ok.status, 302)
  assert.equal(new URL(ok.headers.get('location')).origin, 'https://claude.com')
  t.close()
})

test('ipKey: IPv4 whole, IPv4-mapped as IPv4, other IPv6 as its /64', () => {
  assert.equal(ipKey('203.0.113.9'), '203.0.113.9')
  assert.equal(ipKey('::ffff:203.0.113.9'), '203.0.113.9')
  assert.equal(ipKey('::FFFF:cb00:7109'), '203.0.113.9')
  assert.equal(ipKey('2001:db8:aaaa:bbbb:1:2:3:4'), ipKey('2001:db8:aaaa:bbbb:ffff:eeee:dddd:cccc'))
  assert.equal(ipKey('2001:db8:aaaa:bbbb::1'), ipKey('2001:0db8:aaaa:bbbb:0:0:0:2'))
  assert.notEqual(ipKey('2001:db8:aaaa:bbbb::1'), ipKey('2001:db8:aaaa:bbbc::1'))
  assert.equal(ipKey('::1'), ipKey('0:0:0:0:5::9'))
  assert.equal(ipKey('fe80::1%en0'), ipKey('fe80::2'))
  assert.equal(ipKey('unknown'), 'unknown')
})

test('login limiter key is the /64 for IPv6, so rotating inside a prefix buys nothing', async () => {
  const t = await boot()
  await t.req('/authorize', login({}, { 'x-forwarded-for': '2001:db8:1:2:aaaa::1' }))
  await t.req('/authorize', login({}, { 'x-forwarded-for': '2001:db8:1:2:bbbb::9' }))
  await t.req('/authorize', login({}, { 'x-forwarded-for': '::ffff:198.51.100.4' }))
  assert.equal(t.state.ips[0], t.state.ips[1])
  assert.equal(t.state.ips[2], '198.51.100.4')
  t.close()
})

const refreshInit = (rt = 'rt') => tokenReq({ grant_type: 'refresh_token', refresh_token: rt })

test('refresh: 0, 429 and 5xx from GoTrue are 503 temporarily_unavailable, not invalid_grant; Retry-After 5 only when GoTrue was unreachable', async () => {
  for (const [status, retry] of [[0, '5'], [429, '60'], [500, '60'], [503, '60']]) {
    const t = await boot({ refresh: async () => ({ ok: false, status }) })
    const res = await t.req('/token', refreshInit())
    assert.equal(res.status, 503, String(status))
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('retry-after'), retry, String(status))
    assert.deepEqual(await res.json(), { error: 'temporarily_unavailable' })
    t.close()
  }
})

test('refresh: invalid_grant only for GoTrue 400 and 403; any other 4xx is our trouble and 503', async () => {
  for (const status of [400, 403]) {
    const t = await boot({ refresh: async () => ({ ok: false, status }) })
    await assertGrantError(await t.req('/token', refreshInit()))
    t.close()
  }
  for (const status of [401, 404, 422]) {
    const t = await boot({ refresh: async () => ({ ok: false, status }) })
    const res = await t.req('/token', refreshInit())
    assert.equal(res.status, 503, String(status))
    assert.equal(res.headers.get('retry-after'), '60')
    assert.deepEqual(await res.json(), { error: 'temporarily_unavailable' })
    t.close()
  }
})

const fetchWithXff = (t, ip, rt = 'rt') =>
  t.req('/token', { ...refreshInit(rt), headers: { ...refreshInit(rt).headers, 'x-forwarded-for': ip } })

/** The same limiter wiring server.ts builds, so the tests exercise the real admission policy. */
function refreshCaps() {
  const unknownIp = createRateLimiter(REFRESH_UNKNOWN_IP_LIMIT_PER_MIN)
  const unknown = createRateLimiter(REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN)
  const global = createRateLimiter(REFRESH_GLOBAL_LIMIT_PER_MIN)
  return {
    allowUnknownIpRefresh: (ip) => unknownIp.allow(ip),
    allowUnknownRefresh: () => unknown.allow('global'),
    allowRefreshUpstream: () => global.allow('global'),
  }
}

/** 'good' refreshes, anything else is a dead token (400). Slow enough that bursts overlap. */
function gotrueByToken(counter) {
  return async (rt) => {
    counter.n++
    await new Promise((r) => setTimeout(r, 20))
    return rt === 'good'
      ? { ok: true, session: { access_token: MEMBER_TOKEN, refresh_token: 'r2', expires_in: 600 } }
      : { ok: false, status: 400 }
  }
}

test('refresh: 15 concurrent junk refreshes from one unknown IP reach GoTrue at most 3 times', async () => {
  const up = { n: 0 }
  const t = await boot({ ...refreshCaps(), refresh: gotrueByToken(up) })
  const results = await Promise.all(Array.from({ length: 15 }, () => fetchWithXff(t, '203.0.113.7', 'junk')))
  assert.equal(up.n, REFRESH_UNKNOWN_IP_LIMIT_PER_MIN)
  const statuses = results.map((r) => r.status)
  assert.equal(statuses.filter((s) => s === 400).length, REFRESH_UNKNOWN_IP_LIMIT_PER_MIN)
  assert.equal(statuses.filter((s) => s === 503).length, 15 - REFRESH_UNKNOWN_IP_LIMIT_PER_MIN)
  for (const r of results.filter((r) => r.status === 503)) assert.equal(r.headers.get('retry-after'), '60')
  t.close()
})

test('refresh: junk spread over many unknown IPs reaches GoTrue at most 5 times a minute', async () => {
  const up = { n: 0 }
  const t = await boot({ ...refreshCaps(), refresh: gotrueByToken(up) })
  const reqs = []
  for (let ip = 1; ip <= 12; ip++) for (let i = 0; i < 3; i++) reqs.push(fetchWithXff(t, `203.0.113.${ip}`, 'junk'))
  await Promise.all(reqs)
  assert.equal(up.n, REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN)
  t.close()
})

test('refresh: a known IP keeps refreshing while the unknown budget is spent, and only the global cap applies to it', async () => {
  const up = { n: 0 }
  const t = await boot({ ...refreshCaps(), refresh: gotrueByToken(up) })
  assert.equal((await fetchWithXff(t, '198.51.100.1', 'good')).status, 200) // now known
  const flood = []
  for (let ip = 1; ip <= 20; ip++) flood.push(fetchWithXff(t, `203.0.113.${ip}`, 'junk'))
  await Promise.all(flood)
  assert.equal(up.n, REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN) // 1 good + 4 junk spent the unknown budget
  // The flood left 10 of the 15 slots: the known IP gets all of them, far past the 3/min unknown cap.
  const known = await Promise.all(Array.from({ length: 10 }, () => fetchWithXff(t, '198.51.100.1', 'good')))
  assert.deepEqual(known.map((r) => r.status), Array(10).fill(200))
  const over = await fetchWithXff(t, '198.51.100.1', 'good')
  assert.equal(over.status, 503) // global cap
  assert.equal(over.headers.get('retry-after'), '60')
  t.close()
})

test('refresh: a successful code exchange makes the IP known; a failed one does not', async () => {
  const t = await boot({ allowUnknownIpRefresh: (ip) => (t.state.unknownChecks.push(ip), true) })
  t.state.unknownChecks = []
  const code = await getCode(t)
  await assertGrantError(await t.req('/token', { ...exchange(code, { code_verifier: 'w'.repeat(43) }), headers: { ...exchange(code).headers, 'x-forwarded-for': '198.51.100.2' } }))
  await fetchWithXff(t, '198.51.100.2')
  assert.equal(t.state.unknownChecks.length, 1) // failed exchange: still unknown
  const code2 = await getCode(t)
  const ok = await t.req('/token', { ...exchange(code2), headers: { ...exchange(code2).headers, 'x-forwarded-for': '198.51.100.3' } })
  assert.equal(ok.status, 200)
  await fetchWithXff(t, '198.51.100.3')
  assert.equal(t.state.unknownChecks.length, 1) // good exchange: known, skipped the unknown checks
  t.close()
})

test('refresh: a failed refresh does not make an IP known', async () => {
  const checks = []
  const t = await boot({ allowUnknownIpRefresh: (ip) => (checks.push(ip), true), refresh: async () => ({ ok: false, status: 400 }) })
  await fetchWithXff(t, '198.51.100.4')
  await fetchWithXff(t, '198.51.100.4')
  assert.equal(checks.length, 2)
  t.close()
})

test('refresh: known status expires after the TTL and the table is bounded, evicting the oldest', async () => {
  const checks = []
  const t = await boot({ allowUnknownIpRefresh: (ip) => (checks.push(ip), true) })
  await fetchWithXff(t, '198.51.100.9')
  await fetchWithXff(t, '198.51.100.9')
  assert.equal(checks.length, 1)
  t.state.now += KNOWN_IP_TTL_MS + 1
  await fetchWithXff(t, '198.51.100.9')
  assert.equal(checks.length, 2) // expired: unknown again, and known again after this success
  await fetchWithXff(t, '198.51.100.9')
  assert.equal(checks.length, 2)
  // Fill the table past its bound with other IPs: the oldest, .9, is evicted.
  for (let i = 0; i < KNOWN_IP_MAX; i++) await fetchWithXff(t, `10.${i >> 8}.${i & 255}.1`)
  checks.length = 0
  await fetchWithXff(t, '198.51.100.9')
  assert.deepEqual(checks, ['198.51.100.9'])
  await fetchWithXff(t, `10.${(KNOWN_IP_MAX - 1) >> 8}.${(KNOWN_IP_MAX - 1) & 255}.1`)
  assert.equal(checks.length, 1) // the most recent is still known
  t.close()
})

test('refresh: the global cap answers 503 + Retry-After without calling GoTrue', async () => {
  const global = createRateLimiter(REFRESH_GLOBAL_LIMIT_PER_MIN)
  let upstream = 0
  const t = await boot({
    allowRefreshUpstream: () => global.allow('global'),
    refresh: async () => (upstream++, { ok: true, session: { access_token: MEMBER_TOKEN, refresh_token: 'r', expires_in: 600 } }),
  })
  for (let i = 0; i < REFRESH_GLOBAL_LIMIT_PER_MIN; i++) assert.equal((await t.req('/token', refreshInit())).status, 200)
  const over = await t.req('/token', refreshInit())
  assert.equal(over.status, 503)
  assert.equal(over.headers.get('retry-after'), '60')
  assert.deepEqual(await over.json(), { error: 'temporarily_unavailable' })
  assert.equal(upstream, REFRESH_GLOBAL_LIMIT_PER_MIN)
  t.close()
})

test('sign-in: the global cap re-renders the form with 429 and never calls GoTrue', async () => {
  const global = createRateLimiter(SIGNIN_GLOBAL_LIMIT_PER_MIN)
  const t = await boot({ allowSignInUpstream: () => global.allow('global') })
  for (let i = 0; i < SIGNIN_GLOBAL_LIMIT_PER_MIN; i++) assert.equal((await t.req('/authorize', login())).status, 302)
  const over = await t.req('/authorize', login())
  assert.equal(over.status, 429)
  assert.equal(over.headers.get('location'), null)
  const html = await over.text()
  assert.match(html, /Too many sign-in attempts\. Try again in a minute\./)
  assert.match(html, /name="code_challenge"/)
  assert.equal(t.state.signIns.length, SIGNIN_GLOBAL_LIMIT_PER_MIN)
  t.close()
})

test('sign-in: a request refused by the per-IP limit or with empty credentials spends none of the upstream budgets', async () => {
  let spent = 0
  const spend = () => (spent++, true)
  const t = await boot({ allowLogin: () => false, allowSignInIp: spend, allowSignInUpstream: spend })
  await t.req('/authorize', login())
  t.close()
  const u = await boot({ allowSignInIp: spend, allowSignInUpstream: spend })
  await u.req('/authorize', login({ password: '' }))
  u.close()
  assert.equal(spent, 0)
})

test('sign-in: one IP can spend only its own 2 upstream sign-ins a minute, never the global budget', async () => {
  const perIp = createRateLimiter(SIGNIN_IP_LIMIT_PER_MIN)
  const global = createRateLimiter(SIGNIN_GLOBAL_LIMIT_PER_MIN)
  const t = await boot({ allowSignInIp: (ip) => perIp.allow(ip), allowSignInUpstream: () => global.allow('global') })
  const from = (ip) => t.req('/authorize', login({}, { 'x-forwarded-for': ip }))
  for (let i = 0; i < 10; i++) await from('203.0.113.1')
  assert.equal(t.state.signIns.length, SIGNIN_IP_LIMIT_PER_MIN) // junk flood: capped at 2 upstream
  const blocked = await from('203.0.113.1')
  assert.equal(blocked.status, 429)
  assert.match(await blocked.text(), /Too many sign-in attempts/)
  // The global budget has one slot left for everyone else.
  assert.equal((await from('203.0.113.2')).status, 302)
  assert.equal((await from('203.0.113.3')).status, 429)
  t.close()
})

// ---- real deps against a fake GoTrue: one attempt, bounded time -------------------------------

async function fakeGotrue(handler) {
  const calls = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      calls.push({ url: req.url, headers: req.headers, body })
      handler(req, res, calls.length)
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { calls, url: `http://127.0.0.1:${server.address().port}`, close: () => (server.close(), server.closeAllConnections()) }
}

test('real deps: a hung GoTrue is status 0 within the timeout, for both grants, with a single attempt', async () => {
  const g = await fakeGotrue(() => {}) // never answers
  const deps = supabaseSessionDeps({ url: g.url, anonKey: 'anon' }, { timeoutMs: 150 })
  const started = Date.now()
  assert.deepEqual(await deps.refresh('rt'), { ok: false, status: 0 })
  assert.deepEqual(await deps.signIn('a@b.c', 'pw'), { ok: false, status: 0 })
  assert.ok(Date.now() - started < 2000)
  assert.equal(g.calls.length, 2) // no retry loop
  g.close()
})

test('real deps: an unreachable GoTrue is status 0 immediately, one attempt', async () => {
  const dead = createServer()
  await new Promise((r) => dead.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${dead.address().port}`
  await new Promise((r) => dead.close(r))
  const started = Date.now()
  assert.deepEqual(await supabaseSessionDeps({ url, anonKey: 'anon' }).refresh('rt'), { ok: false, status: 0 })
  assert.ok(Date.now() - started < 2000)
})

test('real deps: GoTrue statuses pass through; success maps the session; request shape matches supabase-js', async () => {
  const g = await fakeGotrue((req, res, n) => {
    const send = (status, obj) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(obj)))
    if (n === 1) return send(400, { error_code: 'invalid_credentials' })
    if (n === 2) return send(429, {})
    if (n === 3) return send(200, { access_token: 'a', refresh_token: 'r', expires_in: 600, token_type: 'bearer' })
    if (n === 4) return send(200, { nope: true })
    res.writeHead(200)
    res.end('not json')
  })
  const deps = supabaseSessionDeps({ url: g.url + '/', anonKey: 'anon-key' })
  assert.deepEqual(await deps.signIn('a@b.c', 'pw'), { ok: false, status: 400 })
  assert.deepEqual(await deps.refresh('rt-1'), { ok: false, status: 429 })
  assert.deepEqual(await deps.refresh('rt-2'), { ok: true, session: { access_token: 'a', refresh_token: 'r', expires_in: 600 } })
  assert.deepEqual(await deps.refresh('rt-3'), { ok: false, status: 0 })
  assert.deepEqual(await deps.refresh('rt-4'), { ok: false, status: 0 })
  assert.equal(g.calls[0].url, '/auth/v1/token?grant_type=password')
  assert.deepEqual(JSON.parse(g.calls[0].body), { email: 'a@b.c', password: 'pw' })
  assert.equal(g.calls[1].url, '/auth/v1/token?grant_type=refresh_token')
  assert.deepEqual(JSON.parse(g.calls[1].body), { refresh_token: 'rt-1' })
  assert.equal(g.calls[0].headers.apikey, 'anon-key')
  assert.equal(g.calls[0].headers.authorization, 'Bearer anon-key')
  assert.equal(g.calls[0].headers.cookie, undefined)
  g.close()
})

test('real deps: a new-format publishable key goes in apikey only, never as a Bearer token', async () => {
  const g = await fakeGotrue((req, res) => (res.writeHead(400), res.end('{}')))
  await supabaseSessionDeps({ url: g.url, anonKey: 'sb_publishable_abc' }).refresh('rt')
  assert.equal(g.calls[0].headers.apikey, 'sb_publishable_abc')
  assert.equal(g.calls[0].headers.authorization, undefined)
  g.close()
})

test('real deps: every non-2xx or unreachable answer logs one status-only JSON line, never a body or token', async () => {
  const lines = []
  const g = await fakeGotrue((req, res, n) => {
    if (n === 4) return (res.writeHead(200, { 'content-type': 'application/json' }), res.end(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 1 })))
    res.writeHead([404, 400, 500][n - 1], { 'content-type': 'application/json' })
    res.end(JSON.stringify({ msg: 'SECRET-BODY', token: 'SECRET-TOKEN' }))
  })
  const deps = supabaseSessionDeps({ url: g.url, anonKey: 'anon' }, { log: (l) => lines.push(l) })
  await deps.refresh('SECRET-REFRESH')
  await deps.signIn('a@b.c', 'SECRET-PW')
  await deps.refresh('rt')
  await deps.refresh('rt') // 200: no line
  assert.deepEqual(lines.map((l) => JSON.parse(l)), [
    { level: 'error', event: 'gotrue_refresh_failed', status: 404 },
    { level: 'error', event: 'gotrue_signin_failed', status: 400 },
    { level: 'error', event: 'gotrue_refresh_failed', status: 500 },
  ])
  assert.doesNotMatch(lines.join('\n'), /SECRET/)
  g.close()
  const dead = supabaseSessionDeps({ url: g.url, anonKey: 'anon' }, { log: (l) => lines.push(l) })
  await dead.refresh('rt')
  assert.deepEqual(JSON.parse(lines.at(-1)), { level: 'error', event: 'gotrue_refresh_failed', status: 0 })
})

test('form page warns the user to continue only if they started the connection themselves', async () => {
  const t = await boot()
  for (const [redirect, label] of [
    [CLAUDE, 'your Claude'],
    [CLAUDE_COM, 'your Claude'],
    ['https://chatgpt.com/connector_platform_oauth_redirect', 'your ChatGPT'],
    ['http://localhost:54321/cb', 'an app on this computer'],
  ]) {
    const html = await (await t.req(`/authorize?${authQuery({ redirect_uri: redirect })}`)).text()
    assert.match(
      html,
      new RegExp(`Only continue if you started connecting from ${label} just now\\. If someone sent you this link, close this page\\.`),
      redirect,
    )
  }
  t.close()
})
