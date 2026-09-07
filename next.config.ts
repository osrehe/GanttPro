import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El engine se consume directamente desde su código TypeScript (workspace npm).
  transpilePackages: ["@ganttpro/engine"],
};

export default nextConfig;
