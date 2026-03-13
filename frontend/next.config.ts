import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" for Docker; Vercel sets VERCEL=1 and needs default output
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
};

export default nextConfig;
