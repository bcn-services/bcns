import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * Response headers on every page except /authorize, which sets its own CSP (its form-action has to
 * name the redirect origin). `unsafe-inline` scripts/styles because Next's App Router hydration is
 * inline and HQ has no nonce middleware; the rest is closed: no framing (clickjacking the
 * approve/reject buttons), no other origin for connect/img/font, no <object>, no base-tag games.
 */
export function securityHeaders(dev = process.env.NODE_ENV !== "production") {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle — CI ships .next/standalone as the deploy artifact.
  output: "standalone",
  // Next 14.2 loads instrumentation.ts (Sentry init) only behind this flag.
  experimental: { instrumentationHook: true },
  async headers() {
    return [{ source: "/((?!authorize$).*)", headers: securityHeaders() }];
  },
};

// Errors only, no source-map upload (needs SENTRY_AUTH_TOKEN; not set in CI).
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
});
