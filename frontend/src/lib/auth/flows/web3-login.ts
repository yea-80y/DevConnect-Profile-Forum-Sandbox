/**
 * Simplified Web3 login flow (no signatures!)
 * Signatures are requested lazily when needed
 */

import { getAddress } from "ethers";
import type { Eip1193WithSelected } from "../types";
import { K_KIND, K_PARENT } from "../constants";
import { putKV } from "../storage/indexeddb";

/* ============================
 * Account Selection
 * ============================ */

async function chooseAccount(eth: Eip1193WithSelected): Promise<`0x${string}`> {
  // Try selectedAddress first (MetaMask)
  if (eth.selectedAddress) {
    return getAddress(eth.selectedAddress) as `0x${string}`;
  }

  // Request accounts
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No Ethereum account selected");
  }

  const chosen = accounts[0];
  if (!chosen) {
    throw new Error("No account returned from wallet");
  }

  return getAddress(chosen) as `0x${string}`;
}

/* ============================
 * Simplified Login
 * ============================ */

/**
 * Web3 login - just connect wallet (NO SIGNATURES!)
 * Signatures will be requested later when actually needed:
 * - Posting capability: when user tries to post
 * - POD identity: when user tries to create/claim PODs
 */
export async function startWeb3Login(): Promise<{
  success: boolean;
  parentAddress?: string;
  error?: string;
}> {
  try {
    const eth = (window as { ethereum?: Eip1193WithSelected }).ethereum;
    if (!eth) {
      return { success: false, error: "No wallet found" };
    }

    // Get parent address (main wallet)
    const parentAddr = await chooseAccount(eth);

    // Store kind marker (we're a web3 user)
    await putKV(K_KIND, "web3");

    // Store parent address (needed for lazy signature loading)
    await putKV(K_PARENT, parentAddr);

    return {
      success: true,
      parentAddress: parentAddr,
    };
  } catch (err) {
    console.error("[web3-login] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
