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
  // Removed paths: the simulated ingestion views (text search, match review,
  // engine benchmark, references, engine settings) and Import from disk. URL
  // ingest now lives at /ingest, so /ingest/url (query included) lands there.
  redirects() {
    return [
      { source: "/ingest/:path(url|import|search|review)", destination: "/ingest", permanent: false },
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
