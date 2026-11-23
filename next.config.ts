import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent prompts are read from agents/*.md at runtime, not bundled.
  outputFileTracingIncludes: { "/api/**": ["./agents/*.md"] },
  webpack: (config, { dev }) => {
    if (dev) {
      // The app writes case state, recordings and the audit log under data/ while it runs.
      // Without this the dev server recompiles on every write, and a request that lands
      // mid-compile fails.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**", "**/data/**", "**/scorecard.md", "**/index.html"],
      };
    }
    return config;
  },
};

export default nextConfig;
