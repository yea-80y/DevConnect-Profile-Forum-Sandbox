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
import ThemeToggle from "@/components/ThemeToggle";
import ProfileTab from "./ProfileTab";

type Hex0x = `0x${string}`;

export default function ProfilePage() {
  // 1) Who is the user? (subject)
  const id = usePostingIdentity();

  // ✅ Load subject synchronously from cache first, then update when identity is ready
  const [subject0x, setSubject0x] = useState<Hex0x | null>(() => {
    try {
      const cached = localStorage.getItem("woco.subject0x") as Hex0x | null;
      if (cached && /^0x[0-9a-fA-F]{40}$/.test(cached)) return cached;
    } catch { /* ignore */ }
    return null;
  });

  // Update subject when identity becomes ready
  useEffect(() => {
    if (!id?.ready) return;
    const addr =
      id.kind === "web3" ? id.parent :
      id.kind === "local" ? id.safe   :
      undefined;
    const validated = addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Hex0x) : null;
    if (validated !== subject0x) {
      setSubject0x(validated);
      // Persist for next page load
      try {
        if (validated) localStorage.setItem("woco.subject0x", validated);
        else localStorage.removeItem("woco.subject0x");
      } catch { /* ignore */ }
    }
  }, [id?.ready, id?.kind, id?.parent, id?.safe, subject0x]);

  // 2) Platform feed owner (persisted by /api/profile after first save)
  // ✅ Load synchronously for instant UI (lazy initialization)
  const [owner0x, setOwner0x] = useState<Hex0x | null>(() => {
    try {
      const cached = localStorage.getItem("woco.owner0x") as Hex0x | null;
      if (cached && cached.startsWith("0x")) return cached;
    } catch { /* ignore */ }
    return null;
  });

  useEffect(() => {
    // keep it in sync after saves
    // ✅ Only update if owner actually changed (not null → value on first save)
    const onUpdated = () => {
      console.log('[ProfilePage] profile:updated event received');
      try {
        const next = localStorage.getItem("woco.owner0x") as Hex0x | null;
        const validated = next && next.startsWith("0x") ? next : null;

        // Don't trigger remount if going from null → value (first save)
        // Only update if both were non-null and different (actual change)
        setOwner0x(prev => {
          console.log('[ProfilePage] Owner comparison:', { prev, validated });
          if (prev === validated) {
            console.log('[ProfilePage] ✓ Owner unchanged, skipping update');
            return prev; // no change
          }
          if (prev === null && validated !== null) {
            // First save - update state but don't cause remount
            console.log('[ProfilePage] First save detected, updating owner0x without remount');
            return validated;
          }
          // Actual change (switching accounts or clearing)
          console.log('[ProfilePage] Owner changed, updating owner0x');
          return validated;
        });
      } catch { /* ignore */ }
    };
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-gray-900 transition-colors p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center px-3 py-1.5 text-sm rounded border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-750">
          ← Home
        </Link>
        <ThemeToggle />
      </div>

      {/* The provider is what lets ProfileView/useProfile render + refresh */}
      <ProfileProvider beeUrl={BEE_URL} subject={subject0x} feedOwner={owner0x}>
        <ProfileTab />
      </ProfileProvider>
    </main>
  );
}
