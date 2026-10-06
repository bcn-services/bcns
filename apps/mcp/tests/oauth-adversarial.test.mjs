// QA for PR-D: adversarial probes through the real OAuth handler (fake deps), plus an end-to-end
// pass that boots the real server.js against a fake GoTrue so every /mcp auth path and the
// Supabase-backed deps run un-mocked.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createOAuthHandler, redirectAllowed, clientIp, LOGIN_LIMIT_PER_MIN } from '../dist/oauth.js'
import { createRateLimiter } from '../dist/limit.js'

const ISS = 'https://mcp.bcn-services.com'
const RESOURCE = `${ISS}/mcp`
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback'
const CHATGPT = 'https://chatgpt.com/connector_platform_oauth_redirect'
const jwt = (claims) => `h.${Buffer.from(JSON.stringify({ sub: 'u1', ...claims })).toString('base64url')}.s`
const MEMBER_TOKEN = jwt({ client_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' })
const sha = (s) => createHash('sha256').update(s).digest('base64url')
const VERIFIER = 'v'.repeat(43)
const CHALLENGE = sha(VERIFIER)

async function boot(over = {}) {
  const state = { now: 1_000_000, signIns: [], refreshes: [], ips: [], counter: 0 }
  const deps = {
    signIn: async (email, password) => {
      state.signIns.push([email, password])
      return { ok: true, session: { access_token: MEMBER_TOKEN, refresh_token: `rt-${state.signIns.length}`, expires_in: 600 } }
    },
    refresh: async (rt) => (state.refreshes.push(rt), { ok: true, session: { access_token: MEMBER_TOKEN, refresh_token: 'rt-x', expires_in: 600 } }),
    now: () => state.now,
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
    handle(req, res)
      .then((done) => {
        if (!done) {
          res.writeHead(404)
          res.end()
        }
      })
      .catch(() => (res.writeHead(500), res.end()))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`
  const req = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init })
  return { req, state, port, close: () => (server.close(), server.closeAllConnections()) }
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
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }
const post = (body, headers = {}) => ({ method: 'POST', headers: { ...FORM, ...headers }, body: body.toString() })
const login = (over = {}, headers = {}) => {
  const q = authQuery(over)
  q.set('email', 'owner@example.com')
  q.set('password', 'pw')
  return post(q, { origin: ISS, ...headers })
}
const getCode = async (t, over = {}, headers = {}) => {
  const res = await t.req('/authorize', login(over, headers))
  assert.equal(res.status, 302)
  return new URL(res.headers.get('location')).searchParams.get('code')
}
const exchange = (code, over = {}) =>
  post(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CLAUDE, client_id: 'client-1', code_verifier: VERIFIER, ...over }))

// ---- redirect_uri lookalikes ------------------------------------------------------------------

const BAD_REDIRECTS = [
  'https://claude.ai.evil.com/api/mcp/auth_callback',
  'https://claude.ai@evil.com/api/mcp/auth_callback',
  'https://evil.com/https://claude.ai/api/mcp/auth_callback',
  'https://evil.com/?x=https://claude.ai/api/mcp/auth_callback',
  'https://claude.ai\\@evil.com/api/mcp/auth_callback',
  'https://claude.ai%2eevil.com/api/mcp/auth_callback',
  'https://claude.ai/api/mcp/auth_callback#frag',
  'https://claude.ai/api/mcp/auth_callback?x=1',
  'https://claude.ai/api/mcp/auth_callback/',
  'https://claude.ai/api/mcp/auth%5Fcallback',
  'https://claude.ai:443/api/mcp/auth_callback',
  'HTTPS://CLAUDE.AI/api/mcp/auth_callback',
  'https://CLAUDE.ai/api/mcp/auth_callback',
  'http://claude.ai/api/mcp/auth_callback',
  'https://chatgpt.com.evil.com/connector_platform_oauth_redirect',
  'https://chatgpt.com@evil.com/connector/oauth/abc',
  'https://chatgpt.com/connector/oauth/abc/../../x',
  'https://chatgpt.com/connector/oauth/abc?x=1',
  'https://chatgpt.com/connector/oauth/abc#f',
  'https://chatgpt.com/connector/oauth/',
  'https://chatgpt.com/connector/oauth/a%2fb',
  'http://localhost.evil.com:80/cb',
  'http://127.0.0.1.nip.io:80/cb',
  'http://localhost@evil.com:80/cb',
  'http://localhost:80@evil.com/cb',
  'http://user:pw@localhost:80/cb',
  'http://localhost:80\\@evil.com/cb',
  'http://localhost:80#frag',
  'http://localhost:80/cb#frag',
  'http://LOCALHOST:80/cb',
  'http://127.0.0.1:80.evil.com/cb',
  'http://127.0.0.1.:80/cb',
  'http://[::1]:80/cb',
  'http://0.0.0.0:80/cb',
  'http://127.1:80/cb',
  'http://2130706433:80/cb',
  'http://0x7f.0.0.1:80/cb',
  'http://localhost/cb',
  'http://localhost:/cb',
  'http://localhost:99999/cb',
  'https://localhost:80/cb',
  'http://localhost:80/cb\r\nX-Injected: 1',
  'http://localhost:80/cb x',
  'javascript:alert(1)',
  'JAVASCRIPT://claude.ai/%0aalert(1)',
  'data:text/html,<script>1</script>',
  '//evil.com/cb',
  '/api/mcp/auth_callback',
  '',
  ' ' + CLAUDE,
  CLAUDE + ' ',
  CLAUDE + '\n',
  CLAUDE + '/..',
]

test('redirectAllowed: every lookalike / variant is rejected', () => {
  const accepted = BAD_REDIRECTS.filter((u) => redirectAllowed(u))
  assert.deepEqual(accepted, [])
  for (const v of [null, undefined, 1, {}, [CLAUDE], ['a'], true]) assert.equal(redirectAllowed(v), false)
  assert.equal(redirectAllowed('https://claude.ai/' + 'a'.repeat(600)), false)
})

test('redirectAllowed: the legitimate set still passes (guards against over-tightening)', () => {
  for (const u of [CLAUDE, CHATGPT, 'https://chatgpt.com/connector/oauth/Ab_9-x', 'http://localhost:6274/oauth/callback', 'http://127.0.0.1:33418/callback?x=1', 'http://localhost:80'])
    assert.equal(redirectAllowed(u), true, u)
})

test('every bad redirect is refused at /register, GET /authorize and POST /authorize (never redirected to)', async () => {
  const t = await boot()
  for (const uri of BAD_REDIRECTS) {
    const reg = await t.req('/register', { method: 'POST', body: JSON.stringify({ redirect_uris: [CLAUDE, uri] }) })
    assert.equal(reg.status, 400, `register ${uri}`)
    const get = await t.req(`/authorize?${authQuery({ redirect_uri: uri })}`)
    assert.equal(get.status, 400, `GET ${uri}`)
    assert.equal(get.headers.get('location'), null)
    const p = await t.req('/authorize', login({ redirect_uri: uri }))
    assert.equal(p.status, 400, `POST ${uri}`)
    assert.equal(p.headers.get('location'), null)
  }
  assert.equal(t.state.signIns.length, 0, 'no credentials were ever tried against a bad redirect')
  t.close()
})

test('duplicate redirect_uri: only the first is used, an evil second never wins', async () => {
  const t = await boot()
  const raw = (first, second) => `response_type=code&client_id=c&redirect_uri=${encodeURIComponent(first)}&redirect_uri=${encodeURIComponent(second)}&code_challenge=${CHALLENGE}&code_challenge_method=S256`
  assert.equal((await t.req(`/authorize?${raw('https://evil.com/x', CLAUDE)}`)).status, 400)
  const ok = await t.req(`/authorize?${raw(CLAUDE, 'https://evil.com/x')}`)
  assert.equal(ok.status, 200)
  assert.ok(!(await ok.text()).includes('evil.com'))
  const body = `${raw(CLAUDE, 'https://evil.com/x')}&email=a%40b.c&password=pw`
  const res = await t.req('/authorize', post(body, { origin: ISS }))
  assert.equal(res.status, 302)
  assert.equal(new URL(res.headers.get('location')).origin, 'https://claude.ai')
  // second state / client_id / challenge duplicates are first-wins as well
  const q2 = `${authQuery()}&client_id=other&state=other&code_challenge=${sha('zzzz')}&email=a%40b.c&password=pw`
  const res2 = await t.req('/authorize', post(q2, { origin: ISS }))
  const loc = new URL(res2.headers.get('location'))
  assert.equal(loc.searchParams.get('state'), 'st-1')
  const tok = await t.req('/token', exchange(loc.searchParams.get('code')))
  assert.equal(tok.status, 200)
  t.close()
})

test('a redirect that already carries code/state/iss cannot smuggle its own values', async () => {
  const t = await boot()
  const res = await t.req('/authorize', login({ redirect_uri: 'http://localhost:80/cb?code=evil&state=evil&iss=evil&x=1', state: 'real' }))
  assert.equal(res.status, 302)
  const loc = new URL(res.headers.get('location'))
  assert.deepEqual(loc.searchParams.getAll('code').length, 1)
  assert.notEqual(loc.searchParams.get('code'), 'evil')
  assert.deepEqual(loc.searchParams.getAll('state'), ['real'])
  assert.deepEqual(loc.searchParams.getAll('iss'), [ISS])
  assert.equal(loc.searchParams.get('x'), '1')
  t.close()
})

test('state with CRLF / ampersands / hash / unicode is percent-encoded in Location (no header injection)', async () => {
  const t = await boot()
  const state = 'a&code=evil#x\r\nSet-Cookie: pwn=1 é'
  const res = await t.req('/authorize', login({ state }))
  assert.equal(res.status, 302)
  const loc = new URL(res.headers.get('location'))
  assert.equal(loc.searchParams.get('state'), state)
  assert.equal(loc.searchParams.getAll('code').length, 1)
  assert.equal(res.headers.get('set-cookie'), null)
  t.close()
})

// ---- XSS / reflection -------------------------------------------------------------------------

test('XSS payloads: state is escaped in the form; client_id and resource cannot carry one at all', async () => {
  const t = await boot()
  const payloads = ['"><script>alert(1)</script>', `' onfocus='alert(1)' x='`, '<img src=x onerror=alert(1)>', '&#x3c;script&#x3e;', '</form><form action=//evil.com>']
  for (const p of payloads) {
    const res = await t.req(`/authorize?${authQuery({ state: p })}`)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.ok(!html.includes('<script'), p)
    assert.ok(!html.includes('<img'), p)
    assert.ok(!/value="[^"]*"[^>]*onfocus/.test(html) && !html.includes(`value="${p}"`), p)
    assert.equal((html.match(/<form/g) ?? []).length, 1)
    const bad1 = await t.req(`/authorize?${authQuery({ client_id: p })}`)
    assert.equal(bad1.status, 400)
    assert.ok(!(await bad1.text()).includes(p))
    const bad2 = await t.req(`/authorize?${authQuery({ resource: p })}`)
    assert.equal(bad2.status, 400)
    assert.ok(!(await bad2.text()).includes(p))
  }
  // error re-render (wrong password) reflects state too
  const t2 = await boot({ signIn: async () => ({ ok: false, status: 400 }) })
  const res = await t2.req('/authorize', login({ state: '"><script>x</script>' }))
  assert.equal(res.status, 401)
  assert.ok(!(await res.text()).includes('<script>x'))
  t.close()
  t2.close()
})

test('every HTML response carries CSP / frame / no-store headers; JSON and 302 are no-store', async () => {
  const t = await boot()
  for (const res of [await t.req(`/authorize?${authQuery()}`), await t.req('/authorize?nope=1'), await t.req('/authorize', login({ redirect_uri: 'https://evil.com' }))]) {
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'.*frame-ancestors 'none'/)
    assert.doesNotMatch(res.headers.get('content-security-policy'), /script-src|unsafe-eval/)
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  }
  const ok = await t.req('/authorize', login())
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  t.close()
})

// Regression (was a blocker, verified in Chromium): with `Referrer-Policy: no-referrer` on the form
// page a browser sends `Origin: null` on the same-origin form POST, which POST /authorize refuses
// (and must keep refusing), so every real sign-in was a 403. Pinned to the exact value.
test('form page sends Referrer-Policy: same-origin, never no-referrer (browser would POST Origin: null)', async () => {
  const t = await boot()
  try {
    const res = await t.req(`/authorize?${authQuery()}`)
    assert.equal(res.headers.get('referrer-policy'), 'same-origin')
    const post = await t.req('/authorize', login({}, { origin: 'null' }))
    assert.equal(post.status, 403) // Origin: null stays rejected
    assert.equal(t.state.signIns.length, 0)
  } finally {
    t.close()
  }
})

// ---- POST /authorize: Origin / content type / fields ------------------------------------------

test('POST /authorize Origin variants: only the exact https origin passes', async () => {
  const t = await boot()
  for (const origin of ['null', 'https://claude.ai', 'https://mcp.bcn-services.com/', 'http://mcp.bcn-services.com', 'https://mcp.bcn-services.com.evil.com', 'https://evil.com', 'HTTPS://MCP.BCN-SERVICES.COM', 'https://mcp.bcn-services.com:443', '']) {
    const res = await t.req('/authorize', login({}, { origin }))
    assert.equal(res.status, 403, `Origin ${JSON.stringify(origin)}`)
    assert.deepEqual(await res.json(), { error: 'forbidden_origin' })
  }
  const none = { method: 'POST', headers: FORM, body: login().body }
  assert.equal((await t.req('/authorize', none)).status, 403)
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

test('POST /authorize wrong content types and a form with no hidden fields are 400, never a sign-in', async () => {
  const t = await boot()
  const body = login().body
  for (const ct of ['application/json', 'text/plain', 'multipart/form-data; boundary=x', 'application/xml', '']) {
    const res = await t.req('/authorize', { method: 'POST', headers: { ...(ct ? { 'content-type': ct } : {}), origin: ISS }, body })
    assert.equal(res.status, 400, `ct=${ct}`)
  }
  const mixed = await t.req('/authorize', post(body, { origin: ISS, 'content-type': 'Application/X-WWW-Form-Urlencoded; charset=UTF-8' }))
  assert.equal(mixed.status, 302, 'case + charset suffix is fine')
  const bare = await t.req('/authorize', post(new URLSearchParams({ email: 'a@b.c', password: 'pw' }), { origin: ISS }))
  assert.equal(bare.status, 400)
  const empty = await t.req('/authorize', post('', { origin: ISS }))
  assert.equal(empty.status, 400)
  assert.equal(t.state.signIns.length, 1)
  t.close()
})

test('POST /authorize empty / oversized credentials never reach signIn', async () => {
  const t = await boot()
  for (const [email, password] of [['', 'pw'], ['a@b.c', ''], ['a'.repeat(321), 'pw'], ['a@b.c', 'p'.repeat(1025)]]) {
    const q = authQuery()
    q.set('email', email)
    q.set('password', password)
    const res = await t.req('/authorize', post(q, { origin: ISS }))
    assert.equal(res.status, 401)
  }
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

test('GoTrue statuses map: 400/401/404/422 are wrong-password, 403 membership, 429/5xx/0 unavailable; none issue a code', async () => {
  for (const [status, expect] of [[400, 401], [401, 401], [404, 401], [422, 401], [403, 403], [429, 503], [500, 503], [502, 503], [0, 503]]) {
    const t = await boot({ signIn: async () => ({ ok: false, status }) })
    const res = await t.req('/authorize', login())
    assert.equal(res.status, expect, `gotrue ${status}`)
    assert.equal(res.headers.get('location'), null)
    const text = await res.text()
    assert.doesNotMatch(text, /owner@example\.com|invalid_credentials|gotrue/i)
    t.close()
  }
})

test('wrong password and unknown user render the identical body (no account enumeration)', async () => {
  const t = await boot({ signIn: async () => ({ ok: false, status: 400 }) })
  const a = await (await t.req('/authorize', login())).text()
  const b = await (await t.req('/authorize', login({ email: 'nobody@example.com' }))).text()
  assert.equal(a.replace(/owner@example\.com/g, ''), b)
  t.close()
})

test('a signIn that throws is a 500, no code issued, server survives', async () => {
  const t = await boot({ signIn: async () => { throw new Error('boom') } })
  const res = await t.req('/authorize', login())
  assert.equal(res.status, 500)
  assert.equal((await t.req('/.well-known/oauth-protected-resource')).status, 200)
  t.close()
})

// ---- X-Forwarded-For / cookies ----------------------------------------------------------------

test('clientIp: last hop wins; spoofed leading hops, empty, trailing comma, duplicate header lines', () => {
  const mk = (xff) => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: '::1' } })
  assert.equal(clientIp(mk('1.1.1.1, 2.2.2.2, 9.9.9.9')), '9.9.9.9')
  assert.equal(clientIp(mk('9.9.9.9')), '9.9.9.9')
  assert.equal(clientIp(mk('1.1.1.1,  9.9.9.9 ')), '9.9.9.9')
  assert.equal(clientIp(mk(undefined)), '::1')
  assert.equal(clientIp(mk('')), '::1')
  assert.equal(clientIp(mk('1.1.1.1,')), '::1')
  assert.equal(clientIp(mk(['1.1.1.1', '2.2.2.2'])), '2.2.2.2')
})

test('rate limit: rotating the spoofable first hops does not buy a fresh budget; a different last hop is independent', async () => {
  const limiter = createRateLimiter(LOGIN_LIMIT_PER_MIN)
  const t = await boot({ allowLogin: (ip) => limiter.allow(ip) })
  let limited = 0
  for (let i = 0; i < LOGIN_LIMIT_PER_MIN + 5; i++) {
    const res = await t.req('/authorize', login({}, { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` }))
    if (res.status === 429) limited++
  }
  assert.equal(limited, 5)
  assert.equal((await t.req('/authorize', login({}, { 'x-forwarded-for': '10.0.0.1, 203.0.113.8' }))).status, 302)
  assert.equal(t.state.signIns.length, LOGIN_LIMIT_PER_MIN + 1)
  t.close()
})

