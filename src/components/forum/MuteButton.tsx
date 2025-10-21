"use client";

import { useState } from "react";
import { useMe } from "@/app/ClientProviders";

type Kind = "thread" | "reply";

/**
 * MuteButton
 * - Only renders for admins (isAdmin from /api/auth/me).
 * - Sends cookies with the request so the server can see dc_admin.
 * - Optional optimistic UI via onMuted(), with rollback on error.
 * - Disables while in-flight to avoid duplicate POSTs.
 */
export function MuteButton({
  boardId,
  refHex,
  kind,
  onMuted,
}: {
  boardId: string;
  refHex: string;          // 64-hex (with or without 0x)
  kind: Kind;              // "thread" for board roots, "reply" for replies
  onMuted?: () => void;    // optional: optimistic UI removal
}) {
  const { isAdmin } = useMe();
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return null;

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;      // guard against rapid double-clicks
    setBusy(true);

    // Track if we need to rollback optimistic change
    let optimisticApplied = false;

    try {
      const res = await fetch("/api/moderation/mute", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, ref: refHex, kind }),
      });
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      // ✅ successful: now tell the parent to remove from UI
      onMuted?.();

      // (optional) also broadcast for any listeners
      window.dispatchEvent(new Event("moderation:changed"));
    } catch (err) {
      // Rollback optimistic change if we applied one and failed
      if (optimisticApplied) {
        // Let the parent decide rollback if needed; here we just log.
        // If you want a hard rollback, lift the muted state up and re-render.
      }
      console.error("Mute failed:", err);
      alert(`Mute failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-xs opacity-70 hover:opacity-100 underline underline-offset-2 disabled:opacity-40"
      title={`Hide this ${kind} for everyone (admin)`}
    >
      {busy ? "Muting…" : "Mute"}
    </button>
  );
}
