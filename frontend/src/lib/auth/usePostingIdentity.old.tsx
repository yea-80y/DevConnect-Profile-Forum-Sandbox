"use client";

/**
 * usePostingIdentity.tsx
 * ------------------------------------------
 * One React hook that manages your posting identity.
 * - Local users: generate & store a local posting key (no capability).
 * - Web3 users: require an EIP-712 "AuthorizeSafeSigner" capability to post.
 * - Stores both the keystore and the capability bundle encrypted with a
 *   device-bound AES-GCM key in IndexedDB; rehydrates silently on the same device.
 * - Verifies capability (host, purpose, expiry, safeProof, parent recovery).
 *
 * Exposed API:
 *  - ready: boolean            -> hydrate complete
 *  - kind: "web3" | "local" | "none"
 *  - postAuth: "parent-bound" | "local-only" | "blocked"
 *  - parent?: string           -> parent wallet (web3)
 *  - safe?: string             -> posting address
 *  - capId?: string            -> keccak256(capability JSON), future-proofing
 *  - startWeb3Login(): Promise<void>
 *  - startLocalLogin(): Promise<void>
 *  - signCapabilityNow?(): Promise<void>  -> (web3 only) re/authorize
 *  - rotateSafe(): Promise<void>          -> new safe key (+cap if web3)
 *  - logout(): Promise<void>
 *  - signPost(payload): Promise<string>   -> signs with safe key
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Ethers v6 — runtime values only
import {
  Wallet,
  HDNodeWallet,
  keccak256,
  toUtf8Bytes,
  verifyMessage,
  verifyTypedData,
  ZeroHash,
  getAddress,
} from "ethers";

// Ethers v6 — types only (keeps TS happy and tree small)
import type { Eip1193Provider, TypedDataDomain, TypedDataField } from "ethers";

// Stable host snapshot for this session (includes port in dev)****



/**
 * Ask the wallet to (re)select accounts, then return the address we should use.
 * - Tries 'wallet_requestPermissions' first (MetaMask, Rabby), which opens the account picker.
 * - Falls back to 'eth_requestAccounts' if already connected / not supported.
 * - If 'selectedAddress' exists and is connected, prefer it; otherwise use the first connected.
 */
// types (needs Eip1193Provider type already imported)
type Eip1193WithSelected = Eip1193Provider & { selectedAddress?: string };

// Typed event-capable provider (no `any`)
interface Eip1193WithEvents extends Eip1193WithSelected {
  on?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  on?(event: "chainChanged",   listener: (hexChainId: string) => void): void;
  off?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  off?(event: "chainChanged",   listener: (hexChainId: string) => void): void;
  removeListener?(
    event: "accountsChanged", listener: (accounts: string[]) => void
  ): void;
  removeListener?(
    event: "chainChanged",   listener: (hexChainId: string) => void
  ): void;
}

// Narrow helper so we only use events when available
function asEventProvider(p?: Eip1193Provider): Eip1193WithEvents | undefined {
  const cand = p as unknown as Eip1193WithEvents | undefined;
  if (!cand) return undefined;
  const hasOn  = typeof cand.on  === "function";
  const hasOff = typeof cand.off === "function" || typeof cand.removeListener === "function";
  return hasOn && hasOff ? cand : undefined;
}

/** Let user pick the wallet account (avoid double prompts). */
async function chooseAccount(eth: Eip1193WithSelected): Promise<`0x${string}`> {
  // Ask for connected accounts (will prompt if not already connected)
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("No accounts authorized");

  // Prefer wallet's selectedAddress if it’s one of the connected accounts
  const selected = typeof eth.selectedAddress === "string" ? eth.selectedAddress : undefined;
  const normalized = accounts.map(a => a.toLowerCase());
  const chosen = selected && normalized.includes(selected.toLowerCase()) ? selected : accounts[0];

  return getAddress(chosen) as `0x${string}`;
}


// Canonical UUID type (what TS's lib.dom uses for randomUUID)
type UUID = `${string}-${string}-${string}-${string}-${string}`;

/** Generate a RFC 4122 v4 UUID using WebCrypto (for environments without crypto.randomUUID). */
function generateUUIDv4(): UUID {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // Per RFC 4122: set version (4) and variant (10xxxxxx)
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;

  const hex = Array.from(buf, b => b.toString(16).padStart(2, "0"));
  const uuid = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  return uuid as UUID;
}

/** Fully client-side nonce + timestamp (prefers crypto.randomUUID, falls back to v4 generator). */
function makeNonceAndIssuedAt() {
  const uuid = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : generateUUIDv4();
  const issuedAt = new Date().toISOString();
  return { nonce: uuid, issuedAt };
}

// Let TypeScript know MetaMask injects `window.ethereum`
declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

function getHost(): string {
  return (typeof window !== "undefined" && window.location) ? window.location.host : "";
}

// One-time redirect to dashboard *from the login route only*.
// Guarded with sessionStorage so it never double-navigates.
// One-time redirect to dashboard from the login route only.****


// --- ADD: cookie helpers so SSR sees the subject on first dashboard render ---
function setSubjectCookie(addr: string) {
  try {
    const ttl = 60 * 60 * 24 * 30; // 30 days
    document.cookie = `woco_subject0x=${addr}; Path=/; Max-Age=${ttl}; SameSite=Lax`;
  } catch {}
}

function clearSubjectCookie() {
  try {
    document.cookie = "woco_subject0x=; Path=/; Max-Age=0; SameSite=Lax";
  } catch {}
}