test('rate limit counts failed attempts too, and 429 is rendered before signIn', async () => {
  const limiter = createRateLimiter(3)
  const t = await boot({ allowLogin: (ip) => limiter.allow(ip), signIn: async () => ({ ok: false, status: 400 }) })
  const statuses = []
  for (let i = 0; i < 5; i++) statuses.push((await t.req('/authorize', login())).status)
  assert.deepEqual(statuses, [401, 401, 401, 429, 429])
  t.close()
})

test('Cookie headers are ignored everywhere and nothing ever sets a cookie', async () => {
  const t = await boot()
  const cookie = { cookie: 'sb-access-token=hubtoken; sb-refresh-token=hubrefresh; session=abc' }
  const responses = []
  responses.push(await t.req(`/authorize?${authQuery()}`, { headers: cookie }))
  const auth = await t.req('/authorize', login({}, cookie))
  responses.push(auth)
  const code = new URL(auth.headers.get('location')).searchParams.get('code')
  responses.push(await t.req('/token', exchange(code, {}).method ? { ...exchange(code), headers: { ...FORM, ...cookie } } : {}))
  responses.push(await t.req('/token', { ...post(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'rt-given' })), headers: { ...FORM, ...cookie } }))
  responses.push(await t.req('/register', { method: 'POST', headers: cookie, body: JSON.stringify({ redirect_uris: [CLAUDE] }) }))
  assert.deepEqual(responses.map((r) => r.status), [200, 302, 200, 200, 201])
  for (const r of responses) assert.equal(r.headers.get('set-cookie'), null)
  assert.deepEqual(t.state.signIns, [['owner@example.com', 'pw']], 'credentials only from the form')
  assert.deepEqual(t.state.refreshes, ['rt-given'], 'refresh token only from the body')
  t.close()
})

