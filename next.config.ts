import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent prompts are read from agents/*.md at runtime, not bundled.
  outputFileTracingIncludes: { "/api/**": ["./agents/*.md"] },
};

export default nextConfig;
