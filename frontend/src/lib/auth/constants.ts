/**
 * Authentication constants - EIP-712 domains, types, and configuration
 */

import type { TypedDataDomain, TypedDataField } from "ethers";

/* ============================
 * Posting Capability (EIP-712)
 * ============================ */

export const CAP_DOMAIN: TypedDataDomain = {
  name: "WoCo Capability",
  version: "1"
};

export const CAP_TYPES: Record<string, TypedDataField[]> = {
  AuthorizeSafeSigner: [
    { name: "host", type: "string" },
    { name: "parent", type: "address" },
    { name: "safe", type: "address" },
    { name: "purpose", type: "string" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "string" },
    { name: "expiresAt", type: "string" },
    { name: "safeProof", type: "bytes" },
    { name: "clientCodeHash", type: "bytes32" },
    { name: "statement", type: "string" },
  ],
};

export const CAP_TYPES_WALLET: Record<string, TypedDataField[]> = {
  ...CAP_TYPES,
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
  ],
};

export const PURPOSE_DEFAULT = "forum-posting" as const;

/* ============================
 * POD Identity (EIP-712)
 * ============================ */

export const POD_IDENTITY_DOMAIN: TypedDataDomain = {
  name: "WoCo POD Identity",
  version: "1"
};

export const POD_IDENTITY_NONCE = "WOCO-POD-IDENTITY-V1" as const;

export const POD_IDENTITY_TYPES: Record<string, TypedDataField[]> = {
  DerivePodIdentity: [
    { name: "purpose", type: "string" },
    { name: "address", type: "address" },
    { name: "nonce", type: "string" },
  ],
};

export const POD_IDENTITY_TYPES_WALLET: Record<string, TypedDataField[]> = {
  ...POD_IDENTITY_TYPES,
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
  ],
};

/* ============================
 * IndexedDB Configuration
 * ============================ */

export const STORAGE_DB = "woco-auth";
export const OS_KV = "kv";

export const K_DEVICE_KEY = "woco:deviceKey";
export const K_ENC_KEYSTORE = "woco:encKeystore";
export const K_ENC_CAP = "woco:encCap";
export const K_POD_SEED = "woco:podSeed";
export const K_KIND = "woco:kind";
export const K_PARENT = "woco:parent"; // Parent Ethereum address for web3 users
