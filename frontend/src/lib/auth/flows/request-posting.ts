/**
 * Lazy posting capability request flow
 * Called when user attempts to post to forum
 */

import { verifyTypedData } from "ethers";
import type { Eip1193WithSelected, CapabilityBundle, EncryptedJSON } from "../types";
import { CAP_DOMAIN, CAP_TYPES, K_ENC_KEYSTORE, K_ENC_CAP } from "../constants";
import { getKV, putKV, delKV } from "../storage/indexeddb";
import { ensureDeviceKey, encryptJSON, decryptJSON } from "../storage/encryption";
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
    // Check if capability already exists AND matches current parent
    const existingCap = await getKV<EncryptedJSON>(K_ENC_CAP);
    if (existingCap) {
      // Verify existing capability matches the current parent
      try {
        const deviceKey = await ensureDeviceKey();
        const { capability } = await decryptJSON<{
          capability: { parent: string; safe: string };
        }>(deviceKey, existingCap);

        // If the capability parent matches current parent, use existing
        if (capability.parent.toLowerCase() === parentAddress.toLowerCase()) {
          // Also verify we have the matching keystore
          const existingKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);
          if (existingKS) {
            const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, existingKS);
            const wallet = await import("ethers").then(m => m.Wallet.fromEncryptedJson(keystore, "dummy-pass"));

            // Verify the keystore matches the capability's safe address
            if (wallet.address.toLowerCase() === capability.safe.toLowerCase()) {
              console.log("[requestPosting] Existing capability is valid for current parent");
              return { success: true, safeAddress: wallet.address };
            }
          }
        }

        // Capability doesn't match - clear old data and request new
        console.log("[requestPosting] Existing capability is for different parent, clearing...");
        await delKV(K_ENC_CAP);
        await delKV(K_ENC_KEYSTORE);
      } catch (decryptErr) {
        console.warn("[requestPosting] Failed to verify existing capability:", decryptErr);
        // Clear corrupted data
        await delKV(K_ENC_CAP);
        await delKV(K_ENC_KEYSTORE);
      }
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
