/**
 * Shared TypeScript types for authentication system
 */

import type { TypedDataDomain, TypedDataField } from "ethers";

/* ============================
 * Auth State Types
 * ============================ */

export type PostAuth = "parent-bound" | "local-only" | "blocked";
export type AuthKind = "web3" | "local" | "none";

/* ============================
 * Posting Capability Types (EIP-712)
 * ============================ */

export interface CapabilityMessage {
  host: string;
  parent: string;
  safe: string;
  purpose: string; // "forum-posting"
  nonce: string;
  issuedAt: string; // ISO
  expiresAt: string; // ISO
  safeProof: string; // 0x..
  clientCodeHash: string; // 0x..
  statement: string;
}

export interface CapabilityBundle {
  message: CapabilityMessage;
  parentSig: string; // 0x...
}

export type CapabilityPayload = {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: "AuthorizeSafeSigner";
  message: CapabilityMessage;
};

/* ============================
 * POD Identity Types (EIP-712)
 * ============================ */

export interface PodIdentityMessage {
  purpose: string;
  address: string;
  nonce: string;
}

export type PodIdentityPayload = {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: "DerivePodIdentity";
  message: PodIdentityMessage;
};

export interface PodSeedData {
  seed: string; // hex string derived from signature
  derivedFrom: "eip712-signature"; // Track how it was derived
}

/* ============================
 * Storage Types
 * ============================ */

export interface EncryptedJSON {
  iv: string; // hex
  ct: string; // hex
}

/* ============================
 * EIP-1193 Provider Types
 * ============================ */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface Eip1193WithSelected extends Eip1193Provider {
  selectedAddress?: string | null;
}

/* ============================
 * Hook Return Type
 * ============================ */

export interface UsePostingIdentity {
  ready: boolean;
  kind: AuthKind;
  postAuth: PostAuth;
  parent?: string;
  safe?: string;
  capId?: string;
  startWeb3Login: () => Promise<boolean>;
  startLocalLogin: () => Promise<boolean>;
  requestPostingCapability: () => Promise<void>;
  requestPodIdentity: () => Promise<void>;
  signCapabilityNow?: () => Promise<void>; // deprecated - use requestPostingCapability
  rotateSafe: () => Promise<void>;
  logout: () => Promise<void>;
  signPost: (payload: Uint8Array | string) => Promise<string>;
  getWalletForPOD: () => Promise<{ privateKey?: string; seed?: string } | null>;
  getCapabilityBundle: () => Promise<CapabilityBundle | null>;
}
