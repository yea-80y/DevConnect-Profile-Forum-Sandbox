"use client";

/**
 * Dashboard (formerly Home)
 * -------------------------
 * What we do on this screen:
 * - The feeds are WRITTEN/OWNED by the platform signer (server-side).
 * - The topics are keyed by the SUBJECT (the user identity we display).
 *
 * SUBJECT comes from the auth hook:
 *   - web3  => PARENT address (never show the safe in UI)
 *   - web2  => local account address
 *
 * We:
 *   1) Get SUBJECT from usePostingIdentity (parent/local).
 *   2) Ask /api/profile for the platform signer (feed owner).
 *   3) Render <ProfileView feedOwner={platformOwner} subject={userAddress} />.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProfileView from "../profile/ProfileView";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import PostingAuthNudge from "@/components/auth/PostingAuthNudge";

// >>> helper: validate and narrow a string to a 0x-address template type
function toHexAddress(addr?: string): `0x${string}` | null {
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
}

// Server reply shape for /api/profile
type ApiOk = { ok: true; owner: `0x${string}`; user?: `0x${string}` };
type ApiErr = { ok: false; error: string };


export default function Home() {
  // >>> use the auth hook to get the active identity (parent for web3, local for web2)
  const id = usePostingIdentity();
  
  // feedOwner = platform signer (from the server)
  const [platformOwner, setPlatformOwner] = useState<`0x${string}` | null>(null);

  // subject = user address (derived locally from saved private key)**
  // >>> SUBJECT for UI/profile: web3 -> parent, web2 -> local (safe)
  const userAddress = useMemo<`0x${string}` | null>(() => {
    if (!id.ready) return null;
    const chosen = id.kind === "web3" ? id.parent : id.safe; // string | undefined
    return toHexAddress(chosen); // narrow to `0x${string}` | null
  }, [id.ready, id.kind, id.parent, id.safe]);

  // Only hit the server once auth is truly usable:
  // - local users: immediately
  // - web3 users: once the 712 capability is verified (parent-bound)
  const canFetch =
    id.ready &&
    (id.kind === "local" || (id.kind === "web3" && id.postAuth === "parent-bound"));

  // If you want a top-of-page banner while waiting:
  const authorizing = id.ready && id.kind === "web3" && id.postAuth !== "parent-bound";

  // misc
  const [error, setError] = useState<string | null>(null);

  /**
   * 1) Load the active user account from localStorage and derive its 0x address.
   *    We DO NOT auto-generate here — Home reflects what’s already chosen.
   *    Use the /account page to create/import/select accounts.
   */

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
  let aborted = false;

  async function load() {
    if (!canFetch) return; // ⬅️ do nothing until auth is usable

    try {
      const res = await fetch("/api/profile", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const d: ApiOk | ApiErr = await res.json();
      if (aborted) return;

      if ("ok" in d && d.ok && d.owner) {
        setPlatformOwner(d.owner);
        try { localStorage.setItem("woco.owner0x", d.owner); } catch {}
        console.log("[profile] /api/profile owner:", d.owner, "user:", (d as ApiOk).user);
      } else {
        setError((d as ApiErr).error || "No platform owner returned");
      }
    } catch (e) {
      if (!aborted) setError(String(e));
    }
  }

  load();
  return () => { aborted = true; };
}, [canFetch]); // ⬅️ re-run when auth flips blocked → parent-bound

  // React to "account:changed" without a page reload**


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
        {authorizing && (
          <div className="rounded-xl border p-3 bg-amber-50/70 text-sm mb-2" aria-live="polite">
            Authorizing… please confirm in your wallet.
          </div>
        )}

        {/* Account summary */}
        <section className="rounded-xl bg-white border shadow-sm p-4 space-y-1">
          <div className="text-sm font-semibold">Account</div>
          <div className="text-xs text-gray-600">
            Subject (user):{" "}
            <code className="break-all">
              {/* >>> show a gentle hint to use Login when no subject */}
              {userAddress ?? "(no active account — go to Login to get started)"}
            </code>
          </div>
          <div className="text-xs text-gray-600">
            Feed owner (platform signer):{" "}
            <code className="break-all">
              {platformOwner ?? "(loading…)"}
            </code>
          </div>
          { id.kind === "web3" && (
          <div className="text-xs text-gray-500">
            Debug · parent: <code>{id.parent ?? "(unset)"}</code> · safe: <code>{id.safe ?? "(unset)"}</code> · postAuth: <code>{id.postAuth}</code>
          </div>
        )}
          { id.kind === "web3" && (
          <div className="text-xs text-gray-600">
            Posting: { id.postAuth === "parent-bound" ? "enabled" : "requires authorization" }
          </div>
        )}
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </section>

        {/* Profile viewer — requires BOTH the platform owner and the subject */}
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="mb-3 text-sm font-semibold">My Profile</div>
          {platformOwner && userAddress ? (
            <ProfileView key={userAddress} feedOwner={platformOwner} subject={userAddress} />
          ) : (
            <div className="text-sm text-gray-500">
              {error ?? (!id.ready ? "Preparing your account…" :
                (!userAddress ? "No active user found. Use the Login page to start." : "Loading platform signer…"))}
            </div>
          )}

          {/* Small print: show which identity we’re using */}
          <p className="mt-2 text-xs text-gray-500 break-all">
            Viewing profile for: <code>{userAddress ?? "(no subject)"}</code>
            {" · "}
            feed owner: <code>{platformOwner ?? "(unknown)"}</code>
          </p>

          {/* If this is a web3 session without a valid capability, nudge to authorize */}
          { id.kind === "web3" && id.postAuth !== "parent-bound" && (
            <div className="mt-3">
              <PostingAuthNudge />
            </div>
          )}
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
        {/* >>> testing-only: forget current identity and go back to Login */}
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="text-sm font-semibold mb-2">Testing</div>
          <p className="text-xs text-gray-600 mb-2">
            “Forget identity” clears your local posting key/capability and returns to the Login screen.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-white"
            onClick={async () => {
              try {
                await id.logout(); // clears device-bound identity (hook storage)
                // also clear any legacy keys from the old Accounts flow:
                try {
                  localStorage.removeItem("woco.active_pk");
                  localStorage.removeItem("demo_user_pk");
                } catch {}
                location.href = "/"; // robust redirect back to Login
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


