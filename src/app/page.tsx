"use client";

/**
 * Home
 * ----
 * What we’re doing on this screen:
 * - The feeds are WRITTEN/OWNED by the **platform signer** (server-side).
 * - The topics are keyed by the **user account (subject)**.
 * - Here we:
 *    1) Load the active user account from localStorage (subject).
 *    2) Ask /api/profile for the platform signer (feed owner).
 *    3) Render <ProfileView feedOwner={platformOwner} subject={userAddress} />.
 *
 * Notes:
 * - We use ethers v6 to derive the subject address from the saved private key.
 * - If there’s no active user in storage yet, we prompt the user to create one on /account.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "ethers"; // ethers v6
import ProfileView from "./profile/ProfileView";

// Server reply shape for /api/profile
type ApiOk = { ok: true; owner: `0x${string}`; user?: `0x${string}` };
type ApiErr = { ok: false; error: string };

// LocalStorage keys we agreed to use
const ACTIVE_PK_KEY = "woco.active_pk";     // preferred
const LEGACY_PK_KEY = "demo_user_pk";       // fallback for older local devs

export default function Home() {
  // feedOwner = platform signer (from the server)
  const [platformOwner, setPlatformOwner] = useState<`0x${string}` | null>(null);

  // subject = user address (derived locally from saved private key)
  const [userAddress, setUserAddress] = useState<`0x${string}` | null>(null);

  // misc
  const [error, setError] = useState<string | null>(null);

  /**
   * 1) Load the active user account from localStorage and derive its 0x address.
   *    We DO NOT auto-generate here — Home reflects what’s already chosen.
   *    Use the /account page to create/import/select accounts.
   */
  useEffect(() => {
    try {
      const pk =
        (typeof window !== "undefined" &&
          (localStorage.getItem(ACTIVE_PK_KEY) || localStorage.getItem(LEGACY_PK_KEY))) as `0x${string}` | null;

      if (!pk) {
        setUserAddress(null);
        return; // no active account yet — UI will prompt to visit /account
      }

      const w = new Wallet(pk);
      setUserAddress(w.address as `0x${string}`);
    } catch (e) {
      setError(`Failed to load active account: ${String(e)}`);
    }
  }, []);

  // Preload a cached owner so we don't show "(loading…)" every time
  useEffect(() => {
    try {
      const cached = localStorage.getItem("woco.owner0x") as `0x${string}` | null;
      if (cached && cached.startsWith("0x")) setPlatformOwner(cached);
    } catch {
      /* ignore cache read errors */
    }
  }, []);

  /**
   * 2) Ask the server who the platform signer is (feed owner).
   *    We don’t depend on 'user' here; Home shows the SUBJECT we have locally.
   */
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d: ApiOk | ApiErr) => {
        if ("ok" in d && d.ok && d.owner) {
          // d.owner = platform signer 0x... (feed owner)
          setPlatformOwner(d.owner);
          try { localStorage.setItem("woco.owner0x", d.owner); } catch {}
          console.log("[profile] /api/profile owner:", d.owner, "user:", (d as ApiOk).user);
        } else {
          setError((d as ApiErr).error || "No platform owner returned");
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  // React to "account:changed" without a page reload
  useEffect(() => {
    const onAcct = () => {
      try {
        const pk =
          (localStorage.getItem("woco.active_pk") ||
          localStorage.getItem("demo_user_pk")) as `0x${string}` | null;
        if (!pk) { setUserAddress(null); return; }
        const w = new Wallet(pk);
        setUserAddress(w.address as `0x${string}`);
      } catch { /* ignore */ }
    };
    window.addEventListener("account:changed", onAcct);
    return () => window.removeEventListener("account:changed", onAcct);
  }, []);

  return (
    <main className="min-h-dvh bg-neutral-50 pb-20">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold">Devconnect</span>
          <div className="flex items-center gap-4">
            <Link href="/account" className="text-sm underline">Accounts</Link>
            <Link href="/profile" className="text-sm underline">Edit profile</Link>
            <Link href="/forum"   className="text-sm underline">Forum</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        {/* Account summary */}
        <section className="rounded-xl bg-white border shadow-sm p-4 space-y-1">
          <div className="text-sm font-semibold">Account</div>
          <div className="text-xs text-gray-600">
            Subject (user):{" "}
            <code className="break-all">
              {userAddress ?? "(no active account — go to Accounts to create/select one)"}
            </code>
          </div>
          <div className="text-xs text-gray-600">
            Feed owner (platform signer):{" "}
            <code className="break-all">
              {platformOwner ?? "(loading…)"}
            </code>
          </div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </section>

        {/* Profile viewer — requires BOTH the platform owner and the subject */}
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="mb-3 text-sm font-semibold">My Profile</div>
          {platformOwner && userAddress ? (
            <ProfileView feedOwner={platformOwner} subject={userAddress} />
          ) : (
            <div className="text-sm text-gray-500">
              {error ??
                (!userAddress
                  ? "No active user found. Use the Accounts page to create or select one."
                  : "Loading platform signer…")}
            </div>
          )}

          {/* Small print: show which identity we’re using */}
          <p className="mt-2 text-xs text-gray-500 break-all">
            Viewing profile for: <code>{userAddress ?? "(no subject)"}</code>
            {" · "}
            feed owner: <code>{platformOwner ?? "(unknown)"}</code>
          </p>
        </section>

        {/* Example nav cards (unchanged) */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/programme" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Programme</div>
            <div className="text-xs text-gray-500">Browse sessions & schedule</div>
          </Link>

          <Link href="/map" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Map</div>
            <div className="text-xs text-gray-500">Find venues & rooms</div>
          </Link>

          <Link href="/forum" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Forum</div>
            <div className="text-xs text-gray-500">Discuss sessions & speakers</div>
          </Link>

          <Link href="/profile" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Settings</div>
            <div className="text-xs text-gray-500">Update your profile</div>
          </Link>
        </section>
      </div>
    </main>
  );
}
