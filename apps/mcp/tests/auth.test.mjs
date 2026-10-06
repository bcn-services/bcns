import test from 'node:test'
import assert from 'node:assert/strict'
import { ALLOWED_ORIGIN, RESOURCE_METADATA_URL, authorize, bearer, originAllowed, supabaseEnv } from '../dist/auth.js'

const ok = async () => 'user-1'
/** A token shaped like the hook's: header.payload.signature (the signature is verify()'s job). */
const jwt = (claims) => `h.${Buffer.from(JSON.stringify({ sub: 'user-1', ...claims })).toString('base64url')}.s`
const MEMBER = jwt({ client_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', client_role: 'member' })
const allowAll = () => true

test('bearer: present', () => {
  assert.equal(bearer({ authorization: 'Bearer abc.def.ghi' }), 'abc.def.ghi')
})

test('bearer: missing header', () => {
  assert.equal(bearer({}), null)
})

test('bearer: malformed', () => {
  assert.equal(bearer({ authorization: 'abc.def.ghi' }), null)
  assert.equal(bearer({ authorization: 'Basic abc' }), null)
  assert.equal(bearer({ authorization: 'Bearer' }), null)
  assert.equal(bearer({ authorization: 'Bearer ' }), null)
  assert.equal(bearer({ authorization: 'Bearer a b' }), null)
})

test('bearer: header name case does not matter', () => {
  assert.equal(bearer({ authorization: 'Bearer lower' }), 'lower')
  assert.equal(bearer({ Authorization: 'Bearer upper' }), 'upper')
  assert.equal(bearer({ AUTHORIZATION: 'bearer shouty' }), 'shouty')
})

test('origin: absent is fine, wrong is not', () => {
  assert.equal(originAllowed({}), true)
  assert.equal(originAllowed({ origin: ALLOWED_ORIGIN }), true)
  assert.equal(originAllowed({ origin: 'https://evil.example' }), false)
  assert.equal(originAllowed({ origin: 'http://localhost:3103' }), false)
})

test('origin: the hosted connector UIs are allowed, lookalikes are not', () => {
  for (const origin of ['https://mcp.bcn-services.com', 'https://claude.ai', 'https://chatgpt.com']) {
    assert.equal(originAllowed({ origin }), true, origin)
  }
  for (const origin of ['http://claude.ai', 'https://claude.ai.evil.example', 'https://www.chatgpt.com', 'null', '']) {
    assert.equal(originAllowed({ origin }), false, origin)
  }
})

const CHALLENGE =
  'Bearer resource_metadata="https://mcp.bcn-services.com/.well-known/oauth-protected-resource/mcp"'

test('authorize: no header is 401 pointing at the protected-resource metadata', async () => {
  const result = await authorize({}, { verify: ok, allow: allowAll })
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.headers['WWW-Authenticate'], CHALLENGE)
  assert.equal(RESOURCE_METADATA_URL, 'https://mcp.bcn-services.com/.well-known/oauth-protected-resource/mcp')
})

test('authorize: a token the verifier rejects is 401', async () => {
  const result = await authorize(
    { authorization: 'Bearer forged' },
    { verify: async () => null, allow: allowAll },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.headers['WWW-Authenticate'], CHALLENGE)
})

test('authorize: an expired token (verifier says no) is 401 with the same challenge', async () => {
  const result = await authorize({ authorization: `Bearer ${MEMBER}` }, { verify: async () => null, allow: allowAll })
  assert.equal(result.status, 401)
  assert.equal(result.headers['WWW-Authenticate'], CHALLENGE)
})

test('authorize: a wrong Origin is rejected before the token is read, and logged by name', async () => {
  let verified = false
  const warnings = []
  const result = await authorize(
    { origin: 'https://evil.example', authorization: 'Bearer good' },
    { verify: async () => { verified = true; return 'user-1' }, allow: allowAll, warn: (m) => warnings.push(m) },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.deepEqual(result.body, { error: 'forbidden_origin' })
  assert.equal(verified, false)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /https:\/\/evil\.example/)
})

test('authorize: each allowed Origin, and none at all, reaches the token check', async () => {
  for (const origin of ['https://mcp.bcn-services.com', 'https://claude.ai', 'https://chatgpt.com', undefined]) {
    const headers = { authorization: `Bearer ${MEMBER}`, ...(origin ? { origin } : {}) }
    const warnings = []
    const result = await authorize(headers, { verify: ok, allow: allowAll, warn: (m) => warnings.push(m) })
    assert.equal(result.ok, true, String(origin))
    assert.equal(warnings.length, 0)
  }
})

test('authorize: over the rate limit is 429, and the token is never verified', async () => {
  let verified = false
  const result = await authorize(
    { authorization: 'Bearer good' },
    { verify: async () => { verified = true; return 'user-1' }, allow: () => false },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 429)
  assert.equal(verified, false)
})

test('authorize: a verified token passes its own value through', async () => {
  const result = await authorize(
    { authorization: `Bearer ${MEMBER}` },
    { verify: ok, allow: allowAll },
  )
  assert.equal(result.ok, true)
  assert.equal(result.token, MEMBER)
  assert.equal(result.userId, 'user-1')
})

test('supabaseEnv: anon key only, and it refuses to start without one', () => {
  assert.deepEqual(supabaseEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }), {
    url: 'https://x.supabase.co',
    anonKey: 'anon',
  })
  assert.throws(() => supabaseEnv({ SUPABASE_URL: 'https://x.supabase.co' }), /SUPABASE_ANON_KEY/)
})

test('authorize: a verified PENDING sign-up (no client_id claim) is 403 no_membership', async () => {
  for (const token of [jwt({ client_status: 'pending' }), jwt({}), 'not-a-jwt']) {
    const result = await authorize({ authorization: `Bearer ${token}` }, { verify: ok, allow: allowAll })
    assert.equal(result.ok, false, token)
    assert.equal(result.status, 403, token)
    assert.deepEqual(result.body, { error: 'no_membership' }, token)
  }
})
