"use client";

/**
 * Home
 * ----
 * - We show the user's profile if we know two things:
 *    1) feedOwner  → returned by /api/profile (platform signer address)
 *    2) subject    → user's address (read from localStorage; fall back to deriving from PK if needed)
 * - We DO NOT load any signer here. We only:
 *    - read localStorage for the test account you created on /account
 *    - fetch /api/profile ONCE (and only after we have a subject) to get the feed owner
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import ProfileView from "@/app/profile/ProfileView";

type ApiOk = { ok: true; owner: `0x${string}`; user?: `0x${string}` };
type ApiErr = { ok: false; error: string };

// Prefer reading the address directly if you've stored it (lightweight: no ethers import).
function getActiveAddressFromStorage(): `0x${string}` | null {
  const addr = localStorage.getItem("woco.active_addr") as `0x${string}` | null;
  if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) return addr;
  return null;
}

// Fallback: derive address from the stored private key (only if needed).
async function deriveAddressFromPkIfNeeded(): Promise<`0x${string}` | null> {
  const pk = localStorage.getItem("woco.active_pk") as `0x${string}` | null;
  if (!pk) return null;
  try {
    // dynamic import keeps the initial JS lighter if we already had the address stored
    const { Wallet } = await import("ethers");
    return new Wallet(pk).address as `0x${string}`;
  } catch {
    return null;
  }
}

export default function Home() {
  const [feedOwner, setFeedOwner] = useState<`0x${string}` | null>(null); // platform signer address
  const [subject, setSubject] = useState<`0x${string}` | null>(null);     // user address
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // 1) Get subject (user) *without* heavy libs when possible
      const addr = getActiveAddressFromStorage() ?? (await deriveAddressFromPkIfNeeded());
      if (!addr) {
        setError("No active account. Go to Accounts to create/import one.");
        return;
      }
      setSubject(addr);

      // 2) Only now fetch the platform feed owner (one light GET)
      try {
        const res = await fetch("/api/profile");
        const d: ApiOk | ApiErr = await res.json();
        if ("ok" in d && d.ok && d.owner) {
          setFeedOwner(d.owner);
        } else {
          setError((d as ApiErr).error || "Unable to fetch platform owner");
        }
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <main className="min-h-dvh bg-neutral-50 pb-20">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold">Devconnect</span>
          <div className="flex items-center gap-4">
            <Link href="/account" className="text-sm underline">Accounts</Link>
            <Link href="/profile" className="text-sm underline">Edit profile</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="mb-3 text-sm font-semibold">My Profile</div>

          {feedOwner && subject ? (
            // IMPORTANT: we pass both feedOwner (platform) and subject (user)
            <ProfileView feedOwner={feedOwner} subject={subject} />
          ) : (
            <div className="text-sm text-gray-500">
              {error ?? "Loading…"}
            </div>
          )}

          {feedOwner && (
            <p className="mt-2 text-xs text-gray-500 break-all">
              Feed owner (platform): <code>{feedOwner}</code><br />
              Subject (user): <code>{subject ?? "(none)"}</code>
            </p>
          )}
        </section>

        {/* rest of your tiles */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/programme" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Programme</div>
            <div className="text-xs text-gray-500">Browse sessions & schedule</div>
          </Link>
          <Link href="/map" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Map</div>
            <div className="text-xs text-gray-500">Find venues & rooms</div>
          </Link>
          <Link href="/quests" className="rounded-xl bg-white border shadow_sm p-4">
            <div className="text-sm font-medium">Quests</div>
            <div className="text-xs text-gray-500">Play & earn rewards</div>
          </Link>
          <Link href="/profile" className="rounded-xl bg-white border shadow_sm p-4">
            <div className="text-sm font-medium">Settings</div>
            <div className="text-xs text-gray-500">Update your profile</div>
          </Link>
        </section>
      </div>
    </main>
  );
}
