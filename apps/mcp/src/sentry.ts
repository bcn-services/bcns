import * as Sentry from '@sentry/node'

/** Request headers (bearer), cookies, OAuth query strings: drop the request, keep stack + message. */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.request
  delete event.user
  return event
}

/** Errors only. No SENTRY_DSN = Sentry stays off and nothing is initialised. */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN
  if (!dsn) return false
  Sentry.init({
    dsn,
    environment: 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Console lines and outgoing URLs (Supabase filters carry customer emails) must not ride along.
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent,
    // Keep Node's crash-and-restart-under-systemd semantics for a stray rejection.
    integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })],
  })
  return true
}

export const captureException = Sentry.captureException
