import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "ioredis"],
  output: "standalone",
  agentRules: false,
  // Sin esto, Turbopack detecta el package-lock.json de la raíz del repo
  // (del gateway de Twilio) y confunde el root del workspace con éste.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
