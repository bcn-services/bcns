/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace UI package from source.
  transpilePackages: ["@nseluga/ui"],
};

export default nextConfig;
