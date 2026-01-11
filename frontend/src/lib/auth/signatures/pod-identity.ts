/**
 * POD identity EIP-712 signature handling (deterministic)
 */

import { keccak256, toUtf8Bytes } from "ethers";
import type { Eip1193WithSelected, PodIdentityMessage, PodIdentityPayload, PodSeedData } from "../types";
import { POD_IDENTITY_DOMAIN, POD_IDENTITY_TYPES_WALLET, POD_IDENTITY_NONCE } from "../constants";

/* ============================
 * POD Identity (Deterministic)
 * ============================ */

/**
 * Request deterministic POD identity signature from user's wallet
 * Uses FIXED nonce to ensure same wallet → same signature → same POD key
 *
 * @param eth - Ethereum provider
 * @param parentAddress - User's Ethereum address
 * @returns Deterministic EIP-712 signature
 */
export async function requestPodIdentitySignature(
  eth: Eip1193WithSelected,
  parentAddress: string
): Promise<string> {
  const message: PodIdentityMessage = {
    purpose: "Derive deterministic POD signing identity",
    address: parentAddress,
    nonce: POD_IDENTITY_NONCE, // FIXED nonce ensures determinism!
  };

  const payload: PodIdentityPayload = {
    domain: POD_IDENTITY_DOMAIN,
    types: POD_IDENTITY_TYPES_WALLET,
    primaryType: "DerivePodIdentity",
    message,
  };

  const json = JSON.stringify(payload);

  return (await eth.request({
    method: "eth_signTypedData_v4",
    params: [parentAddress, json],
  })) as string;
}

/**
 * Derive POD seed from deterministic EIP-712 signature
 * Same wallet → same signature → same POD identity (cross-device)
 *
 * @param podIdentitySig - Deterministic EIP-712 signature for POD identity
 * @returns POD seed data
 */
export function derivePodSeedFromSignature(podIdentitySig: string): PodSeedData {
  const seed = keccak256(toUtf8Bytes(podIdentitySig));
  return {
    seed,
    derivedFrom: "eip712-signature",
  };
}
