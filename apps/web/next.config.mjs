/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace UI package from source.
  transpilePackages: ["@acme-labs/ui"],
};

export default nextConfig;
