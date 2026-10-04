import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
const apiOrigin = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nextConfig: NextConfig = {
  turbopack: { root },
  async redirects() { return [{ source: "/", destination: "/tk", permanent: false }]; },
  async rewrites() { return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }]; },
};
export default nextConfig;