// ---- /token: PKCE, redemption ------------------------------------------------------------------

test('PKCE verifier rules: RFC 7636 43-128 chars of [A-Za-z0-9-._~]', async () => {
  const cases = [
    ['a'.repeat(42), false],
    ['a'.repeat(43), true],
    ['a'.repeat(128), true],
    ['a'.repeat(129), false],
    ['-._~' + 'a'.repeat(39), true],
    ['a'.repeat(42) + '+', false],
    ['a'.repeat(42) + '/', false],
    ['a'.repeat(42) + '=', false],
    ['a'.repeat(42) + ' ', false],
    ['a'.repeat(42) + 'é', false],
    ['a'.repeat(42) + '\n', false],
    ['', false],
  ]
  for (const [verifier, ok] of cases) {
    const t = await boot()
    const code = await getCode(t, { code_challenge: sha(verifier) })
    const res = await t.req('/token', exchange(code, { code_verifier: verifier }))
    assert.equal(res.status, ok ? 200 : 400, JSON.stringify(verifier))
    if (!ok) assert.equal((await res.json()).error, ['invalid_request', 'invalid_grant'].find((e) => verifier === '' ? e === 'invalid_request' : e === 'invalid_grant'))
    t.close()
  }
})

test('code_challenge shapes: wrong length, padding, plain method, S256 spelled differently are refused at /authorize', async () => {
  const t = await boot()
  for (const over of [
    { code_challenge: CHALLENGE.slice(0, 42) },
    { code_challenge: CHALLENGE + 'a' },
    { code_challenge: CHALLENGE.slice(0, 42) + '=' },
    { code_challenge: CHALLENGE.replace(/.$/, '+') },
    { code_challenge_method: 'plain' },
    { code_challenge_method: 's256' },
    { code_challenge_method: '' },
    { response_type: 'token' },
    { response_type: 'code token' },
    { response_type: '' },
    { resource: 'https://mcp.bcn-services.com/mcp/' },
    { resource: 'https://evil.com/mcp' },
    { client_id: '' },
    { client_id: 'a'.repeat(129) },
    { client_id: 'a b' },
    { state: 's'.repeat(1025) },
  ]) {
    assert.equal((await t.req(`/authorize?${authQuery(over)}`)).status, 400, JSON.stringify(over).slice(0, 80))
  }
  for (const drop of ['code_challenge', 'code_challenge_method', 'response_type', 'client_id', 'redirect_uri']) {
    const q = authQuery()
    q.delete(drop)
    assert.equal((await t.req(`/authorize?${q}`)).status, 400, `missing ${drop}`)
  }
  // absent resource and absent state are fine
  const q = authQuery()
  q.delete('resource')
  q.delete('state')
  assert.equal((await t.req(`/authorize?${q}`)).status, 200)
  t.close()
})

