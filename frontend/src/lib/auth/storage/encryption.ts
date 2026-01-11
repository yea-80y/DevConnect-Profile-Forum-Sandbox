/**
 * AES-GCM encryption helpers for secure storage
 */

import type { EncryptedJSON } from "../types";
import { K_DEVICE_KEY } from "../constants";
import { getKV, putKV } from "./indexeddb";

/* ============================
 * Device-Bound Encryption
 * ============================ */

/**
 * Ensure device-bound AES-GCM key exists in IndexedDB
 * This key is non-extractable and tied to this device
 */
export async function ensureDeviceKey(): Promise<CryptoKey> {
  const existing = await getKV<CryptoKey>(K_DEVICE_KEY);
  if (existing) return existing;

  // Generate new device-bound AES-256-GCM key
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable!
    ["encrypt", "decrypt"]
  );

  await putKV(K_DEVICE_KEY, key);
  return key;
}

/**
 * Encrypt JSON data with device key
 */
export async function encryptJSON<T>(
  deviceKey: CryptoKey,
  data: T
): Promise<EncryptedJSON> {
  const json = JSON.stringify(data);
  const plaintext = new TextEncoder().encode(json);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    deviceKey,
    plaintext
  );

  return {
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join(""),
    ct: Array.from(new Uint8Array(ciphertext))
      .map(b => b.toString(16).padStart(2, "0"))
      .join(""),
  };
}

/**
 * Decrypt JSON data with device key
 */
export async function decryptJSON<T>(
  deviceKey: CryptoKey,
  enc: EncryptedJSON
): Promise<T> {
  const iv = new Uint8Array(
    enc.iv.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  const ciphertext = new Uint8Array(
    enc.ct.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    deviceKey,
    ciphertext
  );

  const json = new TextDecoder().decode(plaintext);
  return JSON.parse(json);
}
