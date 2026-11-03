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
  // Simulated ingestion paths were removed (URL ingest, text search, match
  // review, engine benchmark, references, engine settings); old links land on the real import instead.
  redirects() {
    return [
      { source: "/ingest/:path(import|search|review)", destination: "/ingest", permanent: false },
      { source: "/benchmark/:path*", destination: "/", permanent: false },
      { source: "/library/references", destination: "/library", permanent: false },
      { source: "/settings/engines", destination: "/settings", permanent: false },
    ];
  },
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
