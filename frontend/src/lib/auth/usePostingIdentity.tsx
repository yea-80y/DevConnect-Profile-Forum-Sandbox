"use client";

/**
 * usePostingIdentity Hook (Refactored - Modular)
 * Main orchestrator for authentication state
 *
 * Simplified from 1100+ lines to ~250 lines using modular architecture
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wallet, HDNodeWallet } from "ethers";
import type { UsePostingIdentity, AuthKind, PostAuth, EncryptedJSON, CapabilityBundle } from "./types";
import { K_ENC_KEYSTORE, K_ENC_CAP, K_POD_SEED, K_KIND, K_PARENT } from "./constants";
import { getKV, putKV, delKV } from "./storage/indexeddb";
import { ensureDeviceKey, encryptJSON, decryptJSON } from "./storage/encryption";
import { startWeb3Login } from "./flows/web3-login";
import { requestPostingCapability } from "./flows/request-posting";
import { requestPodIdentity } from "./flows/request-pod";
import { verifyCapabilityLocal, capabilityId } from "./signatures/verification";

/* ============================
 * Cookie & Session Helpers
 * ============================ */

function setSubjectCookie(subject: string) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  const sameSite = process.env.NODE_ENV === "production" ? "None" : "Lax";
  const secure = process.env.NODE_ENV === "production" ? "Secure;" : "";
  document.cookie = `woco_subject0x=${subject}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}; ${secure}`;
}

function clearSubjectCookie() {
  if (typeof document === "undefined") return;
  try {
    document.cookie = "woco_subject0x=; Path=/; Max-Age=0; SameSite=Lax";
  } catch {}
}

function getHost(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.host || "localhost";
}

/* ============================
 * Main Hook
 * ============================ */

