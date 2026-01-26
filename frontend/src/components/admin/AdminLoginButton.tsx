// components/AdminLoginButton.tsx
"use client";

/**
 * Moderator sign-in (secure challenge-response):
 * 1. GET /api/auth/admin/elevate → receive nonce challenge
 * 2. Sign the challenge message with wallet (EIP-191)
 * 3. POST /api/auth/admin/elevate with { address, signature }
 * 4. Server verifies signature and sets dc_admin cookie
 * - We then dispatch "admin:changed" so ClientProviders refetches /api/auth/me.
 */

import { useState } from "react";
import { apiUrl } from "@/config/api";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function AdminLoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = usePostingIdentity();

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      // Get subject address: web3 → parent, local → safe
      const subject = id.kind === "web3" ? id.parent : id.kind === "local" ? id.safe : null;
      if (!subject) {
        throw new Error("Not logged in");
      }

      // Step 1: Get nonce challenge from server
      const challengeRes = await fetch(apiUrl("/api/auth/admin/elevate"), {
        method: "GET",
        credentials: "include",
      });
      const challengeData = await challengeRes.json().catch(() => ({}));
      if (!challengeRes.ok || !challengeData?.ok || !challengeData?.message) {
        throw new Error(challengeData?.error || "Failed to get challenge");
      }

      const messageToSign = challengeData.message;

      // Step 2: Sign the message
      let signature: string;

      if (id.kind === "web3") {
        // Web3 user: sign with connected wallet
        const eth = (window as { ethereum?: Eip1193Provider }).ethereum;
        if (!eth) {
          throw new Error("No wallet found");
        }

        signature = (await eth.request({
          method: "personal_sign",
          params: [messageToSign, subject],
        })) as string;
      } else if (id.kind === "local") {
        // Local user: sign with posting wallet
        signature = await id.signPost(messageToSign);
      } else {
        throw new Error("Unknown auth type");
      }

      // Step 3: Submit signature for verification
      const res = await fetch(apiUrl("/api/auth/admin/elevate"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: subject,
          signature,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `Elevate failed (HTTP ${res.status})`);
      }

      // Server sets dc_admin cookie; let ClientProviders update admin state
      window.dispatchEvent(new Event("admin:changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Moderator sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="px-3 py-1.5 text-sm rounded border bg-black text-white disabled:opacity-60"
      >
        {busy ? "Authorizing…" : "Moderator sign-in"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
