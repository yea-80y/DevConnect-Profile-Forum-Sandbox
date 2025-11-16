// Frontend-safe Swarm config
// Only contains NEXT_PUBLIC_ environment variables (safe for browser)

export const BEE_URL =
  process.env.NEXT_PUBLIC_BEE_URL || "http://localhost:3323";

export const POSTAGE_BATCH_ID =
  process.env.NEXT_PUBLIC_POSTAGE_BATCH_ID || "";