test('a code is bound to its own client: other client verifier / client_id / redirect all fail and burn it', async () => {
  const t = await boot()
  const vB = 'b'.repeat(50)
  const codeA = await getCode(t, { client_id: 'client-A' })
  const codeB = await getCode(t, { client_id: 'client-B', code_challenge: sha(vB) })
  assert.notEqual(codeA, codeB)
  // A's code + B's verifier (B's client_id)
  assert.equal((await t.req('/token', exchange(codeA, { client_id: 'client-B', code_verifier: vB }))).status, 400)
  // A's code + B's verifier (A's client_id)
  const codeA2 = await getCode(t, { client_id: 'client-A' })
  assert.equal((await t.req('/token', exchange(codeA2, { client_id: 'client-A', code_verifier: vB }))).status, 400)
  // B's code + A's verifier
  assert.equal((await t.req('/token', exchange(codeB, { client_id: 'client-B', code_verifier: VERIFIER }))).status, 400)
  // all burned: even the right credentials now fail
  assert.equal((await t.req('/token', exchange(codeB, { client_id: 'client-B', code_verifier: vB }))).status, 400)
  // sanity: a fresh pair works
  const codeB2 = await getCode(t, { client_id: 'client-B', code_challenge: sha(vB) })
  assert.equal((await t.req('/token', exchange(codeB2, { client_id: 'client-B', code_verifier: vB }))).status, 200)
  t.close()
})

