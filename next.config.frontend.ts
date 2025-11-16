// next.config.frontend.ts - For Swarm static export (frontend only)
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

  // Explicitly ignore API routes during export
  // The API routes should be physically removed before build
  experimental: {
    outputFileTracingIgnores: ['**/api/**'],
  },
};

export default nextConfig;
