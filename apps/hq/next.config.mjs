import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle — CI ships .next/standalone as the deploy artifact.
  output: "standalone",
  // Next 14.2 loads instrumentation.ts (Sentry init) only behind this flag.
  experimental: { instrumentationHook: true },
};

// Errors only, no source-map upload (needs SENTRY_AUTH_TOKEN; not set in CI).
export default withSentryConfig(nextConfig, { silent: true, telemetry: false, sourcemaps: { disable: true } });
