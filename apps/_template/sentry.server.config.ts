import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./lib/sentry-scrub";

// Errors only. No SENTRY_DSN = Sentry off (init is a no-op), never a crash.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: "production",
  tracesSampleRate: 0,
  sendDefaultPii: false,
  // Breadcrumbs copy console lines and outgoing URLs (Supabase filters carry customer emails).
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  beforeSend: scrubEvent,
});
