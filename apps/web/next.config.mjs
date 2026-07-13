/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace UI package from source.
  transpilePackages: ["@bcns/ui"],
};

export default nextConfig;