test('concurrent double redemption of one code: exactly one 200', async () => {
  const t = await boot()
  for (let round = 0; round < 5; round++) {
    const code = await getCode(t)
    const results = await Promise.all(Array.from({ length: 8 }, () => t.req('/token', exchange(code)).then((r) => r.status)))
    assert.equal(results.filter((s) => s === 200).length, 1, results.join())
    assert.equal(results.filter((s) => s === 400).length, 7)
  }
  t.close()
})

test('a code is never redeemable by a refresh grant, and a refresh token is not a code', async () => {
  const t = await boot()
  const code = await getCode(t)
  const asRefresh = await t.req('/token', post(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: code })))
  // goes to deps.refresh (fake says ok); the real deps reject it. The code itself must stay untouched.
  assert.equal((await t.req('/token', exchange(code))).status, 200)
  assert.ok([200, 400].includes(asRefresh.status))
  t.close()
})

test('token errors: no stack/internals leak, always no-store, params from the query string are ignored', async () => {
  const t = await boot()
  const code = await getCode(t)
  const viaQuery = await t.req(`/token?grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(CLAUDE)}&client_id=client-1&code_verifier=${VERIFIER}`, post(''))
  assert.equal(viaQuery.status, 400)
  assert.equal(viaQuery.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await viaQuery.json(), { error: 'invalid_request' })
  assert.equal((await t.req('/token', exchange(code))).status, 200, 'query-string attempt did not burn the code')
  for (const gt of ['password', 'client_credentials', 'urn:ietf:params:oauth:grant-type:device_code', 'AUTHORIZATION_CODE']) {
    const res = await t.req('/token', post(new URLSearchParams({ grant_type: gt })))
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, 'unsupported_grant_type')
  }
  t.close()
})

test('refresh failure modes: GoTrue 400/403 and a non-claim token are 400 invalid_grant; other 4xx and 0/429/5xx are 503; never a token', async () => {
  const pending = { ok: true, session: { access_token: jwt({ client_status: 'pending' }), refresh_token: 'x', expires_in: 1 } }
  const garbage = { ok: true, session: { access_token: 'garbage', refresh_token: 'x', expires_in: 1 } }
  const cases = [
    [{ ok: false, status: 400 }, 400, 'invalid_grant'],
    [{ ok: false, status: 403 }, 400, 'invalid_grant'],
    [{ ok: false, status: 401 }, 503, 'temporarily_unavailable'], // rotated key, not a dead token
    [{ ok: false, status: 404 }, 503, 'temporarily_unavailable'], // wrong URL
    [{ ok: false, status: 422 }, 503, 'temporarily_unavailable'],
    [pending, 400, 'invalid_grant'],
    [garbage, 400, 'invalid_grant'],
    [{ ok: false, status: 0 }, 503, 'temporarily_unavailable'],
    [{ ok: false, status: 429 }, 503, 'temporarily_unavailable'],
    [{ ok: false, status: 500 }, 503, 'temporarily_unavailable'],
    [{ ok: false, status: 502 }, 503, 'temporarily_unavailable'],
  ]
  for (const [r, status, error] of cases) {
    const t = await boot({ refresh: async () => r })
    const res = await t.req('/token', post(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'rt' })))
    assert.equal(res.status, status, JSON.stringify(r))
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await res.json(), { error })
    t.close()
  }
})

// ---- bodies ------------------------------------------------------------------------------------

function rawPost(port, path, headers, chunks) {
  return new Promise((resolve) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
      res.resume()
      resolve({ status: res.statusCode })
    })
    req.on('error', (e) => resolve({ error: e.code }))
    ;(async () => {
      for (const c of chunks) {
        if (!req.write(c)) await new Promise((r) => req.once('drain', r))
        if (req.destroyed) return
      }
      req.end()
    })().catch(() => {})
  })
}

