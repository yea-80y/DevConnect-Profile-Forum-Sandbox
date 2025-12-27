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

import { useEffect, useState } from "react";
import Link from "next/link";
import ProfileView from "../profile/ProfileView";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import PostingAuthNudge from "@/components/auth/PostingAuthNudge";
import ThemeToggle from "@/components/ThemeToggle";
import { apiUrl } from "@/config/api";
import { useWalletConnection } from "@/lib/wallet/useWalletConnection";
import WalletWarningBanner from "@/components/wallet/WalletWarningBanner";
import { getPodDirectory, getUserCollection, syncUserCollection } from "@/lib/pod/api";
import type { PodDirectoryEntry, PodCollectionEntry } from "@/lib/pod/types";

// Extended collection entry with storage status
interface CollectionEntryWithStatus extends PodCollectionEntry {
  status: "local" | "swarm";
}
import { BEE_URL } from "@/config/swarm";
import { derivePODKeypair } from "@/lib/pod/keys";

// validate + narrow a string to a 0x-address
function toHexAddress(addr?: string): `0x${string}` | null {
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
}

export default function Home() {
  const id = usePostingIdentity();

  // Wallet connection monitoring (for Web3 users only)
  const wallet = useWalletConnection();

  // platform signer (feed owner) – load after mount to avoid hydration mismatch
  const [platformOwner, setPlatformOwner] = useState<`0x${string}` | null>(null);

  // SUBJECT for UI/profile: web3 -> parent, local -> safe
  const [userAddress, setUserAddress] = useState<`0x${string}` | null>(null);

  // POD Collectibles from Swarm directory (fetched client-side)
  const [collectibles, setCollectibles] = useState<PodDirectoryEntry[]>([]);
  const [collectiblesLoading, setCollectiblesLoading] = useState(true);

  // User's claimed PODs collection (with status)
  const [myCollection, setMyCollection] = useState<CollectionEntryWithStatus[]>([]);
  const [myCollectionLoading, setMyCollectionLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Fetch collectibles from Swarm directory on mount
  useEffect(() => {
    const fetchCollectibles = async () => {
      try {
        const result = await getPodDirectory();
        if (result.ok && result.entries) {
          setCollectibles(result.entries);
        }
      } catch (err) {
        console.error("[dashboard] Failed to fetch collectibles:", err);
      } finally {
        setCollectiblesLoading(false);
      }
    };
    fetchCollectibles();
  }, []);

  // Fetch user's collection when address is available
  // Merges Swarm collection with local pending claims
  useEffect(() => {
    if (!userAddress) {
      setMyCollectionLoading(false);
      return;
    }

    const fetchMyCollection = async () => {
      try {
        // Fetch from Swarm
        const result = await getUserCollection(userAddress);
        const swarmEntries: CollectionEntryWithStatus[] = (result.ok && result.collection)
          ? result.collection.entries.map(e => ({ ...e, status: "swarm" as const }))
          : [];

        // Read pending claims from localStorage
        let pendingClaims: CollectionEntryWithStatus[] = [];
        try {
          const stored = JSON.parse(localStorage.getItem("pod:pendingClaims") || "[]");
          pendingClaims = stored.map((c: any) => ({ ...c, status: "local" as const }));
        } catch {
          // Ignore parse errors
        }

        // Filter out pending claims that are now on Swarm
        const confirmedIds = new Set(
          swarmEntries.map(e => `${e.seriesId}-${e.edition}`)
        );
        const stillPending = pendingClaims.filter(
          c => !confirmedIds.has(`${c.seriesId}-${c.edition}`)
        );

        // Update localStorage to remove confirmed claims
        if (stillPending.length !== pendingClaims.length) {
          try {
            localStorage.setItem("pod:pendingClaims", JSON.stringify(stillPending));
            console.log(`[dashboard] Removed ${pendingClaims.length - stillPending.length} confirmed claims from pending`);
          } catch {
            // Ignore
          }
        }

        // Merge: pending claims first, then Swarm entries
        const merged = [...stillPending, ...swarmEntries];

        // Sort by claimedAt (newest first)
        merged.sort((a, b) =>
          new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime()
        );

        setMyCollection(merged);
      } catch (err) {
        console.error("[dashboard] Failed to fetch user collection:", err);
      } finally {
        setMyCollectionLoading(false);
      }
    };
    fetchMyCollection();
  }, [userAddress]);

  // Sync collection handler
  const handleSyncCollection = async () => {
    if (!userAddress || !id.ready || id.kind === "none") return;

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      // Get user's wallet to derive POD public key
      const wallet = await id.getWalletForPOD();
      if (!wallet) {
        setSyncMessage("Failed to get wallet");
        return;
      }

      const podKeys = await derivePODKeypair(wallet);
      const result = await syncUserCollection(userAddress, podKeys.publicKey.hex);

      if (result.ok) {
        if (result.synced && result.synced > 0) {
          setSyncMessage(`Synced ${result.synced} claim(s)!`);
          // Refresh collection from Swarm
          const updated = await getUserCollection(userAddress, true);
          if (updated.ok && updated.collection) {
            const swarmEntries = updated.collection.entries.map(e => ({
              ...e,
              status: "swarm" as const,
            }));
            // Clear pending claims that are now on Swarm
            try {
              const pending = JSON.parse(localStorage.getItem("pod:pendingClaims") || "[]");
              const confirmedIds = new Set(swarmEntries.map(e => `${e.seriesId}-${e.edition}`));
              const stillPending = pending.filter(
                (c: any) => !confirmedIds.has(`${c.seriesId}-${c.edition}`)
              );
              localStorage.setItem("pod:pendingClaims", JSON.stringify(stillPending));
            } catch {}
            setMyCollection(swarmEntries);
          }
        } else {
          setSyncMessage("No new claims found");
        }
      } else {
        setSyncMessage(result.error || "Sync failed");
      }
    } catch (err) {
      console.error("[dashboard] Sync failed:", err);
      setSyncMessage("Sync failed");
    } finally {
      setIsSyncing(false);
      // Clear message after 3 seconds
      setTimeout(() => setSyncMessage(null), 3000);
    }
  };

  // Load cached values on mount (after hydration)
  useEffect(() => {
    try {
      const cachedOwner = localStorage.getItem("woco.owner0x") as `0x${string}` | null;
      if (cachedOwner && cachedOwner.startsWith("0x")) {
        setPlatformOwner(cachedOwner);
      }

      const cachedSubject = localStorage.getItem("woco.subject0x") as `0x${string}` | null;
      if (cachedSubject && /^0x[0-9a-fA-F]{40}$/.test(cachedSubject)) {
        setUserAddress(cachedSubject);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Update userAddress when identity becomes ready
  useEffect(() => {
    if (!id.ready) return;
    const chosen = id.kind === "web3" ? id.parent : id.safe;
    const validated = toHexAddress(chosen);
    if (validated !== userAddress) {
      setUserAddress(validated);
    }
  }, [id.ready, id.kind, id.parent, id.safe, userAddress]);

  // Show top banner while a web3 session is authorizing EIP-712
  const authorizing = id.ready && id.kind === "web3" && id.postAuth !== "parent-bound";

  // 1) Keep owner in sync with ClientProviders via event
  useEffect(() => {
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
    <main className="min-h-dvh bg-neutral-50 dark:bg-gray-900 pb-20 transition-colors">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b dark:border-gray-700">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Devconnect</span>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/account" className="text-sm text-gray-900 dark:text-gray-100 underline">Accounts</Link>
            <Link href="/profile" className="text-sm text-gray-900 dark:text-gray-100 underline">Edit profile</Link>
            <Link href="/forum" className="text-sm text-gray-900 dark:text-gray-100 underline">Forum</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        {/* Recent Updates Banner */}
        <section className="rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 shadow-sm p-4">
          <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">📢 Recent Updates (Dec 25)</div>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside mb-3">
            <li>POD collectibles now live - create limited editions, claim with cryptographic proof, and build your collection</li>
            <li>Dark mode toggle with user preference saving across sessions</li>
            <li>Enhanced Swarm verification and streamlined profile upload/display logic</li>
          </ul>

          <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 mt-4">🚀 Next Steps</div>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
            <li>Enhance forum with improved loading, caching, and rendering performance.</li>
            <li>Expand POD capabilities: event tickets, loyalty points, and achievement badges.</li>
            <li>Enable simple Web2 access through an email login option.</li>
            <li>Support additional authentication options for Web3 users.</li>
          </ul>
        </section>

        {authorizing && (
          <div className="rounded-xl border p-3 bg-amber-50/70 dark:bg-amber-900/30 text-sm mb-2" aria-live="polite">
            Authorizing… please confirm in your wallet.
          </div>
        )}

        {/* Wallet disconnected warning (Web3 users only) */}
        {id.kind === "web3" && wallet.isConnected === false && (
          <WalletWarningBanner onReconnect={wallet.reconnect} />
        )}

        {/* Account summary */}
        <section className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4 space-y-1">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Subject (user):{" "}
            <code className="break-all" suppressHydrationWarning>
              {userAddress ?? "(no active account — go to Login to get started)"}
            </code>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Feed owner (platform signer):{" "}
            <code className="break-all" suppressHydrationWarning>
              {platformOwner ?? "(loading…)"}
            </code>
          </div>
          {id.kind === "web3" && (
            <div className="text-xs text-gray-500 dark:text-gray-500">
              Debug · parent: <code>{id.parent ?? "(unset)"}</code> · safe: <code>{id.safe ?? "(unset)"}</code> · postAuth: <code>{id.postAuth}</code>
            </div>
          )}
          {id.kind === "web3" && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Posting: {id.postAuth === "parent-bound" ? "enabled" : "requires authorization"}
            </div>
          )}
        </section>

        {/* Profile viewer — requires BOTH the platform owner and the subject */}
        <section className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4" suppressHydrationWarning>
          <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">My Profile</div>
          {platformOwner && userAddress ? (
            <ProfileView key={userAddress} feedOwner={platformOwner} subject={userAddress} />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {!id.ready
                ? "Preparing your account…"
                : !userAddress
                  ? "No active user found. Use the Login page to start."
                  : "Loading platform signer…"}
            </div>
          )}

          {/* Small print: which identity we're using */}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 break-all">
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

        {/* My Collection Section - User's claimed PODs */}
        <section className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">My Collection</div>
            <div className="flex items-center gap-2">
              {syncMessage && (
                <span className="text-xs text-green-600 dark:text-green-400">{syncMessage}</span>
              )}
              <button
                onClick={handleSyncCollection}
                disabled={isSyncing || !userAddress}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {myCollection.length} {myCollection.length === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Your claimed POD collectibles - cryptographically signed proof of ownership.
          </p>
          <div className="space-y-2">
            {myCollectionLoading ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                Loading your collection...
              </div>
            ) : !userAddress ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                Log in to see your collection
              </div>
            ) : myCollection.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                No collectibles yet. Browse the POD Collectibles below to claim some!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {myCollection.map((entry) => (
                  <Link
                    key={`${entry.seriesId}-${entry.edition}`}
                    href={`/collectible/?id=${entry.seriesId}`}
                    className="block rounded-lg border dark:border-gray-700 overflow-hidden hover:border-blue-500 dark:hover:border-blue-400 transition group"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gray-100 dark:bg-gray-900 relative">
                      <img
                        src={`${BEE_URL}/bzz/${entry.imageHash}`}
                        alt={entry.seriesTitle}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text fill="%239CA3AF" x="50" y="55" text-anchor="middle" font-size="12">No image</text></svg>';
                        }}
                      />
                      {/* Edition badge */}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                        #{entry.edition}
                      </div>
                      {/* Status badge */}
                      <div className={`absolute top-1 left-1 text-xs px-1.5 py-0.5 rounded ${
                        entry.status === "swarm"
                          ? "bg-green-500/90 text-white"
                          : "bg-yellow-500/90 text-black"
                      }`}>
                        {entry.status === "swarm" ? "Swarm" : "Local"}
                      </div>
                    </div>
                    {/* Info */}
                    <div className="p-2">
                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {entry.seriesTitle}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                        Claimed {new Date(entry.claimedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Collectibles Section */}
        <section className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">POD Collectibles</div>
            <Link href="/create-collectible" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Create New
            </Link>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Browse and claim limited edition collectibles, or create your own.
          </p>
          <div className="space-y-2">
            {/* List available collectibles from Swarm directory */}
            {collectiblesLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                Loading collectibles...
              </div>
            ) : collectibles.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                No collectibles yet. <Link href="/create-collectible" className="underline text-blue-600 dark:text-blue-400">Create the first one!</Link>
              </div>
            ) : (
              collectibles.map((entry) => (
                <Link
                  key={entry.seriesId}
                  href={`/collectible/?id=${entry.seriesId}`}
                  className="block rounded-lg border dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition"
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {entry.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {entry.claimedCount}/{entry.totalSupply} claimed
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Nav cards */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/programme" className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Programme</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Browse sessions & schedule</div>
          </Link>

          <Link href="/map" className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Map</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Find venues & rooms</div>
          </Link>

          <Link href="/forum" className="rounded-xl bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-600 shadow-md p-4 hover:bg-blue-700 dark:hover:bg-blue-600 transition">
            <div className="text-sm font-bold text-white">Forum</div>
            <div className="text-xs text-blue-100 dark:text-blue-200">Discuss sessions & speakers</div>
          </Link>

          <Link href="/profile" className="rounded-xl bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-600 shadow-md p-4 hover:bg-blue-700 dark:hover:bg-blue-600 transition">
            <div className="text-sm font-bold text-white">Settings</div>
            <div className="text-xs text-blue-100 dark:text-blue-200">Update your profile</div>
          </Link>
        </section>

        {/* Testing: forget identity */}
        <section className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Testing</div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            "Forget identity" clears your local posting key/capability and returns to the Login screen.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-lg bg-black dark:bg-gray-700 px-4 py-2 text-white hover:bg-gray-800 dark:hover:bg-gray-600 transition"
            onClick={async () => {
              try {
                // ✅ Clear ALL localStorage first (before logout)
                // EXCEPT theme preference so dark mode persists
                try {
                  const keys = Object.keys(localStorage);
                  keys.forEach(key => {
                    if (key === 'woco.theme') return; // Preserve theme preference
                    // Clear profile, woco, and pod data
                    if (key.startsWith('profile:') || key.startsWith('woco.') || key.startsWith('pod:')) {
                      localStorage.removeItem(key);
                    }
                  });
                } catch {}

                await id.logout();

                try { await fetch(apiUrl("/api/auth/logout"), { method: "POST" }); } catch {}

                // Force full page reload to ensure IndexedDB writes commit
                // Client-side navigation (router.push) happens too fast on Windows
                // Use base path to ensure redirect works on Swarm deployment
                const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
                window.location.href = basePath ? `${basePath}/` : "/";
              } catch (e) {
                console.error("forget identity failed", e);
              }
            }}
          >
            Forget identity (testing)
          </button>
        </section>

        {/* Discord Bug Reporting */}
        <section className="rounded-xl bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 shadow-sm p-4">
          <div className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">Need Help?</div>
          <p className="text-xs text-purple-800 dark:text-purple-200 mb-3">
            Found a bug or have feedback? Join our Discord community to report issues and discuss improvements.
          </p>
          <a
            href="https://discord.gg/tPxAK5WHcb"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 underline"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span>🐛 Report bugs on Discord</span>
          </a>
        </section>
      </div>
    </main>
  );
}
