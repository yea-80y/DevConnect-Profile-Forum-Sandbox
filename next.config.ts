// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Let <Image> accept local URLs with a query string like ?v=123
    // This matches your /api proxy and any ?v=... you pass.
    localPatterns: [
      { pathname: "/api/swarm/img/**", search: "v=*" },
    ],

    // OPTIONAL: only keep this if you ever give <Image> a *direct* Bee URL.
    // If you stick to the /api proxy (recommended), you can delete this whole block.
    // remotePatterns: [
    //   {
    //     protocol: "http",      // change to "https" if your Bee runs over TLS
    //     hostname: "localhost", // change to your Bee host
    //     port: "1633",          // change to your Bee port if not 1633
    //     pathname: "/bytes/**",
    //     // search: "v=*",      // add if you also append ?v=... to direct Bee URLs
    //   },
    //   {
    //     protocol: "http",
    //     hostname: "localhost",
    //     port: "1633",
    //     pathname: "/bzz/**",
    //   },
    // ],
  },
};

export default nextConfig;