export function usePostingIdentity(): UsePostingIdentity {
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<AuthKind>("none");
  const [postAuth, setPostAuth] = useState<PostAuth>("blocked");
  const [parent, setParent] = useState<string | undefined>();
  const [safe, setSafe] = useState<string | undefined>();
  const [capId, setCapId] = useState<string | undefined>();

  const postingWalletRef = useRef<Wallet | HDNodeWallet | null>(null);
  const signInFlightRef = useRef(false);

  /* ============================
   * Initialization - Restore Session
   * ============================ */

  useEffect(() => {
    const init = async () => {
      try {
        const savedKind = await getKV<AuthKind>(K_KIND);

        // Web3 user - restore session
        if (savedKind === "web3") {
          const deviceKey = await ensureDeviceKey();
          const encKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);
          const encCap = await getKV<EncryptedJSON>(K_ENC_CAP);

          if (encKS && encCap) {
            const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
            const tmpSafe = await Wallet.fromEncryptedJson(keystore, "dummy-pass");
            const { capability, parentSig } = await decryptJSON<{
              capability: any;
              parentSig: string;
            }>(deviceKey, encCap);

            const bundle = { message: capability, parentSig };
            const ok = verifyCapabilityLocal(bundle, tmpSafe.address, getHost());

            if (ok) {
              postingWalletRef.current = tmpSafe;
              const parentAddr = capability.parent;
              setSafe(tmpSafe.address);
              setParent(parentAddr);
              setCapId(capabilityId(bundle));
              setKind("web3");
              setPostAuth("parent-bound");
              setSubjectCookie(parentAddr);
              try {
                sessionStorage.setItem("woco.subject0x", parentAddr);
                localStorage.setItem("woco.subject0x", parentAddr);
              } catch {}
            } else {
              // Capability invalid - just restore parent address
              const parentAddr = capability.parent;
              setParent(parentAddr);
              setKind("web3");
              setPostAuth("blocked");
              setSubjectCookie(parentAddr);
              try {
                sessionStorage.setItem("woco.subject0x", parentAddr);
                localStorage.setItem("woco.subject0x", parentAddr);
              } catch {}
            }
          } else {
            // No capability yet - web3 user without posting capability (lazy loading)
            // Restore parent address from storage
            const savedParent = await getKV<string>(K_PARENT);
            if (savedParent) {
              setParent(savedParent);
              setSubjectCookie(savedParent);
              try {
                sessionStorage.setItem("woco.subject0x", savedParent);
                localStorage.setItem("woco.subject0x", savedParent);
              } catch {}
            }
            setKind("web3");
            setPostAuth("blocked");
          }
        }

        // Local user - restore session
        else if (savedKind === "local") {
          const deviceKey = await ensureDeviceKey();
          const encKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);

          if (encKS) {
            const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
            const tmpSafe = await Wallet.fromEncryptedJson(keystore, "dummy-pass");

            postingWalletRef.current = tmpSafe;
            setSafe(tmpSafe.address);
            setKind("local");
            setPostAuth("local-only");

            const addr = tmpSafe.address;
            setSubjectCookie(addr);
            try {
              sessionStorage.setItem("woco.subject0x", addr);
              localStorage.setItem("woco.subject0x", addr);
            } catch {}
          }
        }
      } catch (err) {
        console.error("[usePostingIdentity] Init failed:", err);
      } finally {
        setReady(true);
      }
    };

    init();
  }, []);

  /* ============================
   * Login Methods
   * ============================ */

  const startWeb3LoginHandler = useCallback(async (): Promise<boolean> => {
    if (signInFlightRef.current) return false;
    signInFlightRef.current = true;

    try {
      const result = await startWeb3Login();

      if (result.success && result.parentAddress) {
        setParent(result.parentAddress);
        setKind("web3");
        setPostAuth("blocked"); // Not authorized to post yet
        setReady(true);
        setSubjectCookie(result.parentAddress);
        try {
          sessionStorage.setItem("woco.subject0x", result.parentAddress);
          localStorage.setItem("woco.subject0x", result.parentAddress);
        } catch {}
        try { localStorage.removeItem("woco.isNewAccount"); } catch {}

        // Trigger immediate profile fetch so it's ready before dashboard loads
        setTimeout(() => {
          window.dispatchEvent(new Event("auth:changed"));
          // Also trigger profile load
          window.dispatchEvent(new Event("profile:load-requested"));
        }, 100); // Small delay to ensure state is committed

        return true;
      }

      return false;
    } catch (err) {
      console.error("[usePostingIdentity] Web3 login failed:", err);
      return false;
    } finally {
      signInFlightRef.current = false;
    }
  }, []);

  const startLocalLoginHandler = useCallback(async (): Promise<boolean> => {
    try {
      // Clear any existing web3 credentials
      await delKV(K_ENC_CAP);

      const deviceKey = await ensureDeviceKey();
      const wallet = Wallet.createRandom();
      const keystore = await wallet.encrypt("dummy-pass");
      const encKS = await encryptJSON(deviceKey, { keystore });

      await putKV(K_ENC_KEYSTORE, encKS);
      await putKV(K_KIND, "local");

      postingWalletRef.current = wallet;
      setSafe(wallet.address);
      setKind("local");
      setPostAuth("local-only");
      setReady(true);

      try {
        sessionStorage.setItem("woco.subject0x", wallet.address);
        localStorage.setItem("woco.subject0x", wallet.address);
      } catch {}
      window.dispatchEvent(new Event("auth:changed"));
      return true;
    } catch (err) {
      console.error("[usePostingIdentity] Local login failed:", err);
      return false;
    }
  }, []);

  /* ============================
   * Lazy Capability Requests
   * ============================ */

  const requestPostingCapabilityHandler = useCallback(async (): Promise<void> => {
    if (!parent) throw new Error("Not logged in");
    if (kind !== "web3") throw new Error("Only for web3 users");

    const result = await requestPostingCapability(parent);

    if (result.success && result.safeAddress) {
      // Reload posting wallet
      const deviceKey = await ensureDeviceKey();
      const encKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);
      if (encKS) {
        const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
        const wallet = await Wallet.fromEncryptedJson(keystore, "dummy-pass");
        postingWalletRef.current = wallet;
        setSafe(wallet.address);
        setPostAuth("parent-bound");
      }
    } else {
      throw new Error(result.error || "Failed to authorize posting");
    }
  }, [parent, kind]);

  const requestPodIdentityHandler = useCallback(async (): Promise<void> => {
    if (!parent) throw new Error("Not logged in");
    if (kind !== "web3") throw new Error("Only for web3 users");

    const result = await requestPodIdentity(parent);

    if (!result.success) {
      throw new Error(result.error || "Failed to generate POD identity");
    }
  }, [parent, kind]);

  /* ============================
   * Signing Operations
   * ============================ */

  const signPost = useCallback(
    async (payload: Uint8Array | string): Promise<string> => {
      const w = postingWalletRef.current;
      if (!w) throw new Error("No posting wallet");

      const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
      return await w.signMessage(bytes);
    },
    []
  );

  const getWalletForPOD = useCallback(async (): Promise<{
    privateKey?: string;
    seed?: string;
  } | null> => {
    // Web3 users: return POD seed (derived from EIP-712 signature)
    // Note: Web3 users don't need posting wallet for PODs, just the POD seed
    if (kind === "web3") {
      try {
        const deviceKey = await ensureDeviceKey();
        const encPodSeed = await getKV<EncryptedJSON>(K_POD_SEED);
        if (encPodSeed) {
          const podSeedData = await decryptJSON<{ seed: string }>(deviceKey, encPodSeed);
          return { seed: podSeedData.seed };
        }
        // No POD seed yet - caller should request it via requestPodIdentity()
        return null;
      } catch (e) {
        console.warn("[getWalletForPOD] Failed to load POD seed:", e);
        return null;
      }
    }

    // Local users: return private key from posting wallet
    const w = postingWalletRef.current;
    if (!w) return null;
    return { privateKey: w.privateKey };
  }, [kind]);

  const getCapabilityBundle = useCallback(async (): Promise<CapabilityBundle | null> => {
    // Only web3 users have capability bundles
    if (kind !== "web3") return null;

    try {
      const deviceKey = await ensureDeviceKey();
      const encCap = await getKV<EncryptedJSON>(K_ENC_CAP);

      if (!encCap) {
        console.warn("[getCapabilityBundle] No capability stored");
        return null;
      }

      const { capability, parentSig } = await decryptJSON<{
        capability: CapabilityBundle["message"];
        parentSig: string;
      }>(deviceKey, encCap);

      return { message: capability, parentSig };
    } catch (e) {
      console.error("[getCapabilityBundle] Failed to load capability:", e);
      return null;
    }
  }, [kind]);

  /* ============================
   * Logout
   * ============================ */

  const logout = useCallback(async (): Promise<void> => {
    await delKV(K_ENC_KEYSTORE);
    await delKV(K_ENC_CAP);
    await delKV(K_POD_SEED);
    await delKV(K_KIND);
    await delKV(K_PARENT);

    try {
      sessionStorage.removeItem("woco.subject0x");
      localStorage.removeItem("woco.subject0x");
    } catch {}
    clearSubjectCookie();

    // Clear profile cache (but preserve theme preference)
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key === 'woco.theme') return; // Preserve theme preference
        if (key.startsWith('profile:') || key.startsWith('woco.')) {
          localStorage.removeItem(key);
        }
      });
    } catch {}

    postingWalletRef.current = null;
    setSafe(undefined);
    setParent(undefined);
    setCapId(undefined);
    setKind("none");
    setPostAuth("blocked");

    window.dispatchEvent(new Event("auth:changed"));
  }, []);

  /* ============================
   * Legacy Methods (Deprecated)
   * ============================ */

  const signCapabilityNow = useCallback(async (): Promise<void> => {
    // Deprecated - use requestPostingCapability instead
    await requestPostingCapabilityHandler();
  }, [requestPostingCapabilityHandler]);

  const rotateSafe = useCallback(async (): Promise<void> => {
    // TODO: Implement safe rotation if needed
    console.warn("[rotateSafe] Not implemented in modular version");
  }, []);

  /* ============================
   * Return Hook API
   * ============================ */

  return useMemo<UsePostingIdentity>(
    () => ({
      ready,
      kind,
      postAuth,
      parent,
      safe,
      capId,
      startWeb3Login: startWeb3LoginHandler,
      startLocalLogin: startLocalLoginHandler,
      requestPostingCapability: requestPostingCapabilityHandler,
      requestPodIdentity: requestPodIdentityHandler,
      signCapabilityNow,
      rotateSafe,
      logout,
      signPost,
      getWalletForPOD,
      getCapabilityBundle,
    }),
    [
      ready,
      kind,
      postAuth,
      parent,
      safe,
      capId,
      startWeb3LoginHandler,
      startLocalLoginHandler,
      requestPostingCapabilityHandler,
      requestPodIdentityHandler,
      signCapabilityNow,
      rotateSafe,
      logout,
      signPost,
      getWalletForPOD,
      getCapabilityBundle,
    ]
  );
}

// Default export for backwards compatibility
export default usePostingIdentity;