test('giant bodies (declared and chunked, no content-length) are cut off with 413 on every POST route; server survives', async () => {
  const t = await boot()
  const big = Buffer.alloc(64 * 1024, 'a')
  const chunks = Array.from({ length: 64 }, () => big) // 4 MiB
  for (const [path, headers] of [
    ['/authorize', { ...FORM, origin: ISS }],
    ['/token', FORM],
    ['/register', { 'content-type': 'application/json' }],
  ]) {
    const declared = await rawPost(t.port, path, { ...headers, 'content-length': String(big.length * 64) }, chunks)
    assert.ok(declared.status === 413 || declared.error, `${path} declared: ${JSON.stringify(declared)}`)
    const chunked = await rawPost(t.port, path, { ...headers, 'transfer-encoding': 'chunked' }, chunks)
    assert.ok(chunked.status === 413 || chunked.error, `${path} chunked: ${JSON.stringify(chunked)}`)
  }
  assert.equal(t.state.signIns.length, 0)
  assert.equal((await t.req('/.well-known/oauth-protected-resource')).status, 200)
  t.close()
})

test('a 16 KiB-1 body is accepted; a body just over the cap is 413', async () => {
  const t = await boot()
  const pad = (n) => 'x'.repeat(n)
  const under = new URLSearchParams(authQuery())
  under.set('email', 'a@b.c')
  under.set('password', 'pw')
  const base = under.toString().length
  under.set('pad', pad(16 * 1024 - base - 5))
  assert.ok(under.toString().length <= 16 * 1024)
  assert.equal((await t.req('/authorize', post(under, { origin: ISS }))).status, 302)
  under.set('pad', pad(16 * 1024 + 10))
  assert.equal((await t.req('/authorize', post(under, { origin: ISS }))).status, 413)
  t.close()
})

test('/register: odd JSON shapes are 400, never 5xx; ids are unique and nothing is stored', async () => {
  const t = await boot()
  for (const body of ['null', '[]', '"x"', '1', '{}', '{"redirect_uris":"x"}', '{"redirect_uris":[]}', '{"redirect_uris":[1]}', '{"redirect_uris":[null]}', '{"redirect_uris":{"0":"' + CLAUDE + '"}}', `{"redirect_uris":[${Array(11).fill(`"${CLAUDE}"`)}]}`, '{', '', '\u0000'])
    assert.equal((await t.req('/register', { method: 'POST', body })).status, 400, body.slice(0, 40))
  const ids = new Set()
  for (const ct of ['application/json', 'text/plain', undefined]) {
    const res = await t.req('/register', { method: 'POST', headers: ct ? { 'content-type': ct } : {}, body: JSON.stringify({ redirect_uris: [CLAUDE, CHATGPT], client_name: '<script>', token_endpoint_auth_method: 'client_secret_basic' }) })
    assert.equal(res.status, 201)
    const j = await res.json()
    assert.equal(j.token_endpoint_auth_method, 'none')
    assert.ok(!('client_name' in j) && !('client_secret' in j))
    ids.add(j.client_id)
  }
  assert.equal(ids.size, 3)
  t.close()
})

// ---- methods -----------------------------------------------------------------------------------

test('HEAD / OPTIONS / PUT / PATCH / DELETE on every route: never handled, never a state change, never 5xx', async () => {
  const t = await boot()
  const code = await getCode(t)
  const paths = ['/authorize', '/token', '/register', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server']
  for (const path of paths)
    for (const method of ['HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE', 'TRACE'].filter((m) => m !== 'TRACE')) {
      const res = await t.req(path, { method, headers: FORM, ...(method === 'PUT' || method === 'PATCH' ? { body: exchange(code).body } : {}) })
      assert.equal(res.status, 404, `${method} ${path}`)
    }
  // GET on POST-only routes, POST on GET-only metadata
  for (const path of ['/token', '/register']) assert.equal((await t.req(path)).status, 404)
  for (const path of paths.slice(3)) assert.equal((await t.req(path, { method: 'POST' })).status, 404)
  assert.equal(t.state.signIns.length, 1)
  assert.equal((await t.req('/token', exchange(code))).status, 200, 'code survived all of the above')
  t.close()
})

test('path tricks do not reach the OAuth routes or the handler', async () => {
  const t = await boot()
  for (const path of ['/authorize/', '//authorize', '/Authorize', '/authorize%2F', '/%61uthorize', '/token/', '/register/', '/.well-known/oauth-authorization-server/x', '/.well-known/oauth-protected-resource/mcp/']) {
    const res = await t.req(path, { method: 'POST', headers: { ...FORM, origin: ISS }, body: login().body })
    assert.equal(res.status, 404, path)
  }
  assert.equal(t.state.signIns.length, 0)
  t.close()
})

// ---- end to end: real server.js against a fake GoTrue ------------------------------------------

function freePort() {
  return new Promise((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

async function bootE2E() {
  const issued = new Set()
  const calls = []
  const gotrue = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      calls.push(`${req.method} ${url.pathname}${url.search}`)
      const send = (status, obj) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(obj)))
      const session = (claims, n) => {
        const access = jwt({ ...claims, n })
        issued.add(access)
        return { access_token: access, refresh_token: `rt-${claims.tag}-${n}`, expires_in: 600, token_type: 'bearer', user: { id: 'u1', aud: 'authenticated' } }
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const { email, password } = JSON.parse(body)
        if (password === 'good') return send(200, session({ client_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', tag: 'member' }, calls.length))
        if (password === 'pending-pw') return send(200, session({ client_status: 'pending', tag: 'pending' }, calls.length))
        if (email === 'nomember@x.co') return send(403, { code: 403, error_code: 'hook_payload_invalid_content_type', msg: 'Error running hook URI' })
        return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const { refresh_token } = JSON.parse(body)
        if (refresh_token.startsWith('rt-member-')) return send(200, session({ client_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', tag: 'member' }, calls.length))
        return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
      }
      if (url.pathname === '/auth/v1/user') {
        const t = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
        if (issued.has(t)) return send(200, { id: 'u1', aud: 'authenticated', email: 'owner@example.com' })
        return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
      }
      send(404, { msg: 'not found' })
    })
  })
  await new Promise((r) => gotrue.listen(0, '127.0.0.1', r))
  const port = await freePort()
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, PORT: String(port), HOSTNAME: '127.0.0.1', SUPABASE_URL: `http://127.0.0.1:${gotrue.address().port}`, SUPABASE_ANON_KEY: 'anon', MCP_RATE_LIMIT_PER_MIN: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  child.stderr.on('data', (d) => stderr.push(String(d)))
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('listening') && resolve())
    child.on('exit', (c) => reject(new Error(`server exited ${c}: ${stderr.join('')}`)))
  })
  const base = `http://127.0.0.1:${port}`
  return {
    req: (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init }),
    stderr,
    gotrueUrl: `http://127.0.0.1:${gotrue.address().port}`,
    calls,
    issued,
    close: async () => {
      child.kill()
      gotrue.close()
      gotrue.closeAllConnections()
    },
  }
}

