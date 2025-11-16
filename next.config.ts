// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for Swarm hosting
  output: 'export',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Trailing slash for better Swarm compatibility
  trailingSlash: true,
};

export default nextConfig;

