import type { ErrorEvent } from "@sentry/nextjs";

// Sentry attaches the request as-is: Authorization, session cookies, OAuth ?code= / hmac /
// token_hash in the URL. Drop all of it; the stack and message are what we want.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.request;
  delete event.user;
  const ctx = event.contexts?.nextjs;
  if (ctx) delete ctx.request_path;
  return event;
}
