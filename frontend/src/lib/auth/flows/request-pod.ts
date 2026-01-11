/**
 * Lazy POD identity request flow
 * Called when user attempts to create/claim POD collectibles
 */

import type { Eip1193WithSelected } from "../types";
import { K_POD_SEED } from "../constants";
import { getKV, putKV } from "../storage/indexeddb";
import { ensureDeviceKey, encryptJSON } from "../storage/encryption";
import {
  requestPodIdentitySignature,
  derivePodSeedFromSignature,
} from "../signatures/pod-identity";

/* ============================
 * Lazy POD Identity
 * ============================ */

/**
 * Request POD identity from user
 * Shows MetaMask prompt to generate deterministic POD key
 */
export async function requestPodIdentity(
  parentAddress: string
): Promise<{
  success: boolean;
  podSeed?: string;
  error?: string;
}> {
  try {
    // Check if POD identity already exists
    const existingPodSeed = await getKV(K_POD_SEED);
    if (existingPodSeed) {
      console.log("[requestPod] POD identity already exists");
      return { success: true }; // Already setup
    }

    const eth = (window as { ethereum?: Eip1193WithSelected }).ethereum;
    if (!eth) {
      return { success: false, error: "No wallet found" };
    }

    // Request deterministic POD identity signature
    const podIdentitySig = await requestPodIdentitySignature(eth, parentAddress);

    // Derive POD seed from signature
    const podSeedData = derivePodSeedFromSignature(podIdentitySig);

    // Encrypt and store
    const deviceKey = await ensureDeviceKey();
    const encPodSeed = await encryptJSON(deviceKey, podSeedData);
    await putKV(K_POD_SEED, encPodSeed);

    return {
      success: true,
      podSeed: podSeedData.seed,
    };
  } catch (err) {
    console.error("[requestPod] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
