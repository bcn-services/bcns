import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LIMIT, WINDOW_MS, createRateLimiter, limitFromEnv } from '../dist/limit.js'

test('the call past the limit is rejected', () => {
  const limiter = createRateLimiter(3)
  const now = 1_000_000
  assert.deepEqual(
    [0, 1, 2, 3].map(() => limiter.allow('tok', now)),
    [true, true, true, false],
  )
})

test('the window rolls over', () => {
  const limiter = createRateLimiter(2, 1000)
  const t0 = 500_000
  assert.equal(limiter.allow('tok', t0), true)
  assert.equal(limiter.allow('tok', t0 + 1), true)
  assert.equal(limiter.allow('tok', t0 + 2), false)
  assert.equal(limiter.allow('tok', t0 + 1000), true, 'a fresh window starts')
  assert.equal(limiter.allow('tok', t0 + 1001), true)
  assert.equal(limiter.allow('tok', t0 + 1002), false)
})

test('one caller cannot spend another caller budget', () => {
  const limiter = createRateLimiter(1)
  const now = 2_000
  assert.equal(limiter.allow('token-a', now), true)
  assert.equal(limiter.allow('token-a', now), false)
  assert.equal(limiter.allow('token-b', now), true)
})

test('defaults are 60 a minute, and the env override only takes a positive integer', () => {
  assert.equal(DEFAULT_LIMIT, 60)
  assert.equal(WINDOW_MS, 60_000)
  assert.equal(limitFromEnv({}), 60)
  assert.equal(limitFromEnv({ MCP_RATE_LIMIT_PER_MIN: '10' }), 10)
  assert.equal(limitFromEnv({ MCP_RATE_LIMIT_PER_MIN: 'lots' }), 60)
  assert.equal(limitFromEnv({ MCP_RATE_LIMIT_PER_MIN: '0' }), 60)
  assert.equal(limitFromEnv({ MCP_RATE_LIMIT_PER_MIN: '-5' }), 60)
})
