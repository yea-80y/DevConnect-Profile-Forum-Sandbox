// components/AdminLoginButton.tsx
"use client";

/**
 * Moderator sign-in (no new signature):
 * - POST /api/auth/admin/elevate
 * - Server reads the parent address from:
 *   1. X-Subject-Address header (cross-origin), or
 *   2. woco_subject0x cookie (same-origin)
 * - If parent is in ADMIN_ADDRESSES, the server returns { ok: true } and sets dc_admin cookie.
 * - We then dispatch "admin:changed" so ClientProviders refetches /api/auth/me.
 */

import { useState } from "react";
import { apiUrl } from "@/config/api";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";

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

      const res = await fetch(apiUrl("/api/auth/admin/elevate"), {
        method: "POST",
        credentials: "include", // send cookies cross-origin
        headers: {
          "X-Subject-Address": subject, // send subject in header for cross-origin
        },
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
