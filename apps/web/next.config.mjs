// Static export is OPT-IN via BUILD_STATIC_EXPORT=1 (`pnpm --filter @nseluga/web export`).
// It is not the default because the default build is what Vercel runs, and
// `output: "export"` forces `images.unoptimized`, which would ship the
// case-study screenshots at full size on the live site for no benefit.
//
// The site has no server actions, route handlers, or middleware, so the export
// is lossless: every route prerenders to static HTML and can be served by nginx
// off the droplet with no Node process. See docs/architecture/hosted-web-model.md.
const staticExport = process.env.BUILD_STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace UI package from source.
  transpilePackages: ["@nseluga/ui"],
  ...(staticExport ? { output: "export", images: { unoptimized: true } } : {}),
};

export default nextConfig;
