// components/AdminLoginButton.tsx
"use client";

/**
 * Moderator sign-in (no new signature):
 * - POST /api/auth/admin/elevate
 * - Server reads the parent address from the cookie set by usePostingIdentity:
 *     woco_subject0x = 0xParent...
 * - If parent is in ADMIN_ADDRESSES, the server returns { ok: true } (and optionally sets dc_admin flag).
 * - We then dispatch "admin:changed" so ClientProviders refetches /api/auth/me.
 */

import { useState } from "react";

export function AdminLoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/admin/elevate", {
        method: "POST",
        credentials: "include", // include cookies (same-origin)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `Elevate failed (HTTP ${res.status})`);
      }
      // Let ClientProviders update admin state
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