/* ============================
 * Types & constants
 * ============================ */

type PostAuth = "parent-bound" | "local-only" | "blocked";
type AuthKind = "web3" | "local" | "none";

export interface UsePostingIdentity {
  ready: boolean;
  kind: AuthKind;
  postAuth: PostAuth;
  parent?: string;
  safe?: string;
  capId?: string;
  startWeb3Login: () => Promise<boolean>;
  startLocalLogin: () => Promise<boolean>;
  requestPostingCapability: () => Promise<void>; // Lazy: request posting capability when needed
  requestPodIdentity: () => Promise<void>; // Lazy: request POD identity when needed
  signCapabilityNow?: () => Promise<void>; // only when kind === "web3" (deprecated - use requestPostingCapability)
  rotateSafe: () => Promise<void>;
  logout: () => Promise<void>;
  signPost: (payload: Uint8Array | string) => Promise<string>;
  getWalletForPOD: () => Promise<{ privateKey?: string; seed?: string } | null>; // Access wallet or seed for POD signing
}

/** The EIP-712 domain for posting capability (chain-agnostic by design). */
const CAP_DOMAIN: TypedDataDomain = { name: "WoCo Capability", version: "1" };

/**
 * TypedData definition must be MUTABLE arrays in ethers v6.
 * If you mark this `as const`, verifyTypedData will complain that
 * the arrays are readonly. Keep them as normal arrays.
 */
/**
 * Lean types for local verification – DO NOT include EIP712Domain here.
 * Keeping this stable avoids wallet-specific quirks during verification.
 */
const CAP_TYPES: Record<string, TypedDataField[]> = {
  AuthorizeSafeSigner: [
    { name: "host", type: "string" },
    { name: "parent", type: "address" },
    { name: "safe", type: "address" },
    { name: "purpose", type: "string" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "string" },
    { name: "expiresAt", type: "string" },
    { name: "safeProof", type: "bytes" }, // safe signs `${host}:${nonce}`
    { name: "clientCodeHash", type: "bytes32" },
    { name: "statement", type: "string" },
  ],
};

/**
 * Extra types ONLY for wallet prompts; some wallets expect EIP712Domain declared.
 * We keep this separate so local verify stays lean and predictable.
 */
const CAP_TYPES_WALLET: Record<string, TypedDataField[]> = {
  ...CAP_TYPES,
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    // intentionally omit chainId/verifyingContract to remain off-chain
  ],
};

/* ============================
 * POD Identity Derivation (Deterministic EIP-712)
 * ============================ */

/** Separate domain for POD identity derivation (domain separation from posting capability) */
const POD_IDENTITY_DOMAIN: TypedDataDomain = {
  name: "WoCo POD Identity",
  version: "1"
};

/** Fixed nonce for deterministic POD identity (same wallet → same signature → same POD key) */
const POD_IDENTITY_NONCE = "WOCO-POD-IDENTITY-V1" as const;

/** Message type for deterministic POD identity derivation */
const POD_IDENTITY_TYPES: Record<string, TypedDataField[]> = {
  DerivePodIdentity: [
    { name: "purpose", type: "string" },
    { name: "address", type: "address" },
    { name: "nonce", type: "string" },
  ],
};

/** Wallet-friendly version with EIP712Domain */
const POD_IDENTITY_TYPES_WALLET: Record<string, TypedDataField[]> = {
  ...POD_IDENTITY_TYPES,
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
  ],
};

/** POD identity message structure */
interface PodIdentityMessage {
  purpose: string;
  address: string;
  nonce: string;
}

/** Payload for POD identity signature */
type PodIdentityPayload = {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: "DerivePodIdentity";
  message: PodIdentityMessage;
};

const PURPOSE_DEFAULT = "forum-posting" as const;

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

/** Capability bundle = message + the parentSig that authorized it. */
export interface CapabilityBundle {
  message: CapabilityMessage;
  parentSig: string; // 0x...
}

/** POD seed derived from parentSig - ties POD identity to MetaMask wallet */
interface PodSeedData {
  seed: string; // hex string derived from parentSig
  derivedFrom: "eip712-signature"; // Track how it was derived
}

/** Payload shape we send to eth_signTypedData_v4. */
type CapabilityPayload = {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: "AuthorizeSafeSigner";
  message: CapabilityMessage;
};

/* IndexedDB config */
const STORAGE_DB = "woco-auth";
const OS_KV = "kv";

/* Keys (names) used in IndexedDB */
const K_DEVICE_KEY = "woco:deviceKey"; // CryptoKey (non-extractable)
const K_ENC_KEYSTORE = "woco:encKeystore"; // { iv, ct }
const K_ENC_CAP = "woco:encCap"; // { iv, ct }
const K_POD_SEED = "woco:podSeed"; // POD seed derived from EIP-712 signature
const K_KIND = "woco:kind"; // "web3" | "local"

/* API endpoint for server nonce** */


/* ============================
 * IndexedDB minimal KV
 * ============================ */

/** Open (or create) the tiny IDB store. */
function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OS_KV)) req.result.createObjectStore(OS_KV);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("IndexedDB open error"));
  });
}

async function putKV(key: string, val: unknown): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(OS_KV, "readwrite");
    tx.objectStore(OS_KV).put(val, key); // no `as any`
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("IDB put error"));
  });
}
async function getKV<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return await new Promise<T | undefined>((res, rej) => {
    const tx = db.transaction(OS_KV, "readonly");
    const r = tx.objectStore(OS_KV).get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error ?? new Error("IDB get error"));
  });
}
async function delKV(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(OS_KV, "readwrite");
    tx.objectStore(OS_KV).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("IDB delete error"));
  });
}

