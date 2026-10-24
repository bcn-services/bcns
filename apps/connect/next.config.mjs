// Report-only CSP: nothing is blocked yet, tighten after a clean soak.
// /api/oauth/* is excluded: the Google picker routes set their own Referrer-Policy and enforcing CSP.
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy-Report-Only",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'; base-uri 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared UI package from source (raw .tsx, no dist).
  transpilePackages: ["@bcn-services/ui", "@bcn-services/app-core"],
  // Self-contained server bundle — CI ships .next/standalone as the deploy artifact.
  output: "standalone",
  async headers() {
    return [{ source: "/:path((?!api/oauth/).*)", headers: securityHeaders }];
  },
};

export default nextConfig;
