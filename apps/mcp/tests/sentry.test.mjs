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
