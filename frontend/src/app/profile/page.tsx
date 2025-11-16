// src/app/profile/page.tsx
"use client";

/**
 * Profile page shell:
 * - Resolves the current subject (who the profile belongs to)
 *   via usePostingIdentity:
 *     web3  → parent wallet (0x…)
 *     local → safe (your local main addr)    <-- per your rules for profiles
 * - Loads the platform feed owner (0x…) from localStorage
 *   where /api/profile POSTs persisted it as "woco.owner0x".
 * - Mounts <ProfileProvider> with (beeUrl, subject, feedOwner) so
 *   ProfileView/useProfile can hydrate + refresh from Swarm.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ProfileProvider } from "@/lib/profile/context";
import { BEE_URL } from "@/config/swarm";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import ProfileTab from "./ProfileTab";

type Hex0x = `0x${string}`;

export default function ProfilePage() {
  // 1) Who is the user? (subject)
  const id = usePostingIdentity();
  const subject0x = useMemo<Hex0x | null>(() => {
    if (!id?.ready) return null;
    const addr =
      id.kind === "web3" ? id.parent :
      id.kind === "local" ? id.safe   :
      undefined;
    return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Hex0x) : null;
  }, [id?.ready, id?.kind, id?.parent, id?.safe]);

  // 2) Platform feed owner (persisted by /api/profile after first save)
  const [owner0x, setOwner0x] = useState<Hex0x | null>(null);

  useEffect(() => {
    // initial read
    try {
      const cached = localStorage.getItem("woco.owner0x") as Hex0x | null;
      if (cached && cached.startsWith("0x")) setOwner0x(cached);
    } catch { /* ignore */ }

    // keep it in sync after saves
    const onUpdated = () => {
      try {
        const next = localStorage.getItem("woco.owner0x") as Hex0x | null;
        setOwner0x(next && next.startsWith("0x") ? next : null);
      } catch { /* ignore */ }
    };
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  return (
    <main className="p-4">
      <div className="mb-3">
        <Link href="/" className="inline-flex items-center px-3 py-1.5 text-sm rounded border bg-white">
          ← Home
        </Link>
      </div>

      {/* The provider is what lets ProfileView/useProfile render + refresh */}
      <ProfileProvider beeUrl={BEE_URL} subject={subject0x} feedOwner={owner0x}>
        <ProfileTab />
      </ProfileProvider>
    </main>
  );
}
