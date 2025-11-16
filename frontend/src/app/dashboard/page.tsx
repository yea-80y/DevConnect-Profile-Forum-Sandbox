//src/app/ClientProviders.tsx
"use client";

/**
 * Dashboard (formerly Home)
 * -------------------------
 * - Feeds are owned by the platform signer (server).
 * - Topics are keyed by SUBJECT (the user identity we display).
 *   SUBJECT:
 *     web3  => parent address
 *     local => local account address
 *
 * We:
 *   1) Get SUBJECT from usePostingIdentity (parent/local).
 *   2) Read the platform signer (feed owner) from localStorage and keep it in
 *      sync via the "owner:refreshed" event (emitted by ClientProviders).
 *   3) Render <ProfileView feedOwner={platformOwner} subject={userAddress} />.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProfileView from "../profile/ProfileView";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import PostingAuthNudge from "@/components/auth/PostingAuthNudge";
import { apiUrl } from "@/config/api";

// validate + narrow a string to a 0x-address
function toHexAddress(addr?: string): `0x${string}` | null {
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
}

export default function Home() {
  const id = usePostingIdentity();
  const router = useRouter();

  // platform signer (feed owner) – sourced from cache and kept in sync by event
  const [platformOwner, setPlatformOwner] = useState<`0x${string}` | null>(null);

  // SUBJECT for UI/profile: web3 -> parent, local -> safe
  const userAddress = useMemo<`0x${string}` | null>(() => {
    if (!id.ready) return null;
    const chosen = id.kind === "web3" ? id.parent : id.safe;
    return toHexAddress(chosen);
  }, [id.ready, id.kind, id.parent, id.safe]);

  // Show top banner while a web3 session is authorizing EIP-712
  const authorizing = id.ready && id.kind === "web3" && id.postAuth !== "parent-bound";

  // 1) Seed owner from cache, then keep in sync with ClientProviders via event
  useEffect(() => {
    try {
      const cached = localStorage.getItem("woco.owner0x") as `0x${string}` | null;
      if (cached && cached.startsWith("0x")) setPlatformOwner(prev => prev ?? cached);
    } catch {}

    const onOwnerRefreshed = () => {
      try {
        const val = localStorage.getItem("woco.owner0x") as `0x${string}` | null;
        if (val && val.startsWith("0x")) {
          setPlatformOwner(prev => (prev === val ? prev : val));
        }
      } catch {}
    };

    window.addEventListener("owner:refreshed", onOwnerRefreshed);
    return () => window.removeEventListener("owner:refreshed", onOwnerRefreshed);
  }, []);

  // 2) (Optional legacy) keep subject/owner mirrored in localStorage for other screens
  useEffect(() => {
    if (!id.ready) return;
    try {
      if (userAddress) localStorage.setItem("woco.subject0x", userAddress);
      else localStorage.removeItem("woco.subject0x");

      if (platformOwner) localStorage.setItem("woco.owner0x", platformOwner);
    } catch {
      /* ignore private mode / quota */
    }
  }, [id.ready, userAddress, platformOwner]);

  return (
    <main className="min-h-dvh bg-neutral-50 pb-20">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold">Devconnect</span>
          <div className="flex items-center gap-4">
            <Link href="/account" className="text-sm text-gray-900 underline">Accounts</Link>
            <Link href="/profile" className="text-sm text-gray-900 underline">Edit profile</Link>
            <Link href="/forum" className="text-sm text-gray-900 underline">Forum</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        {authorizing && (
          <div className="rounded-xl border p-3 bg-amber-50/70 text-sm mb-2" aria-live="polite">
            Authorizing… please confirm in your wallet.
          </div>
        )}

        {/* Account summary */}
        <section className="rounded-xl bg-white border shadow-sm p-4 space-y-1">
          <div className="text-sm font-semibold text-gray-900">Account</div>
          <div className="text-xs text-gray-600">
            Subject (user):{" "}
            <code className="break-all">
              {userAddress ?? "(no active account — go to Login to get started)"}
            </code>
          </div>
          <div className="text-xs text-gray-600">
            Feed owner (platform signer):{" "}
            <code className="break-all">
              {platformOwner ?? "(loading…)"}
            </code>
          </div>
          {id.kind === "web3" && (
            <div className="text-xs text-gray-500">
              Debug · parent: <code>{id.parent ?? "(unset)"}</code> · safe: <code>{id.safe ?? "(unset)"}</code> · postAuth: <code>{id.postAuth}</code>
            </div>
          )}
          {id.kind === "web3" && (
            <div className="text-xs text-gray-600">
              Posting: {id.postAuth === "parent-bound" ? "enabled" : "requires authorization"}
            </div>
          )}
        </section>

        {/* Profile viewer — requires BOTH the platform owner and the subject */}
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="mb-3 text-sm font-semibold text-gray-900">My Profile</div>
          {platformOwner && userAddress ? (
            <ProfileView key={userAddress} feedOwner={platformOwner} subject={userAddress} />
          ) : (
            <div className="text-sm text-gray-500">
              {!id.ready
                ? "Preparing your account…"
                : !userAddress
                  ? "No active user found. Use the Login page to start."
                  : "Loading platform signer…"}
            </div>
          )}

          {/* Small print: which identity we’re using */}
          <p className="mt-2 text-xs text-gray-500 break-all">
            Viewing profile for: <code>{userAddress ?? "(no subject)"}</code>
            {" · "}
            feed owner: <code>{platformOwner ?? "(unknown)"}</code>
          </p>

          {/* Web3 session without a valid capability → nudge to authorize */}
          {id.kind === "web3" && id.postAuth !== "parent-bound" && (
            <div className="mt-3">
              <PostingAuthNudge />
            </div>
          )}
        </section>

        {/* Nav cards */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/programme" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Programme</div>
            <div className="text-xs text-gray-500">Browse sessions & schedule</div>
          </Link>

          <Link href="/map" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Map</div>
            <div className="text-xs text-gray-500">Find venues & rooms</div>
          </Link>

          <Link href="/forum" className="rounded-xl bg-blue-600 border border-blue-700 shadow-md p-4 hover:bg-blue-700 transition">
            <div className="text-sm font-bold text-white">Forum</div>
            <div className="text-xs text-blue-100">Discuss sessions & speakers</div>
          </Link>

          <Link href="/profile" className="rounded-xl bg-blue-600 border border-blue-700 shadow-md p-4 hover:bg-blue-700 transition">
            <div className="text-sm font-bold text-white">Settings</div>
            <div className="text-xs text-blue-100">Update your profile</div>
          </Link>
        </section>

        {/* Testing: forget identity */}
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Testing</div>
          <p className="text-xs text-gray-600 mb-2">
            “Forget identity” clears your local posting key/capability and returns to the Login screen.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-white"
            onClick={async () => {
              try {
                await id.logout();
                try { await fetch(apiUrl("/api/auth/logout"), { method: "POST" }); } catch {}
                try {
                  localStorage.removeItem("woco.active_pk");
                  localStorage.removeItem("demo_user_pk");
                } catch {}

                window.dispatchEvent(new Event("admin:changed"));
                window.dispatchEvent(new Event("profile:updated"));

                router.push("/");
              } catch (e) {
                console.error("forget identity failed", e);
              }
            }}
          >
            Forget identity (testing)
          </button>
        </section>
      </div>
    </main>
  );
}
