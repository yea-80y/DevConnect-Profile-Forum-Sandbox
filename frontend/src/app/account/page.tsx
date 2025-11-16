"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "ethers";

/**
 * Minimal private key export page.
 * - Reads your IndexedDB store ("woco-auth"/"kv") and the keys your hook uses:
 *   - K_KIND: "local" | "web3" | "none"
 *   - K_DEVICE_KEY: CryptoKey for AES-GCM
 *   - K_ENC_KEYSTORE: { iv, ct } for the encrypted keystore JSON
 * - Only exports when K_KIND === "local".
 *
 * Matches your hook's storage scheme. No changes to your login needed.  (see hook) :contentReference[oaicite:2]{index=2}
 */

type Hex0x = `0x${string}`;
type AuthKind = "web3" | "local" | "none";

const STORAGE_DB = "woco-auth";            // :contentReference[oaicite:3]{index=3}
const OS_KV = "kv";                         // :contentReference[oaicite:4]{index=4}
const K_DEVICE_KEY = "woco:deviceKey";      // :contentReference[oaicite:5]{index=5}
const K_ENC_KEYSTORE = "woco:encKeystore";  // :contentReference[oaicite:6]{index=6}
const K_KIND = "woco:kind";                 // :contentReference[oaicite:7]{index=7}

interface EncryptedJSON { iv: string; ct: string; }

/* ---------------- IndexedDB tiny helpers (read-only) ---------------- */

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
async function getKV<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return await new Promise<T | undefined>((res, rej) => {
    const tx = db.transaction(OS_KV, "readonly");
    const r = tx.objectStore(OS_KV).get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error ?? new Error("IDB get error"));
  });
}

/* ---------------- AES-GCM helpers (match your hook) ----------------- */

function hexToU8(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}
async function decryptJSON<T>(key: CryptoKey, enc: EncryptedJSON): Promise<T> {
  const ivU8 = hexToU8(enc.iv);
  const ctU8 = hexToU8(enc.ct);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(ivU8) }, key, toArrayBuffer(ctU8));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/* ---------------- small file helpers ---------------- */

function downloadTextFile(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function utcFilenameFor(address0x: string, d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}.000Z`;
  return `UTC--${iso}--${address0x.slice(2).toLowerCase()}.json`;
}

/* ------------------------------ Page ------------------------------- */

export default function ExportPrivateKeyPage() {
  const router = useRouter();
  const [kind, setKind] = useState<AuthKind>("none");
  const [pk, setPk] = useState<Hex0x | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On mount: read kind; if local, decrypt keystore -> wallet -> privateKey
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedKind = await getKV<AuthKind>(K_KIND);
        if (!mounted) return;
        setKind(savedKind ?? "none");

        if (savedKind !== "local") {
          setPk(null);
          return;
        }

        const deviceKey = await getKV<CryptoKey>(K_DEVICE_KEY);     // :contentReference[oaicite:8]{index=8}
        const encKS = await getKV<EncryptedJSON>(K_ENC_KEYSTORE);   // :contentReference[oaicite:9]{index=9}
        if (!deviceKey || !encKS) {
          setPk(null);
          return;
        }

        // Your hook encrypts { keystore } (string) inside AES-GCM; decrypt, then ethers decrypt. :contentReference[oaicite:10]{index=10}
        const { keystore } = await decryptJSON<{ keystore: string }>(deviceKey, encKS);
        const wallet = await Wallet.fromEncryptedJson(keystore, "dummy-pass"); // same pass as hook :contentReference[oaicite:11]{index=11}
        if (!mounted) return;

        // Local accounts are fine to export; Web3 should be blocked by kind check above.
        setPk(wallet.privateKey as Hex0x);
      } catch (e) {
        if (!mounted) return;
        setError(String(e));
        setPk(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const address = useMemo(() => {
    try { return pk ? new Wallet(pk).address as Hex0x : undefined; } catch { return undefined; }
  }, [pk]);

  async function copyPk() {
    if (!pk) return;
    try { await navigator.clipboard.writeText(pk); alert("Private key copied. Handle with care."); }
    catch { alert("Could not copy to clipboard."); }
  }
  function downloadPkTxt() {
    if (!pk || !address) return;
    downloadTextFile(
      `account-${address.slice(2, 10)}.txt`,
      `# WARNING: PRIVATE KEY (UNENCRYPTED)
# Anyone with this key can control your funds/identity.
Address: ${address}
PrivateKey: ${pk}
`,
      "text/plain"
    );
  }
  async function downloadKeystore() {
    if (!pk || !address) return;
    const password = prompt("Enter a password for the keystore JSON (do not forget it):");
    if (!password) return;
    try {
      const json = await new Wallet(pk).encrypt(password);
      downloadTextFile(utcFilenameFor(address), json, "application/json");
    } catch (e) {
      alert(`Failed to create keystore: ${String(e)}`);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button
          onClick={() => router.push('/dashboard/')}
          style={{ fontSize: 14, color: "#4b5563", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
        >
          Back to Dashboard
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Export Private Key</h1>
      </div>

      {error && (
        <p style={{ color: "#b91c1c", fontSize: 12, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {kind === "local" && pk && address ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Mode: <b>Local account</b>
          </div>
          <div style={{ fontSize: 12, wordBreak: "break-all", marginBottom: 8 }}>
            Address: <code>{address}</code>
          </div>
          <div style={{ fontSize: 12, marginBottom: 12 }}>
            Private key (masked): <code>0x****{pk.slice(-6)}</code>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={copyPk}>Copy private key</button>
            <button onClick={downloadPkTxt}>Download PK (.txt)</button>
            <button onClick={downloadKeystore}>Download keystore (JSON)</button>
          </div>

          <p style={{ fontSize: 11, color: "#92400e", marginTop: 10 }}>
            <b>Security warning:</b> Anyone with your private key (or keystore + password) can control this
            account. Store offline and never share.
          </p>
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, fontSize: 13 }}>
          Mode: <b>{kind === "web3" ? "Web3 wallet" : "No local key"}</b>
          <p style={{ marginTop: 8, color: "#4b5563", fontSize: 12 }}>
            Private key export is only available for local accounts created on first login. Since we didn’t detect
            a local account, there’s nothing to export.
          </p>
        </div>
      )}
    </main>
  );
}
