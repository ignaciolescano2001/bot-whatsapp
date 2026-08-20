import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "ioredis"],
  output: "standalone",
};

export default nextConfig;
