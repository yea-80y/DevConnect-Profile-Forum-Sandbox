// next.config.server.ts - For backend API server only
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NO static export - we need Node.js runtime for API routes
  // output: 'export' would break all API functionality

  // Disable image optimization (not needed for API-only server)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
