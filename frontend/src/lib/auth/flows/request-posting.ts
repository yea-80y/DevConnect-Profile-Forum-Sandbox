/**
 * Lazy posting capability request flow
 * Called when user attempts to post to forum
 */

import { verifyTypedData } from "ethers";
import type { Eip1193WithSelected, CapabilityBundle } from "../types";
import { CAP_DOMAIN, CAP_TYPES, K_ENC_KEYSTORE, K_ENC_CAP } from "../constants";
import { getKV, putKV } from "../storage/indexeddb";
import { ensureDeviceKey, encryptJSON } from "../storage/encryption";
import { requestPostingCapabilitySignature } from "../signatures/posting-capability";
import { verifyCapabilityLocal } from "../signatures/verification";

/* ============================
 * Lazy Posting Capability
 * ============================ */

function getHost(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.host || "localhost";
}

/**
 * Request posting capability from user
 * Shows MetaMask prompt to authorize posting
 */
export async function requestPostingCapability(
  parentAddress: string
): Promise<{
  success: boolean;
  safeAddress?: string;
  capabilityId?: string;
  error?: string;
}> {
  try {
    // Check if capability already exists
    const existingCap = await getKV(K_ENC_CAP);
    if (existingCap) {
      console.log("[requestPosting] Capability already exists");
      return { success: true }; // Already authorized
    }

    const eth = (window as { ethereum?: Eip1193WithSelected }).ethereum;
    if (!eth) {
      return { success: false, error: "No wallet found" };
    }

    // Request posting capability signature
    const { safeWallet, capability, signature } = await requestPostingCapabilitySignature(
      eth,
      parentAddress
    );

    // Verify signature before storing
    const recovered = verifyTypedData(CAP_DOMAIN, CAP_TYPES, capability, signature);
    if (recovered.toLowerCase() !== parentAddress.toLowerCase()) {
      throw new Error("Signature verification failed");
    }

    // Create capability bundle
    const bundle: CapabilityBundle = {
      message: capability,
      parentSig: signature,
    };

    // Verify capability locally
    const isValid = verifyCapabilityLocal(bundle, safeWallet.address, getHost());
    if (!isValid) {
      throw new Error("Capability validation failed");
    }

    // Encrypt and store
    const deviceKey = await ensureDeviceKey();
    const keystore = await safeWallet.encrypt("dummy-pass");
    const encKS = await encryptJSON(deviceKey, { keystore });
    const encCap = await encryptJSON(deviceKey, {
      capability: bundle.message,
      parentSig: bundle.parentSig,
    });

    await putKV(K_ENC_KEYSTORE, encKS);
    await putKV(K_ENC_CAP, encCap);

    return {
      success: true,
      safeAddress: safeWallet.address,
    };
  } catch (err) {
    console.error("[requestPosting] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
