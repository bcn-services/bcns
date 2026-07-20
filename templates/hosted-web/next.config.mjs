/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace packages from source (raw .ts, no dist).
  transpilePackages: ["@bcns/ui", "@bcns/app-core"],
  // Self-contained server bundle for the Docker runtime stage (see Dockerfile).
  output: "standalone",
};

export default nextConfig;
