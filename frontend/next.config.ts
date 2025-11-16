// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for Swarm hosting
  output: 'export',

  // Base path for Swarm deployment - reads from environment variable
  // This gets updated by the upload script after each deployment
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Asset prefix must match basePath for client-side navigation to work
  // This ensures fetch requests for page data include the correct path
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Use trailing slash to ensure .html files are loaded correctly
  // This is important for static export with basePath
  trailingSlash: true,

  // Ignore ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Fix warning about multiple lockfiles (moved out of experimental in Next.js 15)
  outputFileTracingRoot: require('path').join(__dirname, '../'),

  // Configure webpack to include basePath in chunk loading
  webpack: (config) => {
    // Use the basePath value to ensure all chunks are loaded with full path
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    config.output.publicPath = basePath ? `${basePath}/_next/` : '/_next/';
    return config;
  },
};

export default nextConfig;

