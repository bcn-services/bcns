import test from 'node:test'
import assert from 'node:assert/strict'
import { initSentry } from '../dist/sentry.js'

test('no SENTRY_DSN: Sentry stays off and nothing throws', () => {
  assert.equal(initSentry({}), false)
  assert.equal(initSentry({ SENTRY_DSN: '' }), false)
})

test('SENTRY_DSN set: Sentry initialises (no network at init)', () => {
  assert.equal(initSentry({ SENTRY_DSN: 'https://key@o0.ingest.invalid/1' }), true)
})

test('scrubEvent drops the request (bearer, cookies, OAuth query) and user', async () => {
  const { scrubEvent } = await import('../dist/sentry.js')
  const out = scrubEvent({
    message: 'boom',
    request: {
      url: 'https://mcp/oauth/cb?code=OAUTHCODE',
      headers: { authorization: 'Bearer SECRET' },
      cookies: { s: 'SECRET' },
    },
    user: { ip_address: '1.2.3.4' },
  })
  assert.equal(out.message, 'boom')
  assert.ok(!JSON.stringify(out).includes('SECRET'))
  assert.ok(!JSON.stringify(out).includes('OAUTHCODE'))
})
