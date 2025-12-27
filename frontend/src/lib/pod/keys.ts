/**
 * POD Key Derivation Utilities
 *
 * Derives EdDSA/ed25519 keys from Ethereum secp256k1 private keys
 * for POD signing. This allows users to use their existing Ethereum
 * wallet for both forum posts (ECDSA) and POD signatures (EdDSA).
 *
 * Derivation is deterministic: same Ethereum key → same POD key
 */

import { sha256 } from "ethers";
import * as ed from "@noble/ed25519";

/**
 * Derive a 32-byte ed25519 private key from an Ethereum private key.
 * Uses SHA-256 hash of the Ethereum key as the ed25519 seed.
 *
 * @param ethereumPrivateKey - Ethereum private key (0x-prefixed hex string)
 * @returns ed25519 private key as Uint8Array (32 bytes)
 */
export function deriveEd25519FromEthereum(ethereumPrivateKey: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanKey = ethereumPrivateKey.startsWith("0x")
    ? ethereumPrivateKey.slice(2)
    : ethereumPrivateKey;

  // Hash the Ethereum private key with SHA-256 to get 32 bytes
  // This creates a deterministic ed25519 seed
  const hash = sha256("0x" + cleanKey);

  // Convert hash to Uint8Array (32 bytes)
  const hashBytes = new Uint8Array(
    hash.slice(2).match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  return hashBytes;
}

/**
 * Get the ed25519 public key from a private key.
 *
 * @param privateKey - ed25519 private key (32 bytes)
 * @returns ed25519 public key as Uint8Array (32 bytes)
 */
export async function getEd25519PublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  return await ed.getPublicKeyAsync(privateKey);
}

/**
 * Encode ed25519 key to Base64 for POD library.
 *
 * @param key - ed25519 key (private or public)
 * @returns Base64-encoded string
 */
export function encodeKeyToBase64(key: Uint8Array): string {
  return Buffer.from(key).toString("base64");
}

/**
 * Decode Base64 key to Uint8Array.
 *
 * @param base64Key - Base64-encoded key
 * @returns Uint8Array key
 */
export function decodeKeyFromBase64(base64Key: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64Key, "base64"));
}

/**
 * Encode ed25519 key to hex for storage/display.
 *
 * @param key - ed25519 key (private or public)
 * @returns Hex-encoded string with 0x prefix
 */
export function encodeKeyToHex(key: Uint8Array): string {
  return "0x" + Array.from(key).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derive ed25519 private key from a 32-byte seed (hex string)
 * Used for web3 users where seed is derived from EIP-712 signature
 *
 * @param seedHex - 32-byte seed as hex string (0x-prefixed, 66 chars total)
 * @returns ed25519 private key as Uint8Array (32 bytes)
 */
export function deriveEd25519FromSeed(seedHex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanSeed = seedHex.startsWith("0x") ? seedHex.slice(2) : seedHex;

  // Convert hex to Uint8Array (should be exactly 32 bytes)
  const seedBytes = new Uint8Array(
    cleanSeed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  if (seedBytes.length !== 32) {
    throw new Error(`Invalid seed length: expected 32 bytes, got ${seedBytes.length}`);
  }

  return seedBytes;
}

/**
 * Generate a complete POD keypair from an Ethereum wallet OR a seed.
 * Returns both private and public keys in multiple formats.
 *
 * For local users: pass { privateKey: "0x..." }
 * For web3 users: pass { seed: "0x..." } (derived from EIP-712 signature)
 *
 * @param input - Either ethereumPrivateKey or seed
 * @returns POD keypair with multiple encodings
 */
export async function derivePODKeypair(input: { privateKey?: string; seed?: string }) {
  let ed25519PrivateKey: Uint8Array;

  if (input.privateKey) {
    // Local users: derive from Ethereum private key
    ed25519PrivateKey = deriveEd25519FromEthereum(input.privateKey);
  } else if (input.seed) {
    // Web3 users: use seed directly (derived from EIP-712 signature)
    ed25519PrivateKey = deriveEd25519FromSeed(input.seed);
  } else {
    throw new Error("Must provide either privateKey or seed");
  }

  const publicKey = await getEd25519PublicKey(ed25519PrivateKey);

  return {
    privateKey: {
      bytes: ed25519PrivateKey,
      base64: encodeKeyToBase64(ed25519PrivateKey),
      hex: encodeKeyToHex(ed25519PrivateKey)
    },
    publicKey: {
      bytes: publicKey,
      base64: encodeKeyToBase64(publicKey),
      hex: encodeKeyToHex(publicKey)
    }
  };
}