/* ============================
 * WebCrypto AES-GCM helpers
 * ============================ */

interface EncryptedJSON {
  iv: string; // hex 0x...
  ct: string; // hex 0x...
}

/** Force a Uint8Array onto a plain ArrayBuffer (not SharedArrayBuffer). */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

/** Ensure we have a device-bound AES-GCM key stored in IndexedDB. */
async function ensureDeviceKey(): Promise<CryptoKey> {
  const existing = await getKV<CryptoKey>(K_DEVICE_KEY);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  await putKV(K_DEVICE_KEY, key);
  return key;
}

function hexToU8(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function u8ToHex(u: Uint8Array): string {
  return "0x" + Array.from(u).map(b => b.toString(16).padStart(2, "0")).join("");
}

// AES-GCM encrypt arbitrary JSON (returns hex strings).
async function encryptJSON<T>(key: CryptoKey, obj: T): Promise<EncryptedJSON> {
  const ivU8 = new Uint8Array(12);
  crypto.getRandomValues(ivU8);

  const iv = toArrayBuffer(ivU8); // <-- plain ArrayBuffer for AES-GCM param
  const dataU8 = new TextEncoder().encode(JSON.stringify(obj));
  const data = toArrayBuffer(dataU8); // <-- plain ArrayBuffer for payload

  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: u8ToHex(ivU8), ct: u8ToHex(new Uint8Array(ct)) };
}