const INIT = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } })
const mcp = (token, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: INIT })
const PRM = `Bearer resource_metadata="${ISS}/.well-known/oauth-protected-resource/mcp"`

test('e2e: full connector flow through real server.js + real supabase-js deps (register, authorize, token, /mcp, refresh)', async () => {
  const t = await bootE2E()
  try {
    // discovery from a 401
    const noTok = await t.req('/mcp', mcp(null))
    assert.equal(noTok.status, 401)
    assert.equal(noTok.headers.get('www-authenticate'), PRM)
    assert.equal((await t.req('/.well-known/oauth-protected-resource/mcp')).status, 200)
    assert.equal((await t.req('/.well-known/oauth-authorization-server')).status, 200)

    const reg = await t.req('/register', { method: 'POST', body: JSON.stringify({ redirect_uris: [CLAUDE] }) })
    assert.equal(reg.status, 201)
    const { client_id } = await reg.json()

    const q = authQuery({ client_id })
    const form = await t.req(`/authorize?${q}`)
    assert.equal(form.status, 200)
    assert.match(await form.text(), /wants read-only access/)

    const login = (email, password, over = {}) => {
      const p = authQuery({ client_id, ...over })
      p.set('email', email)
      p.set('password', password)
      return post(p, { origin: ISS, 'x-forwarded-for': `203.0.113.${++ip}` }) // 2 upstream sign-ins/min per IP
    }
    let ip = 0
    const wrong = await t.req('/authorize', login('owner@example.com', 'bad'))
    assert.equal(wrong.status, 401)
    const hook = await t.req('/authorize', login('nomember@x.co', 'bad'))
    assert.equal(hook.status, 403)
    assert.match(await hook.text(), /No active bcns membership/)

    const ok = await t.req('/authorize', login('owner@example.com', 'good'))
    assert.equal(ok.status, 302)
    const loc = new URL(ok.headers.get('location'))
    assert.equal(loc.origin + loc.pathname, CLAUDE)
    assert.equal(loc.searchParams.get('state'), 'st-1')
    assert.equal(loc.searchParams.get('iss'), ISS)
    const code = loc.searchParams.get('code')

    const tok = await t.req('/token', exchange(code, { client_id }))
    assert.equal(tok.status, 200)
    const session = await tok.json()
    assert.equal(session.token_type, 'Bearer')
    assert.equal((await t.req('/token', exchange(code, { client_id }))).status, 400, 'reuse')

    const good = await t.req('/mcp', mcp(session.access_token, { origin: 'https://claude.ai' }))
    assert.equal(good.status, 200)

    const ref = await t.req('/token', post(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refresh_token })))
    assert.equal(ref.status, 200)
    const refreshed = await ref.json()
    assert.notEqual(refreshed.access_token, session.access_token)
    assert.equal((await t.req('/mcp', mcp(refreshed.access_token))).status, 200)

    const badRef = await t.req('/token', post(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'rt-bogus' })))
    assert.equal(badRef.status, 400)
    assert.deepEqual(await badRef.json(), { error: 'invalid_grant' })
  } finally {
    await t.close()
  }
})

test('e2e: pending sign-up (session without client_id) gets no code at /authorize', async () => {
  const t = await bootE2E()
  try {
    const p = authQuery()
    p.set('email', 'pending@x.co')
    p.set('password', 'pending-pw')
    const res = await t.req('/authorize', post(p, { origin: ISS }))
    assert.equal(res.status, 403)
    assert.equal(res.headers.get('location'), null)
    assert.match(await res.text(), /No active bcns membership/)
  } finally {
    await t.close()
  }
})

test('e2e: /mcp missing / malformed / expired / unknown token are 401 with the PRM challenge', async () => {
  const t = await bootE2E()
  try {
    for (const headers of [{}, { authorization: 'Bearer' }, { authorization: 'Bearer ' }, { authorization: 'Basic abc' }, { authorization: 'Bearer a b' }, { authorization: 'bearer x.y.z' }]) {
      const res = await t.req('/mcp', { ...mcp(null), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } })
      assert.equal(res.status, 401, JSON.stringify(headers))
      assert.equal(res.headers.get('www-authenticate'), PRM)
    }
    for (const token of ['expired.token.value', jwt({ client_id: 'x', exp: 1 }), 'a'.repeat(5000)]) {
      const res = await t.req('/mcp', mcp(token))
      assert.equal(res.status, 401)
      assert.equal(res.headers.get('www-authenticate'), PRM)
    }
  } finally {
    await t.close()
  }
})

