import * as Sentry from '@sentry/node'

/** Errors only. No SENTRY_DSN = Sentry stays off and nothing is initialised. */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN
  if (!dsn) return false
  Sentry.init({ dsn, environment: 'production', tracesSampleRate: 0, sendDefaultPii: false })
  return true
}

export const captureException = Sentry.captureException
