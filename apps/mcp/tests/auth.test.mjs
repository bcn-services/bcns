import test from 'node:test'
import assert from 'node:assert/strict'
import { ALLOWED_ORIGIN, authorize, bearer, originAllowed, supabaseEnv } from '../dist/auth.js'

const ok = async () => 'user-1'
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

test('authorize: no header is 401 with a Bearer challenge', async () => {
  const result = await authorize({}, { verify: ok, allow: allowAll })
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.headers['WWW-Authenticate'], 'Bearer realm="bcns"')
})

test('authorize: a token the verifier rejects is 401', async () => {
  const result = await authorize(
    { authorization: 'Bearer forged' },
    { verify: async () => null, allow: allowAll },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
})

test('authorize: a wrong Origin is rejected before the token is read', async () => {
  let verified = false
  const result = await authorize(
    { origin: 'https://evil.example', authorization: 'Bearer good' },
    { verify: async () => { verified = true; return 'user-1' }, allow: allowAll },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(verified, false)
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
    { authorization: 'Bearer good.jwt' },
    { verify: ok, allow: allowAll },
  )
  assert.equal(result.ok, true)
  assert.equal(result.token, 'good.jwt')
  assert.equal(result.userId, 'user-1')
})

test('supabaseEnv: anon key only, and it refuses to start without one', () => {
  assert.deepEqual(supabaseEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }), {
    url: 'https://x.supabase.co',
    anonKey: 'anon',
  })
  assert.throws(() => supabaseEnv({ SUPABASE_URL: 'https://x.supabase.co' }), /SUPABASE_ANON_KEY/)
})