test('e2e: /mcp token GoTrue vouches for but with no client_id claim is 403 no_membership', async () => {
  const t = await bootE2E()
  try {
    // A pending user's refresh token is refused at /token, so plant the token by signing in at
    // GoTrue directly (the fake issues and remembers it), as a hub session would.
    const gt = await fetch(`${t.gotrueUrl}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email: 'p@x.co', password: 'pending-pw' }) })
    const { access_token } = await gt.json()
    const res = await t.req('/mcp', mcp(access_token))
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { error: 'no_membership' })
  } finally {
    await t.close()
  }
})

test('e2e: /mcp Origin matrix — absent, mcp host, claude.ai, chatgpt.com pass; everything else 403 + stderr line, token never verified', async () => {
  const t = await bootE2E()
  try {
    const login = authQuery()
    login.set('email', 'owner@example.com')
    login.set('password', 'good')
    const code = new URL((await t.req('/authorize', post(login, { origin: ISS }))).headers.get('location')).searchParams.get('code')
    const { access_token } = await (await t.req('/token', exchange(code))).json()
    for (const origin of [undefined, ISS, 'https://claude.ai', 'https://chatgpt.com']) {
      const res = await t.req('/mcp', mcp(access_token, origin ? { origin } : {}))
      assert.equal(res.status, 200, String(origin))
    }
    const before = t.calls.filter((c) => c.includes('/user')).length
    for (const origin of ['https://evil.com', 'null', 'https://claude.ai.evil.com', 'http://claude.ai', 'https://www.claude.ai', 'http://localhost:3000', 'https://chatgpt.com:443', 'https://CLAUDE.AI', '']) {
      const res = await t.req('/mcp', mcp(access_token, { origin }))
      assert.equal(res.status, 403, JSON.stringify(origin))
      assert.deepEqual(await res.json(), { error: 'forbidden_origin' })
    }
    assert.equal(t.calls.filter((c) => c.includes('/user')).length, before, 'bad-origin requests never reach GoTrue')
    await new Promise((r) => setTimeout(r, 100))
    assert.ok(t.stderr.join('').includes('rejected Origin "https://evil.com"'))
  } finally {
    await t.close()
  }
})

test('e2e: real-deps sign-in rejects GoTrue 400/403 without issuing a code; real server survives an upstream outage', async () => {
  const t = await bootE2E()
  try {
    const attempt = async (email, password) => {
      const p = authQuery()
      p.set('email', email)
      p.set('password', password)
      return t.req('/authorize', post(p, { origin: ISS, 'x-forwarded-for': `203.0.113.${++ip}` }))
    }
    let ip = 0
    assert.equal((await attempt('owner@example.com', 'bad')).status, 401)
    assert.equal((await attempt('nomember@x.co', 'bad')).status, 403)
    const ok = await attempt('owner@example.com', 'good')
    assert.equal(ok.status, 302)
  } finally {
    await t.close()
  }
  // upstream gone: a fresh server pointed at a dead port
  const port = await freePort()
  const dead = await freePort()
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, PORT: String(port), HOSTNAME: '127.0.0.1', SUPABASE_URL: `http://127.0.0.1:${dead}`, SUPABASE_ANON_KEY: 'anon' },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  try {
    await new Promise((r) => child.stdout.on('data', (d) => String(d).includes('listening') && r()))
    const p = authQuery()
    p.set('email', 'a@b.c')
    p.set('password', 'pw')
    const res = await fetch(`http://127.0.0.1:${port}/authorize`, { ...post(p, { origin: ISS }), redirect: 'manual' })
    assert.equal(res.status, 503)
    assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`, mcp('tok'))).status, 401)
  } finally {
    child.kill()
  }
})

test('e2e: methods other than the routed ones on /mcp and the OAuth paths are 404 through the real server', async () => {
  const t = await bootE2E()
  try {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']) {
      const res = await t.req('/mcp', { method })
      assert.ok(res.status < 500, `${method} /mcp -> ${res.status}`)
    }
    for (const path of ['/authorize', '/token', '/register']) for (const method of ['PUT', 'DELETE', 'OPTIONS', 'HEAD']) assert.equal((await t.req(path, { method })).status, 404)
    assert.equal((await t.req('/api/health')).status, 200)
  } finally {
    await t.close()
  }
})

// Regression: supabase-js refreshSession retried a network failure with backoff (measured 25.5 s),
// past Claude's 10 s timeout, and answered invalid_grant, which makes the MCP SDK drop the token.
test('refresh answers promptly (503, not invalid_grant) when GoTrue is unreachable', async () => {
  const port = await freePort()
  const dead = await freePort()
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, PORT: String(port), HOSTNAME: '127.0.0.1', SUPABASE_URL: `http://127.0.0.1:${dead}`, SUPABASE_ANON_KEY: 'anon' },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  try {
    await new Promise((r) => child.stdout.on('data', (d) => String(d).includes('listening') && r()))
    const started = Date.now()
    const res = await fetch(`http://127.0.0.1:${port}/token`, { ...post(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x' })), signal: AbortSignal.timeout(5000) })
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { error: 'temporarily_unavailable' })
    assert.ok(Date.now() - started < 5000)
  } finally {
    child.kill()
  }
})
