import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import * as Sentry from '@sentry/node'

/**
 * TEMPORARY — proves Sentry receives a scrubbed server error from mcp. Removed in the follow-up PR.
 * Inert unless SENTRY_TEST_TOKEN is set in /srv/mcp/env: no token or a wrong x-sentry-test header = false (404).
 * True means it captured an exception carrying a fake user; the caller answers 200.
 */
export function sentryTest(req: IncomingMessage, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.SENTRY_TEST_TOKEN
  const given = req.headers['x-sentry-test']
  if (!expected || typeof given !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  Sentry.withScope((scope) => {
    scope.setUser({ id: 'sentry-test-user', email: 'sentry-test@example.invalid' })
    Sentry.captureException(new Error(`sentry-test: mcp throw ${new Date().toISOString()}`))
  })
  return true
}
