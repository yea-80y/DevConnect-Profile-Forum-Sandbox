/**
 * Signature verification helpers
 */

import { verifyTypedData, verifyMessage } from "ethers";
import type { CapabilityBundle, CapabilityMessage } from "../types";
import { CAP_DOMAIN, CAP_TYPES } from "../constants";

/* ============================
 * Capability Verification
 * ============================ */

/**
 * Verify posting capability locally
 * Checks EIP-712 signature, host scope, expiry, and safe proof
 */
export function verifyCapabilityLocal(
  bundle: CapabilityBundle,
  expectedSafe: string,
  expectedHost: string
): boolean {
  const { message, parentSig } = bundle;

  // 1) Verify EIP-712 signature (parent authorized the safe)
  const recovered = verifyTypedData(CAP_DOMAIN, CAP_TYPES, message, parentSig);
  if (recovered.toLowerCase() !== message.parent.toLowerCase()) {
    console.warn("[verifyCapability] EIP-712 signature mismatch");
    return false;
  }

  // 2) Verify safe address matches
  if (message.safe.toLowerCase() !== expectedSafe.toLowerCase()) {
    console.warn("[verifyCapability] Safe address mismatch");
    return false;
  }

  // 3) Verify host scope (prevent cross-domain attacks)
  if (message.host !== expectedHost) {
    console.warn("[verifyCapability] Host scope mismatch", {
      expected: expectedHost,
      got: message.host,
    });
    return false;
  }

  // 4) Verify not expired
  const expiry = new Date(message.expiresAt);
  if (expiry < new Date()) {
    console.warn("[verifyCapability] Capability expired");
    return false;
  }

  // 5) Verify safe proof (safe key signed `host:nonce`)
  const proofMessage = `${message.host}:${message.nonce}`;
  const proofSigner = verifyMessage(proofMessage, message.safeProof);
  if (proofSigner.toLowerCase() !== message.safe.toLowerCase()) {
    console.warn("[verifyCapability] Safe proof invalid");
    return false;
  }

  return true;
}

/**
 * Get capability ID (content hash for future-proofing)
 */
export function capabilityId(input: CapabilityBundle | CapabilityMessage): string {
  const { keccak256, toUtf8Bytes } = require("ethers");
  const json = "message" in (input as CapabilityBundle)
    ? JSON.stringify((input as CapabilityBundle).message)
    : JSON.stringify(input);
  return keccak256(toUtf8Bytes(json));
}
