import * as Sentry from "@sentry/nextjs";

// Errors only. No SENTRY_DSN = Sentry off (init is a no-op), never a crash.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: "production",
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
