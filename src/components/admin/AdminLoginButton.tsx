"use client";

/**
 * AdminLoginButton (with EIP-712 preview)
 * 1) "Prepare sign-in" → fetch nonce, build typed message, show preview
 * 2) "Sign & login"    → sign EIP-712 with local Wallet, POST to server
 * After success, emit "admin:changed" so ClientProviders refreshes /api/auth/me.
 */

import { useState } from "react";
import { Wallet, type TypedDataDomain, type TypedDataField } from "ethers";

const ACTIVE_PK_KEY = "woco.active_pk";

type AdminLoginMsg = {
  host: string;
  nonce: string;
  issuedAt: number;           // seconds since epoch
  purpose: "moderation-login";
};

const DOMAIN: TypedDataDomain = { name: "WoCo Admin Auth", version: "1" };
const TYPES: Record<string, TypedDataField[]> = {
  AdminLogin: [
    { name: "host", type: "string" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "purpose", type: "string" },
  ],
};

export function AdminLoginButton() {
  const [msg, setMsg] = useState<AdminLoginMsg | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addr, setAddr] = useState<`0x${string}` | null>(null);

  /** Step 1: build the EIP-712 message and show the preview */
  async function prepare() {
    setError(null);

    // Use your locally stored prototype key
    const pk = localStorage.getItem(ACTIVE_PK_KEY) as `0x${string}` | null;
    if (!pk) {
      alert("No active private key found. Set one on the Accounts page.");
      return;
    }

    // Ask server for a nonce (it also sets an httpOnly cookie)
    const res = await fetch("/api/auth/nonce", { cache: "no-store" });
    const j: { nonce: string } = await res.json();

    // Construct the typed message
    const message: AdminLoginMsg = {
      host: window.location.host,
      nonce: j.nonce,
      issuedAt: Math.floor(Date.now() / 1000),
      purpose: "moderation-login",
    };

    // Show which address will sign (derived from the local PK)
    const wallet = new Wallet(pk);
    setAddr(wallet.address as `0x${string}`);
    setMsg(message);
  }

  /** Step 2: sign the typed data and log in */
  async function signAndLogin() {
    if (!msg) return;
    setBusy(true);
    setError(null);

    try {
      const pk = localStorage.getItem(ACTIVE_PK_KEY) as `0x${string}` | null;
      if (!pk) throw new Error("Missing active private key");
      const wallet = new Wallet(pk);

      // EIP-712 signature (ethers v6)
      const signature = await wallet.signTypedData(DOMAIN, TYPES, msg);

      // Server verifies signature + nonce and issues an admin session cookie
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.address, signature, message: msg }),
      });
      const j: { ok: boolean; error?: string } = await res.json();
      if (!j.ok) throw new Error(j.error || "Admin login failed");

      // 🔔 Key bit: inform ClientProviders (which listens for "admin:changed")
      // so it refetches /api/auth/me immediately and flips isAdmin=true
      window.dispatchEvent(new Event("admin:changed"));

      // Optional: close the preview UI now that we're logged in
      setMsg(null);
      setAddr(null);

      // No full page reload needed
      // location.reload(); // ← leave commented as a fallback, if you ever want it
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setMsg(null);
    setAddr(null);
    setError(null);
  }

  // Initial compact button
  if (!msg) {
    return (
      <button
        onClick={prepare}
        className="px-3 py-1.5 text-sm rounded border"
        title="Authenticate as admin using an EIP-712 signed message"
      >
        Admin sign-in
      </button>
    );
  }

  // Inline EIP-712 preview
  return (
    <div className="text-xs max-w-[36rem] p-3 rounded border bg-white shadow-sm">
      <div className="font-semibold mb-1">EIP-712 preview</div>
      <div className="mb-1">Signer address: <span className="font-mono">{addr}</span></div>
      <details className="mb-1" open>
        <summary className="cursor-pointer">Domain</summary>
        <pre className="overflow-x-auto bg-gray-50 p-2 rounded">{JSON.stringify(DOMAIN, null, 2)}</pre>
      </details>
      <details className="mb-1">
        <summary className="cursor-pointer">Types</summary>
        <pre className="overflow-x-auto bg-gray-50 p-2 rounded">{JSON.stringify(TYPES, null, 2)}</pre>
      </details>
      <details className="mb-2" open>
        <summary className="cursor-pointer">Message</summary>
        <pre className="overflow-x-auto bg-gray-50 p-2 rounded">{JSON.stringify(msg, null, 2)}</pre>
      </details>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={signAndLogin}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded border bg-black text-white disabled:opacity-60"
        >
          {busy ? "Signing…" : "Sign & login"}
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded border"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
