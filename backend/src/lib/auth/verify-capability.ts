/**
 * Shared Capability Verification
 *
 * Verifies that a safe/posting key is authorized by a parent wallet
 * via EIP-712 capability signature.
 *
 * Used by:
 * - /api/forum/post
 * - /api/profile (name/avatar updates)
 */

import { verifyTypedData, getAddress } from "ethers";

/**
 * The EIP-712 domain for capability signatures
 * Must match what the frontend uses when signing
 */
export const CAP_DOMAIN = {
  name: "WoCo Capability",
  version: "1",
};

/**
 * The EIP-712 types for capability signatures
 * Must match frontend constants
 */
export const CAP_TYPES = {
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

/**
 * Capability message structure
 */
export interface CapabilityMessage {
  host: string;
  parent: string;
  safe: string;
  purpose: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  safeProof: string;
  clientCodeHash: string;
  statement: string;
}

/**
 * Full capability bundle sent from client
 */
export interface CapabilityBundle {
  message: CapabilityMessage;
  parentSig: string;
}

/**
 * Result of capability verification
 */
export interface VerifyCapabilityResult {
  valid: boolean;
  error?: string;
  parentAddress?: string;
  safeAddress?: string;
}

/**
 * Verify a capability bundle
 *
 * Checks:
 * 1. Parent signature is valid EIP-712
 * 2. Recovered address matches claimed parent
 * 3. Capability hasn't expired
 * 4. Safe address in capability matches claimed safe
 *
 * @param capability - The capability bundle from the client
 * @param claimedSafe - The safe/posting key address claimed by the request
 * @param allowedHosts - Optional list of allowed hosts (for domain validation)
 * @returns Verification result
 */
export function verifyCapability(
  capability: CapabilityBundle,
  claimedSafe: string,
  allowedHosts?: string[]
): VerifyCapabilityResult {
  try {
    // 1. Basic validation
    if (!capability?.message || !capability?.parentSig) {
      return { valid: false, error: "Missing capability message or signature" };
    }

    const { message, parentSig } = capability;

    // 2. Check expiration
    const expiresAt = new Date(message.expiresAt).getTime();
    if (isNaN(expiresAt)) {
      return { valid: false, error: "Invalid expiresAt date" };
    }
    if (Date.now() > expiresAt) {
      return { valid: false, error: "Capability has expired" };
    }

    // 3. Check issuedAt is in the past (not future-dated)
    const issuedAt = new Date(message.issuedAt).getTime();
    if (isNaN(issuedAt)) {
      return { valid: false, error: "Invalid issuedAt date" };
    }
    if (issuedAt > Date.now() + 60000) { // Allow 1 minute clock skew
      return { valid: false, error: "Capability issuedAt is in the future" };
    }

    // 4. Verify host if allowedHosts provided
    if (allowedHosts && allowedHosts.length > 0) {
      if (!allowedHosts.includes(message.host)) {
        return { valid: false, error: `Invalid host: ${message.host}` };
      }
    }

    // 5. Verify the safe address matches
    const safeLower = message.safe.toLowerCase();
    const claimedLower = claimedSafe.toLowerCase();
    if (safeLower !== claimedLower) {
      return {
        valid: false,
        error: `Safe address mismatch: capability has ${message.safe}, request claims ${claimedSafe}`
      };
    }

    // 6. Verify the EIP-712 signature
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyTypedData(
        CAP_DOMAIN,
        CAP_TYPES,
        message,
        parentSig
      );
    } catch (e) {
      console.error("[verifyCapability] Signature verification failed:", e);
      return { valid: false, error: "Invalid signature" };
    }

    // 7. Check recovered address matches claimed parent
    const recoveredLower = recoveredAddress.toLowerCase();
    const claimedParentLower = message.parent.toLowerCase();
    if (recoveredLower !== claimedParentLower) {
      console.warn(
        `[verifyCapability] Parent mismatch: claimed ${message.parent}, recovered ${recoveredAddress}`
      );
      return { valid: false, error: "Signature does not match claimed parent" };
    }

    // 8. Success!
    return {
      valid: true,
      parentAddress: getAddress(recoveredAddress), // Checksummed
      safeAddress: getAddress(message.safe),       // Checksummed
    };

  } catch (e) {
    console.error("[verifyCapability] Unexpected error:", e);
    return { valid: false, error: "Verification failed" };
  }
}

/**
 * Extract capability from request headers or body
 *
 * Looks for capability in:
 * 1. Request body (preferred)
 * 2. X-Capability header (base64 encoded JSON)
 *
 * @param req - The request object
 * @param body - Parsed request body (if available)
 * @returns Capability bundle or null
 */
export function extractCapability(
  req: Request,
  body?: { capability?: CapabilityBundle }
): CapabilityBundle | null {
  // Try body first
  if (body?.capability?.message && body?.capability?.parentSig) {
    return body.capability;
  }

  // Try header (base64 encoded)
  const header = req.headers.get("x-capability");
  if (header) {
    try {
      const decoded = Buffer.from(header, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded) as CapabilityBundle;
      if (parsed?.message && parsed?.parentSig) {
        return parsed;
      }
    } catch {
      // Invalid header format
    }
  }

  return null;
}

/**
 * Helper to verify capability from a request
 * Combines extraction and verification
 *
 * @param req - The request object
 * @param body - Parsed request body
 * @param claimedSafe - The safe address claimed in the request
 * @param allowedHosts - Optional allowed hosts
 * @returns Verification result
 */
export function verifyCapabilityFromRequest(
  req: Request,
  body: { capability?: CapabilityBundle },
  claimedSafe: string,
  allowedHosts?: string[]
): VerifyCapabilityResult {
  const capability = extractCapability(req, body);

  if (!capability) {
    return { valid: false, error: "No capability provided" };
  }

  return verifyCapability(capability, claimedSafe, allowedHosts);
}
