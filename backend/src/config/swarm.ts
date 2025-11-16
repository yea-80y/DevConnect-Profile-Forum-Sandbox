// Client + server both use this Bee URL.
// In prod, just set NEXT_PUBLIC_BEE_URL=https://your.gateway
export const BEE_URL =
  process.env.NEXT_PUBLIC_BEE_URL || "http://localhost:3323";

// OK to expose for the prototype; server also reads this.
export const POSTAGE_BATCH_ID =
  process.env.NEXT_PUBLIC_POSTAGE_BATCH_ID || "";

// Server-only (DO NOT make this NEXT_PUBLIC)
export const FEED_PRIVATE_KEY = process.env.FEED_PRIVATE_KEY || ""; // with or without 0x

// Helpers (server-side only)
/** Ensure the key is 0x-prefixed and 32 bytes. */
export function normalizePk(pk: string): `0x${string}` {
  const v = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error("FEED_PRIVATE_KEY must be a 32-byte hex string (with or without 0x in .env)");
  }
  return v as `0x${string}`;
}

/** Throw early if the signer isn’t configured (server-side). */
export function assertFeedSignerConfigured(): void {
  if (!FEED_PRIVATE_KEY) {
    throw new Error("FEED_PRIVATE_KEY is missing (set it in .env.local)");
  }
}
