import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Exposed so the UI can point to matching release artifacts (e.g. the MCP install command pins this tag)
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  // "standalone" for Docker; Vercel sets VERCEL=1 and needs default output
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
