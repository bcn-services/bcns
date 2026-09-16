/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared UI package from source (raw .tsx, no dist).
  transpilePackages: ["@bcn-services/ui"],
  // Self-contained server bundle — CI ships .next/standalone as the deploy artifact.
  output: "standalone",
};

export default nextConfig;
