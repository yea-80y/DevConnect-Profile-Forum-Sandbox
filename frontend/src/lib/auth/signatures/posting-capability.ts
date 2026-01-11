/**
 * Posting capability EIP-712 signature handling
 */

import { Wallet, HDNodeWallet, ZeroHash } from "ethers";
import type { Eip1193WithSelected, CapabilityMessage, CapabilityPayload } from "../types";
import { CAP_DOMAIN, CAP_TYPES_WALLET, PURPOSE_DEFAULT } from "../constants";

/* ============================
 * Helper Functions
 * ============================ */

type UUID = `${string}-${string}-${string}-${string}-${string}`;

function generateUUIDv4(): UUID {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Array.from(buf, b => b.toString(16).padStart(2, "0"));
  const uuid = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  return uuid as UUID;
}

function makeNonceAndIssuedAt() {
  const uuid = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : generateUUIDv4();
  const issuedAt = new Date().toISOString();
  return { nonce: uuid, issuedAt };
}

function getHost(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.host || "localhost";
}

/* ============================
 * Posting Capability
 * ============================ */

/**
 * Build capability message for posting authorization
 */
export function buildCapabilityMessage(opts: {
  host: string;
  parent: string;
  safe: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  safeProof: string;
  statement?: string;
}): CapabilityMessage {
  return {
    host: opts.host,
    parent: opts.parent,
    safe: opts.safe,
    purpose: PURPOSE_DEFAULT,
    nonce: opts.nonce,
    issuedAt: opts.issuedAt,
    expiresAt: opts.expiresAt,
    safeProof: opts.safeProof,
    clientCodeHash: ZeroHash,
    statement: opts.statement || `Authorize ${opts.safe} as posting key for ${opts.host}`,
  };
}

/**
 * Request posting capability signature from user
 * Creates a new safe key and requests authorization from parent wallet
 */
export async function requestPostingCapabilitySignature(
  eth: Eip1193WithSelected,
  parentAddr: string
): Promise<{
  safeWallet: HDNodeWallet;
  capability: CapabilityMessage;
  signature: string;
}> {
  // Create new safe (posting) key
  const safeWallet = Wallet.createRandom();

  // Build capability message with random nonce (for security)
  const { nonce, issuedAt } = makeNonceAndIssuedAt();
  const host = getHost();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(); // 1 year
  const safeProof = await safeWallet.signMessage(`${host}:${nonce}`);

  const capability = buildCapabilityMessage({
    host,
    parent: parentAddr,
    safe: safeWallet.address,
    nonce,
    issuedAt,
    expiresAt,
    safeProof,
  });

  // Request EIP-712 signature from parent wallet
  const payload: CapabilityPayload = {
    domain: CAP_DOMAIN,
    types: CAP_TYPES_WALLET,
    primaryType: "AuthorizeSafeSigner",
    message: capability,
  };

  const json = JSON.stringify(payload);
  const signature = (await eth.request({
    method: "eth_signTypedData_v4",
    params: [parentAddr, json],
  })) as string;

  return { safeWallet, capability, signature };
}
