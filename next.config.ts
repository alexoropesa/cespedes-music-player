import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Connectivity detection + automatic retry of navigations while offline.
    // Exposes `useOffline()` for the offline indicator in the shell (RF-07).
    useOffline: true,
  },
  // Local QA through 127.0.0.1 (the back office runs on the client's own PC).
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
