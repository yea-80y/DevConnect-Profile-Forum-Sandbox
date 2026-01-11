/**
 * IndexedDB storage operations for authentication data
 */

import { STORAGE_DB, OS_KV } from "../constants";

/* ============================
 * IndexedDB Helpers
 * ============================ */

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OS_KV)) {
        db.createObjectStore(OS_KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get value from IndexedDB
 */
export async function getKV<T = unknown>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OS_KV, "readonly");
    const store = tx.objectStore(OS_KV);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Put value to IndexedDB
 */
export async function putKV<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OS_KV, "readwrite");
    const store = tx.objectStore(OS_KV);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete value from IndexedDB
 */
export async function delKV(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OS_KV, "readwrite");
    const store = tx.objectStore(OS_KV);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