// AES-GCM decrypt to JSON.
async function decryptJSON<T>(key: CryptoKey, enc: EncryptedJSON): Promise<T> {
  const ivU8 = hexToU8(enc.iv);
  const ctU8 = hexToU8(enc.ct);

  const iv = toArrayBuffer(ivU8); // <-- plain ArrayBuffer
  const ct = toArrayBuffer(ctU8); // <-- plain ArrayBuffer

  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/* ============================
 * Capability helpers
 * ============================ */

/** Build the capability message to be typed-signed by the parent wallet. */
function buildCapabilityMessage(params: {
  host: string;
  parent: string;
  safe: string;
  purpose?: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  safeProof: string; // hex signature by safe key over `${host}:${nonce}`
  clientCodeHash?: string; // bytes32
  statement?: string;
}): CapabilityMessage {
  return {
    host: params.host,
    parent: getAddress(params.parent),
    safe: getAddress(params.safe),
    purpose: params.purpose ?? PURPOSE_DEFAULT,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
    safeProof: params.safeProof,
    clientCodeHash: params.clientCodeHash ?? ZeroHash,
    statement: params.statement ?? `Authorize ${params.safe} for posting at ${params.host}`,
  };
}

/** Ask MetaMask to sign EIP-712 v4 over our payload. */
async function signTypedDataV4(
  eth: Eip1193Provider,
  address: string,
  payload: CapabilityPayload
): Promise<string> {
  const json = JSON.stringify(payload);
  console.debug("[712] request v4 once");
    // Most wallets (MetaMask etc.) expect [address, JSON-stringified payload]
    return (await eth.request({
      method: "eth_signTypedData_v4",
      params: [address, json],
    })) as string;
  }

/**
 * Request deterministic POD identity signature from user's wallet
 * Uses FIXED nonce to ensure same wallet → same signature → same POD key
 *
 * @param eth - Ethereum provider (window.ethereum)
 * @param parentAddress - User's Ethereum address
 * @returns Deterministic EIP-712 signature
 */
async function requestPodIdentitySignature(
  eth: Eip1193WithSelected,
  parentAddress: string
): Promise<string> {
  const message: PodIdentityMessage = {
    purpose: "Derive deterministic POD signing identity",
    address: parentAddress,
    nonce: POD_IDENTITY_NONCE, // FIXED nonce ensures determinism
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
 * Uses a SEPARATE signature from the posting capability (different domain + fixed nonce)
 * This ensures: same wallet → same signature → same POD identity (cross-device)
 *
 * @param podIdentitySig - Deterministic EIP-712 signature for POD identity
 * @returns POD seed data
 */
function derivePodSeedFromSignature(podIdentitySig: string): PodSeedData {
  // Hash the signature to create deterministic seed
  const seed = keccak256(toUtf8Bytes(podIdentitySig));
  return {
    seed,
    derivedFrom: "eip712-signature",
  };
}

/** Content-addressed identifier of the capability (JSON keccak). */
function capabilityId(input: CapabilityBundle | CapabilityMessage): string {
  const json = "message" in (input as CapabilityBundle) ? JSON.stringify((input as CapabilityBundle).message) : JSON.stringify(input);
  return keccak256(toUtf8Bytes(json));
}

/** Verify capability locally (expiry, host, safeProof, parent recovery, purpose) with precise debug. */
function verifyCapabilityLocal(
  bundle: CapabilityBundle,
  expectedSafe: string,
  expectedHost: string
): boolean {
  try {
    const cap = bundle.message;

    // (1) expiry
    const now = Date.now();
    const exp = new Date(cap.expiresAt).getTime();
    if (!(exp > now)) {
      console.debug("[cap][fail] expiry", { expiresAt: cap.expiresAt, nowISO: new Date(now).toISOString() });
      return false;
    }

    // (2) host scope
    if (cap.host !== expectedHost) {
      console.debug("[cap][fail] host", { capHost: cap.host, expectedHost });
      return false;
    }

    // (3) safe matches
    if (cap.safe.toLowerCase() !== expectedSafe.toLowerCase()) {
      console.debug("[cap][fail] safe", { capSafe: cap.safe, expectedSafe });
      return false;
    }

    // (4) safeProof possession
    const challenge = `${cap.host}:${cap.nonce}`;
    let recSafe: string;
    try {
      recSafe = verifyMessage(challenge, cap.safeProof);
    } catch (e) {
      console.debug("[cap][fail] safeProof:badSigFormat", e);
      return false;
    }
    if (recSafe.toLowerCase() !== cap.safe.toLowerCase()) {
      console.debug("[cap][fail] safeProof:mismatch", { recSafe, capSafe: cap.safe, challenge });
      return false;
    }

    // (5) parent typed-signature recovers the stated parent
    let recoveredParent: string;
    try {
      recoveredParent = verifyTypedData(CAP_DOMAIN, CAP_TYPES, cap, bundle.parentSig);
    } catch (e) {
      console.debug("[cap][fail] parentSig:bad712", e);
      return false;
    }
    if (recoveredParent.toLowerCase() !== cap.parent.toLowerCase()) {
      console.debug("[cap][fail] parentSig:mismatch", { recoveredParent, capParent: cap.parent });
      return false;
    }

    // (6) purpose
    if (cap.purpose !== PURPOSE_DEFAULT) {
      console.debug("[cap][fail] purpose", { capPurpose: cap.purpose, expected: PURPOSE_DEFAULT });
      return false;
    }

    console.debug("[cap][ok]");
    return true;
  } catch (e) {
    console.debug("[cap][error] unexpected", e);
    return false;
  }
}

/* ============================
 * Main hook
 * ============================ */

export default function usePostingIdentity(): UsePostingIdentity {
  const [ready, setReady] = useState<boolean>(false);
  const [kind, setKind] = useState<AuthKind>("none");
  const [postAuth, setPostAuth] = useState<PostAuth>("blocked");
  const [parent, setParent] = useState<string | undefined>(undefined);
  const [safe, setSafe] = useState<string | undefined>(undefined);
  const [capId, setCapId] = useState<string | undefined>(undefined);

  // In ethers v6, createRandom() returns HDNodeWallet; fromEncryptedJson returns Wallet.
  const postingWalletRef = useRef<HDNodeWallet | Wallet | null>(null);

  // [OPTIONAL] track last seen chain id (also silences unused-param lint in onChainChanged)
  const chainIdRef = useRef<string | null>(null);

  /** 🚦 One-shot guard to prevent two concurrent sign flows (double click / re-render). */
  const signInFlightRef = useRef(false);

  // Rehydration version - increments when auth:changed event fires
  const [rehydrateVersion, setRehydrateVersion] = useState(0);

  // Listen for auth:changed events and trigger re-rehydration
  useEffect(() => {
    const onAuthChanged = () => {
      setRehydrateVersion(v => v + 1);
    };

    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, []);

  // Rehydrate on mount AND when auth:changed event fires (via rehydrateVersion)
  useEffect(() => {
    (async () => {
      try {
        const savedKind = await getKV<AuthKind>(K_KIND);
        const deviceKey = await ensureDeviceKey();
        const encKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);
        const encCap = await getKV<EncryptedJSON>(K_ENC_CAP);

        if (!savedKind || !encKS) {
          setKind("none");
          setPostAuth("blocked");
          setReady(true);
          return;
        }

        // 1) Decrypt the off-chain keystore; unlock the safe signer
        const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
        const wallet = await Wallet.fromEncryptedJson(keystore, "dummy-pass");
        postingWalletRef.current = wallet;
        setSafe(wallet.address);

        if (savedKind === "local") {
          setKind("local");
          setPostAuth("local-only");
          try { sessionStorage.setItem("woco.subject0x", wallet.address); } catch {}
          setReady(true);
          return;
        }

        // 2) For web3 sessions, we also require a valid capability
        if (!encCap) {
          setKind("web3");
          setPostAuth("blocked");
          setReady(true);
          return;
        }

        const { capability, parentSig } = await decryptJSON<{ capability: CapabilityMessage; parentSig: string }>(deviceKey, encCap);
        const bundle: CapabilityBundle = { message: capability, parentSig };

        // Always reflect the parent in the UI (subject = parent for web3)
        setKind("web3");

        // [PATCH] Verify, then recover the actual signer for display.
        const ok = verifyCapabilityLocal(bundle, wallet.address, getHost());
        setCapId(capabilityId(bundle));

        if (ok) {
          const parent0x = getAddress(bundle.message.parent);
          setParent(parent0x);
          setPostAuth("parent-bound");
          // seed subject with PARENT
          try { sessionStorage.setItem("woco.subject0x", parent0x); } catch {}
        } else {
          setParent(undefined);
          setPostAuth("blocked");
          // clear subject seed if we can't post yet
          try { sessionStorage.removeItem("woco.subject0x"); } catch {}
        }

        setReady(true);
      } catch (e) {
        console.warn("rehydrate failed", e);
        setKind("none");
        setPostAuth("blocked");
        setReady(true);
      }
    })();
  }, [rehydrateVersion]);

  /** Sign arbitrary payload with the posting key (safe signer). */
  const signPost = useCallback<UsePostingIdentity["signPost"]>(async (payload) => {
    const w = postingWalletRef.current;
    if (!w) throw new Error("Posting key not unlocked");
    const data = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
    return await w.signMessage(data);
  }, []);

  /** Get wallet private key or seed for POD signing (only when user is logged in). */
  const getWalletForPOD = useCallback<UsePostingIdentity["getWalletForPOD"]>(async () => {
    const w = postingWalletRef.current;
    if (!w) return null;

    // For web3 users: return POD seed derived from EIP-712 signature
    if (kind === "web3") {
      try {
        const deviceKey = await ensureDeviceKey();
        const encPodSeed = await getKV<EncryptedJSON>(K_POD_SEED);
        if (encPodSeed) {
          const podSeedData = await decryptJSON<PodSeedData>(deviceKey, encPodSeed);
          return { seed: podSeedData.seed };
        }
      } catch (e) {
        console.warn("[getWalletForPOD] Failed to load POD seed for web3 user", e);
      }
    }

    // For local users: return private key
    return { privateKey: w.privateKey };
  }, [kind]);

  /** Local login: generate a local identity (no capability). */
  const startLocalLogin = useCallback<UsePostingIdentity["startLocalLogin"]>(async () => {
    // ✅ CRITICAL: Clear any existing Web3 credentials first
    // This prevents old Web3 data from persisting when creating a new local account
    try {
      await delKV(K_ENC_CAP); // Remove Web3 capability if it exists
    } catch {}

    const deviceKey = await ensureDeviceKey();
    const wallet = Wallet.createRandom();

    const keystore = await wallet.encrypt("dummy-pass");
    const encKS = await encryptJSON(deviceKey, { keystore });

    await putKV(K_ENC_KEYSTORE, encKS);
    await putKV(K_KIND, "local");

    postingWalletRef.current = wallet;
    setSafe(wallet.address);
    // seed subject for first render of /dashboard
    try { sessionStorage.setItem("woco.subject0x", wallet.address); } catch {}
    setKind("local");
    setParent(undefined);
    setCapId(undefined);
    setPostAuth("local-only");
    setReady(true);

    // ✅ CRITICAL: Clear old subject from localStorage to prevent contamination
    // The dashboard reads from localStorage, so we must clear old Web3 addresses
    try { localStorage.removeItem("woco.subject0x"); } catch {}

    // ✅ CRITICAL: Clear ALL cached profile data to prevent showing old Web3 profile
    // This ensures the new local account shows a blank profile, not cached Web3 data
    try {
      const keys = Object.keys(localStorage);
      const profileKeys = keys.filter(k => k.startsWith('profile:'));
      profileKeys.forEach(key => {
        localStorage.removeItem(key);
      });
    } catch {}

    // ✅ OPTIMIZATION: Mark as new account (local accounts are ALWAYS freshly generated)
    // Since this is a brand new crypto wallet that never existed before,
    // there's NO possibility of an existing profile on Swarm
    // This flag tells ProfileProvider to skip the initial Swarm fetch
    try { localStorage.setItem("woco.isNewAccount", "true"); } catch {}

    // ✅ CRITICAL: Emit auth:changed event so other usePostingIdentity instances re-rehydrate
    window.dispatchEvent(new CustomEvent("auth:changed"));

    // ✅ NEW: report success
    return true;
  }, []);


 /** Web3 login: require an EIP-712 capability to enable posting. */
const startWeb3Login = useCallback<UsePostingIdentity["startWeb3Login"]>(async () => {
  // 🚦 Prevent overlapping sign flows (double click / React dev re-render)
  if (signInFlightRef.current) return false;
  signInFlightRef.current = true;
  
  // 🔁 EARLY RETURN: if we already have a valid web3 capability, reuse it (don’t rotate the safe)
  try {
    const deviceKey = await ensureDeviceKey();
    const encKS  = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);
    const encCap = await getKV<EncryptedJSON>(K_ENC_CAP);
    const savedKind = await getKV<AuthKind>(K_KIND);

    if (savedKind === "web3" && encKS && encCap) {
      const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
      const tmpSafe = await Wallet.fromEncryptedJson(keystore, "dummy-pass");

      const { capability, parentSig } =
        await decryptJSON<{ capability: CapabilityMessage; parentSig: string }>(deviceKey, encCap);
      const bundle: CapabilityBundle = { message: capability, parentSig };

      const ok = verifyCapabilityLocal(bundle, tmpSafe.address, getHost())
      if (ok) {
        postingWalletRef.current = tmpSafe;
        const parent0x = getAddress(bundle.message.parent);
        setSafe(tmpSafe.address);
        setParent(parent0x);
        setCapId(capabilityId(bundle));
        setKind("web3");
        setPostAuth("parent-bound");
        setReady(true);

        // --- ADD: cookie for SSR ---
        setSubjectCookie(parent0x);
        try { sessionStorage.setItem("woco.subject0x", parent0x); } catch {}

        // ✅ CRITICAL: Clear old cached subject from localStorage
        try { localStorage.removeItem("woco.subject0x"); } catch {}

        // ✅ CRITICAL: Clear isNewAccount flag for Web3 users
        // This flag is only for local accounts - Web3 accounts should always fetch their profile
        try { localStorage.removeItem("woco.isNewAccount"); } catch {}

        signInFlightRef.current = false;
        return true; // ✅ already good; no new sign needed
      }
    }
  } catch {
    // ignore and continue to fresh login flow
  }

  let result = false;
  try {
    // 1) Get provider + user’s chosen parent account
    const eth = window.ethereum as Eip1193WithSelected | undefined;
    if (!eth) throw new Error("No wallet found");
    const parentAddr = await chooseAccount(eth);

    // 2) Create a fresh posting key (“safe”) and build the capability message
    const safeWallet = Wallet.createRandom();
    const { nonce, issuedAt } = makeNonceAndIssuedAt();
    const host = getHost();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(); // 1 year
    const safeProof = await safeWallet.signMessage(`${host}:${nonce}`);

    const capMsg = buildCapabilityMessage({
      host,
      parent: parentAddr,
      safe: safeWallet.address,
      nonce,
      issuedAt,
      expiresAt,
      safeProof,
      statement: `Authorize ${safeWallet.address} as posting key for ${host}`,
    });

    // 3) Prepare the exact EIP-712 payload (off-chain domain)
    const payload: CapabilityPayload = {
      domain: CAP_DOMAIN,
      types: CAP_TYPES_WALLET,
      primaryType: "AuthorizeSafeSigner",
      message: capMsg,
    };

    // 4a) Request deterministic POD identity signature (SEPARATE from posting capability)
    // This uses a FIXED nonce to ensure same wallet → same signature → same POD key
    const podIdentitySig = await requestPodIdentitySignature(eth, parentAddr);

    // 4b) Ask the wallet to sign posting capability (uses random nonce for security)
    const parentSig = await signTypedDataV4(eth, parentAddr, payload);

    // 5) Hard-verify capability signature BEFORE touching storage/state
    const recovered = verifyTypedData(CAP_DOMAIN, CAP_TYPES, capMsg, parentSig);
    if (recovered.toLowerCase() !== parentAddr.toLowerCase()) {
      throw new Error(`712 mismatch: recovered ${recovered} vs selected ${parentAddr}`);
    }

    // 6) Persist encrypted artifacts (posting keystore + capability bundle + POD seed)
    const bundle: CapabilityBundle = { message: capMsg, parentSig };
    const deviceKey = await ensureDeviceKey();
    const keystore = await safeWallet.encrypt("dummy-pass");
    const encKS = await encryptJSON(deviceKey, { keystore });
    const encCap = await encryptJSON(deviceKey, { capability: bundle.message, parentSig: bundle.parentSig });

    // Derive POD seed from deterministic POD identity signature (NOT posting capability)
    // Same wallet → same podIdentitySig → same POD key (cross-device reproducible!)
    const podSeedData = derivePodSeedFromSignature(podIdentitySig);
    const encPodSeed = await encryptJSON(deviceKey, podSeedData);

    await putKV(K_ENC_KEYSTORE, encKS);
    await putKV(K_ENC_CAP, encCap);
    await putKV(K_POD_SEED, encPodSeed);
    await putKV(K_KIND, "web3");

    // 7) Update in-memory state and gate posting
    postingWalletRef.current = safeWallet;
    setSafe(safeWallet.address);
    setParent(parentAddr);
    try { sessionStorage.setItem("woco.subject0x", parentAddr); } catch {}
    setCapId(capabilityId(bundle));

    const ok = verifyCapabilityLocal(bundle, safeWallet.address, getHost());

    // --- ADD: publish subject for SSR before we navigate ---
    if (ok) {
      setSubjectCookie(parentAddr);
      try { sessionStorage.setItem("woco.subject0x", parentAddr); } catch {}
    }
    // 🔍 QUICK SANITY LOG
    console.debug("[login] verify result", {
    ok,
    hostSigned: capMsg.host,
    hostVerify: getHost(),
    safe: safeWallet.address,
    parent: parentAddr,
    });

    setKind("web3");
    setPostAuth(ok ? "parent-bound" : "blocked");
    setReady(true);

    // ✅ CRITICAL: Clear old cached subject from localStorage
    try { localStorage.removeItem("woco.subject0x"); } catch {}

    // ✅ CRITICAL: Clear isNewAccount flag for Web3 users
    // This flag is only for local accounts - Web3 accounts should always fetch their profile
    try { localStorage.removeItem("woco.isNewAccount"); } catch {}

    // ✅ CRITICAL: Emit auth:changed event so other usePostingIdentity instances re-rehydrate
    // This ensures ClientProviders picks up the new credentials after Web3 login
    if (ok) {
      window.dispatchEvent(new CustomEvent("auth:changed"));
    }

    result = ok;
  } catch {
    result = false;
  } finally {
    signInFlightRef.current = false;
  }
  return result; // boolean result your LoginScreen uses
}, []);

  // Re/authorize a capability for the current (or new) safe signer.
// - Binds the EIP-712 signature to the same provider that supplied parentAddr
// - Hard-fails if the recovered signer doesn't match the selected account
const signCapabilityNow = useCallback<NonNullable<UsePostingIdentity["signCapabilityNow"]>>(async () => {
if (kind !== "web3") return;

// ✅ NEW: if we already have a valid capability, do nothing
if (postAuth === "parent-bound") return;

// 🚦 Prevent overlap with any other sign flow
if (signInFlightRef.current) return;
signInFlightRef.current = true;

try {
    // 1) Use the injected provider we will also use for signing
    const eth = window.ethereum as Eip1193WithSelected | undefined;
    if (!eth) throw new Error("No wallet found");

    // 2) Ask wallet which account to treat as the parent
    const parentAddr = await chooseAccount(eth);

    // 3) Reuse the existing safe; if not in memory, rehydrate it from storage
    let safeWallet = postingWalletRef.current;
    if (!safeWallet) {
      const deviceKey = await ensureDeviceKey();
      const encKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);
      if (!encKS) throw new Error("Posting key not found. Please login again.");
      const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
      safeWallet = await Wallet.fromEncryptedJson(keystore, "dummy-pass");
      postingWalletRef.current = safeWallet;
      setSafe(safeWallet.address);
    }

    // 4) Build capability (fresh nonce, 1y expiry) + safe possession proof
    const { nonce, issuedAt } = makeNonceAndIssuedAt();
    const host = getHost();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const safeProof = await safeWallet.signMessage(`${host}:${nonce}`);

    const capMsg = buildCapabilityMessage({
    host, parent: parentAddr, safe: safeWallet.address,
    nonce, issuedAt, expiresAt, safeProof
    });

    const payload: CapabilityPayload = {
    domain: CAP_DOMAIN,
    types: CAP_TYPES_WALLET,
    primaryType: "AuthorizeSafeSigner",
    message: capMsg
    };

    // 5) Sign and hard-verify first
    const parentSig = await signTypedDataV4(eth, parentAddr, payload);
    // 🔍 DEBUG — prove the 712 is correct BEFORE storage/state
    console.debug("[712][startWeb3Login] verify check", {
    recovered: verifyTypedData(CAP_DOMAIN, CAP_TYPES, capMsg, parentSig),
    selected: parentAddr,
    hostSigned: capMsg.host,
    hostNow: getHost(),
    });

    const recovered = verifyTypedData(CAP_DOMAIN, CAP_TYPES, capMsg, parentSig);
    if (recovered.toLowerCase() !== parentAddr.toLowerCase()) {
    throw new Error(`712 mismatch: recovered ${recovered} vs selected ${parentAddr}`);
    }

    // 6) Persist and update state
    const bundle: CapabilityBundle = { message: capMsg, parentSig };
    const deviceKey = await ensureDeviceKey();
    const keystore = await safeWallet.encrypt("dummy-pass");
    const encKS = await encryptJSON(deviceKey, { keystore });
    const encCap = await encryptJSON(deviceKey, { capability: bundle.message, parentSig: bundle.parentSig });

    // Check if POD seed already exists
    const existingPodSeed = await getKV<EncryptedJSON>(K_POD_SEED);

    if (!existingPodSeed) {
      // First-time authorization: Request deterministic POD identity signature
      const podIdentitySig = await requestPodIdentitySignature(eth, parentAddr);
      const podSeedData = derivePodSeedFromSignature(podIdentitySig);
      const encPodSeed = await encryptJSON(deviceKey, podSeedData);
      await putKV(K_POD_SEED, encPodSeed);
    }
    // Note: If POD seed exists, we keep it (it's deterministic anyway)

    await putKV(K_ENC_KEYSTORE, encKS);
    await putKV(K_ENC_CAP, encCap);
    await putKV(K_KIND, "web3");

    postingWalletRef.current = safeWallet;
    setSafe(safeWallet.address);
    setParent(parentAddr);
    // keep UI in sync with the new parent subject
    try { sessionStorage.setItem("woco.subject0x", parentAddr); } catch {}
    setCapId(capabilityId(bundle));

    const ok = verifyCapabilityLocal(bundle, safeWallet.address, getHost());
    // --- ADD: cookie for SSR ---
    if (ok) {
      setSubjectCookie(parentAddr);
      try { sessionStorage.setItem("woco.subject0x", parentAddr); } catch {}
    }

    setPostAuth(ok ? "parent-bound" : "blocked");


} finally {
    signInFlightRef.current = false;
}
}, [kind, postAuth]); // ✅ NEW: include postAuth

  // Rotate the safe (posting) key.
// - For local: reuse the local login flow
// - For web3: create a new safe, bind a fresh capability signed by the selected parent
// - Hard-fail if the recovered signer doesn't match the selected account
const rotateSafe = useCallback<UsePostingIdentity["rotateSafe"]>(async () => {
  if (kind === "local") {
    await startLocalLogin();
    return;
  }

  if (kind === "web3") {
    // 🚦 Prevent overlap with any other sign flow (login / reauth / rotate)
    if (signInFlightRef.current) return;
    signInFlightRef.current = true;

    try {
      // 1) Bind to the same provider we’ll use for signing
      const eth = window.ethereum as Eip1193WithSelected | undefined;
      if (!eth) throw new Error("No wallet found");

      // 2) Ask wallet for the parent account to authorize the new safe
      const parentAddr = await chooseAccount(eth);

      // 3) Create a brand-new safe signer for posting
      const safeWallet = Wallet.createRandom();

      // 4) Build the capability for the new safe (fresh nonce, 1y expiry) + safe possession proof
      const { nonce, issuedAt } = makeNonceAndIssuedAt();
      const host = getHost();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
      const safeProof = await safeWallet.signMessage(`${host}:${nonce}`);

      const capMsg = buildCapabilityMessage({
        host, parent: parentAddr, safe: safeWallet.address,
        nonce, issuedAt, expiresAt, safeProof
      });

      const payload: CapabilityPayload = {
        domain: CAP_DOMAIN,               // off-chain domain (must match verify)
        types: CAP_TYPES_WALLET,          // EIP712Domain {name,version} only
        primaryType: "AuthorizeSafeSigner",
        message: capMsg
      };

      // 5) Ask wallet to sign
      const parentSig = await signTypedDataV4(eth, parentAddr, payload);

      // 5a) 🔍 DEBUG — prove the 712 is correct BEFORE storage/state
      console.debug("[712][rotateSafe] verify check", {
        recovered: verifyTypedData(CAP_DOMAIN, CAP_TYPES, capMsg, parentSig),
        selected: parentAddr,
        hostSigned: capMsg.host,
        hostNow: getHost(),
      });

      // 5b) 🔐 Hard-verify BEFORE touching storage/state
      const recovered = verifyTypedData(CAP_DOMAIN, CAP_TYPES, capMsg, parentSig);
      if (recovered.toLowerCase() !== parentAddr.toLowerCase()) {
        throw new Error(`712 mismatch: recovered ${recovered} vs selected ${parentAddr}`);
      }

      // 6) Encrypt & store new safe + capability; POD seed remains unchanged
      const bundle: CapabilityBundle = { message: capMsg, parentSig };
      const deviceKey = await ensureDeviceKey();
      const keystore = await safeWallet.encrypt("dummy-pass");
      const encKS = await encryptJSON(deviceKey, { keystore });
      const encCap = await encryptJSON(deviceKey, { capability: bundle.message, parentSig: bundle.parentSig });

      // Check if POD seed already exists
      const existingPodSeed = await getKV<EncryptedJSON>(K_POD_SEED);

      if (!existingPodSeed) {
        // First-time rotation (shouldn't happen, but handle gracefully)
        const podIdentitySig = await requestPodIdentitySignature(eth, parentAddr);
        const podSeedData = derivePodSeedFromSignature(podIdentitySig);
        const encPodSeed = await encryptJSON(deviceKey, podSeedData);
        await putKV(K_POD_SEED, encPodSeed);
      }
      // Note: POD identity stays the same when rotating posting key (safe)

      await putKV(K_ENC_KEYSTORE, encKS);
      await putKV(K_ENC_CAP, encCap);
      await putKV(K_KIND, "web3");

      // 7) Update in-memory state to the rotated safe and selected parent
      postingWalletRef.current = safeWallet;
      setSafe(safeWallet.address);
      setParent(parentAddr);
      // keep UI in sync with the new parent subject
      try { sessionStorage.setItem("woco.subject0x", parentAddr); } catch {}
      setCapId(capabilityId(bundle));

      // 8) Gate posting ability based on the new capability
      const ok = verifyCapabilityLocal(bundle, safeWallet.address, getHost());
      console.debug("[cap][rotateSafe] ok?", ok);
      setPostAuth(ok ? "parent-bound" : "blocked");
      setReady(true);
    } finally {
      // ✅ Always release the guard
      signInFlightRef.current = false;
    }
  }
}, [kind, startLocalLogin]);

  /** Clear local state. */
  const logout = useCallback<UsePostingIdentity["logout"]>(async () => {
    await delKV(K_ENC_KEYSTORE);
    await delKV(K_ENC_CAP);
    await delKV(K_KIND);

    try {
      sessionStorage.removeItem("woco.subject0x");
      localStorage.removeItem("woco.subject0x"); // ✅ Also clear from localStorage
    } catch {}
    clearSubjectCookie();

    // ✅ CRITICAL: Clear all profile cache (including images) on logout
    // This prevents cached profile data from showing when creating a new account
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        // Clear profile context cache (format: profile:owner:subject)
        if (key.startsWith('profile:')) {
          localStorage.removeItem(key);
        }
        // Clear legacy profile cache (format: woco.profile.0x...)
        if (key.startsWith('woco.profile.')) {
          localStorage.removeItem(key);
        }
        // Clear cached owner
        if (key === 'woco.owner0x') {
          localStorage.removeItem(key);
        }
      });

      // ✅ Clear isNewAccount flag on logout to prevent cross-contamination
      localStorage.removeItem("woco.isNewAccount");
    } catch {}

    postingWalletRef.current = null;
    setKind("none");
    setParent(undefined);
    setSafe(undefined);
    setCapId(undefined);
    setPostAuth("blocked");
    setReady(true);
  }, []);

  // Keep postAuth consistent for local sessions
  useEffect(() => {
    if (kind === "local") setPostAuth("local-only");
  }, [kind]);

  // [OPTIONAL] If the wallet account changes, hide parent & block until re-auth.
  // [SAFE] Off-chain: a chain change is irrelevant to the capability.
  // Do NOT auto-block here.
  const onChainChanged = useCallback((hexChainId: string) => {
    chainIdRef.current = hexChainId; // keep for debug
    // intentionally no setPostAuth("blocked") here
    // optionally: show a non-blocking banner in your UI if you care
  }, []);

  useEffect(() => {
    const eth = asEventProvider(typeof window !== "undefined" ? window.ethereum : undefined);
    if (!eth?.on) return;

    eth.on("chainChanged", onChainChanged);
    return () => {
      try {
        if (typeof eth.off === "function") eth.off("chainChanged", onChainChanged);
        else if (typeof eth.removeListener === "function") eth.removeListener("chainChanged", onChainChanged);
      } catch {}
    };
  }, [onChainChanged]);

  return useMemo<UsePostingIdentity>(
    () => ({
      ready,
      kind,
      postAuth,
      parent,
      safe,
      capId,
      startWeb3Login,
      startLocalLogin,
      signCapabilityNow: kind === "web3" ? signCapabilityNow : undefined,
      rotateSafe,
      logout,
      signPost,
      getWalletForPOD,
    }),
    [ready, kind, postAuth, parent, safe, capId, startWeb3Login, startLocalLogin, signCapabilityNow, rotateSafe, logout, signPost, getWalletForPOD]
  );
}
