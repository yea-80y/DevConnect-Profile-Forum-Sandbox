"use client";

/**
 * Collectible View Page
 *
 * Uses query parameter (?id=seriesId) instead of dynamic route
 * to support static export.
 *
 * Display a collectible series with:
 * - Image and details
 * - Edition count (claimed vs available)
 * - Claim button for unclaimed editions
 * - Ownership proof if user already claimed
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { BEE_URL } from "@/config/swarm";
import { claimEdition, deserializePOD, verifyPOD } from "@/lib/pod/create";
import { derivePODKeypair } from "@/lib/pod/keys";
import { getPodSeries, claimPodEdition } from "@/lib/pod/api";
import type { CollectibleSeries } from "@/lib/pod/schema";

interface EditionData {
  edition: number;
  podSerialized: string;
  contentHash: string;
  claimed: boolean;
  claimedBy?: string;
}

function CollectibleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = usePostingIdentity();
  const seriesId = searchParams.get("id");

  // Data state
  const [series, setSeries] = useState<CollectibleSeries | null>(null);
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [userPodKey, setUserPodKey] = useState<string | null>(null);

  // UI state
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimedEditionNumber, setClaimedEditionNumber] = useState<number | null>(null);
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [error, setError] = useState("");

  // Load series data (from Swarm with localStorage fallback)
  useEffect(() => {
    if (!seriesId) {
      setError("No collectible ID provided");
      return;
    }

    const loadSeries = async () => {
      try {
        const result = await getPodSeries(seriesId);

        if (!result.ok || !result.series) {
          setError(result.error || "Collectible not found");
          return;
        }

        const podSeries = result.series;

        // Convert to legacy format for compatibility
        const legacySeries: CollectibleSeries = {
          seriesId: podSeries.seriesId,
          title: podSeries.title,
          description: podSeries.description,
          totalSupply: podSeries.totalSupply,
          creatorPublicKey: podSeries.creatorPodPublicKey,
          imageHash: podSeries.imageHash,
          createdAt: podSeries.createdAt,
        };

        setSeries(legacySeries);
        setEditions(
          podSeries.editions.map((e) => ({
            edition: e.edition,
            podSerialized: "", // Not needed for display
            contentHash: e.podHash,
            claimed: e.claimed,
            claimedBy: e.claimedBy,
          }))
        );

        // Build image URL
        if (podSeries.imageHash) {
          const beeUrl = BEE_URL.replace(/\/$/, "");
          setImageUrl(`${beeUrl}/bzz/${podSeries.imageHash}`);
          console.log("[Collectible] Image URL:", `${beeUrl}/bzz/${podSeries.imageHash}`);
        }
      } catch (err) {
        console.error("Failed to load collectible:", err);
        setError("Failed to load collectible");
      }
    };

    loadSeries();
  }, [seriesId]);

  // Get user's POD public key
  useEffect(() => {
    const getUserPodKey = async () => {
      if (!id.ready || id.kind === "none") return;

      try {
        const wallet = await id.getWalletForPOD();
        if (!wallet) return;

        const podKeys = await derivePODKeypair(wallet);
        setUserPodKey(podKeys.publicKey.hex);
      } catch (err) {
        console.error("Failed to derive POD key:", err);
      }
    };

    getUserPodKey();
  }, [id]);

  // Calculate stats
  const claimedCount = editions.filter(e => e.claimed).length;
  const availableCount = editions.length - claimedCount;
  const userHasClaimed = userPodKey ? editions.some(e => e.claimedBy === userPodKey) : false;
  const userEdition = userHasClaimed
    ? editions.find(e => e.claimedBy === userPodKey)
    : null;

  // Show confirmation before claiming
  const handleClaimClick = () => {
    if (!id.ready || id.kind === "none") {
      setError("Please log in to claim");
      return;
    }

    if (userHasClaimed) {
      setError("You already claimed this collectible");
      return;
    }

    setShowClaimConfirm(true);
    setError("");
  };

  // Handle claim after confirmation
  const handleClaim = useCallback(async () => {
    if (!id.ready || id.kind === "none") {
      setError("Please log in to claim");
      return;
    }

    if (userHasClaimed) {
      setError("You already claimed this collectible");
      return;
    }

    if (!seriesId) {
      setError("Invalid collectible ID");
      return;
    }

    setShowClaimConfirm(false);
    setIsClaiming(true);
    setError("");

    try {
      // Find next available edition
      const availableEdition = editions.find(e => !e.claimed);
      if (!availableEdition) {
        throw new Error("No editions available");
      }

      // Get user's wallet (lazy loading - request POD identity if needed)
      let wallet = await id.getWalletForPOD();
      if (!wallet) {
        // First time creating POD - request POD identity signature
        console.log("[Collectible] No POD identity found - requesting signature...");
        try {
          await id.requestPodIdentity();
          // Try again after generating POD identity
          wallet = await id.getWalletForPOD();
          if (!wallet) {
            throw new Error("Failed to generate POD identity");
          }
        } catch (err) {
          throw new Error(`Failed to setup POD identity: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Get POD keys for signing
      const podKeys = await derivePODKeypair(wallet);

      // Fetch the unclaimed POD from Swarm using the podHash
      console.log(`[Collectible] Fetching POD for edition ${availableEdition.edition} from Swarm...`);
      const podHash = availableEdition.contentHash;
      if (!podHash) {
        throw new Error("POD hash not found for this edition");
      }

      // Download the POD from Swarm /bytes
      const podUrl = `${BEE_URL}/bytes/${podHash}`;
      console.log(`[Collectible] Downloading POD from: ${podUrl}`);
      const podResponse = await fetch(podUrl);
      if (!podResponse.ok) {
        throw new Error(`Failed to fetch POD from Swarm: ${podResponse.status}`);
      }

      const podSerialized = await podResponse.text();
      console.log(`[Collectible] Downloaded POD (${podSerialized.length} bytes)`);

      // Deserialize and verify
      const unclaimedPOD = deserializePOD(podSerialized);
      if (!verifyPOD(unclaimedPOD)) {
        throw new Error("Invalid POD signature");
      }
      console.log(`[Collectible] POD verified successfully`);

      // Claim it (creates new POD signed by claimer - use already-derived POD keys)
      console.log(`[Collectible] Signing claimed POD...`);
      const claimedPOD = await claimEdition(unclaimedPOD, podKeys);
      console.log(`[Collectible] Claimed POD created (${claimedPOD.serialized.length} bytes)`);

      // Upload claim to Swarm
      // Use user's address from identity (wallet object doesn't have address)
      const userAddress = id.kind === "web3" ? id.parent : id.safe;
      console.log(`[Collectible] Uploading claim to Swarm...`);
      console.log(`[Collectible] User address for collection: ${userAddress}`);
      const claimResult = await claimPodEdition({
        seriesId,
        edition: availableEdition.edition,
        claimerPodPublicKey: podKeys.publicKey.hex,
        claimerEthAddress: userAddress as `0x${string}`,
        claimedPodSerialized: claimedPOD.serialized,
      });
      console.log(`[Collectible] Claim result:`, claimResult);

      if (!claimResult.ok) {
        throw new Error(`Claim upload failed: ${claimResult.error}`);
      }

      console.log(`[Collectible] Claim uploaded successfully!`);

      // Reload series to get updated state (bypass cache to get fresh data)
      console.log(`[Collectible] Reloading series to refresh UI...`);
      const updatedSeries = await getPodSeries(seriesId, true); // noCache = true
      if (updatedSeries.ok && updatedSeries.series) {
        setEditions(
          updatedSeries.series.editions.map((e) => ({
            edition: e.edition,
            podSerialized: "",
            contentHash: e.podHash,
            claimed: e.claimed,
            claimedBy: e.claimedBy,
          }))
        );
        console.log(`[Collectible] Series reloaded with fresh data, UI updated`);
      }

      // Set success state with claimed edition number
      setClaimedEditionNumber(availableEdition.edition);
      setClaimSuccess(true);
      console.log(`[Collectible] Claim complete! Edition #${availableEdition.edition} 🎉`);

      // Store in localStorage for immediate display on dashboard
      // Shows as "pending" until confirmed on Swarm
      try {
        const pendingClaim = {
          seriesId,
          seriesTitle: series?.title || "Unknown",
          edition: availableEdition.edition,
          imageHash: series?.imageHash || "",
          claimedPodHash: claimResult.claimedPodHash || "",
          claimedAt: new Date().toISOString(),
          status: "local" as const, // Will change to "swarm" once confirmed
        };
        const existing = JSON.parse(localStorage.getItem("pod:pendingClaims") || "[]");
        // Avoid duplicates
        const filtered = existing.filter(
          (c: any) => !(c.seriesId === seriesId && c.edition === availableEdition.edition)
        );
        filtered.unshift(pendingClaim);
        // Keep only last 20 pending claims
        localStorage.setItem("pod:pendingClaims", JSON.stringify(filtered.slice(0, 20)));
        console.log(`[Collectible] Saved pending claim for immediate dashboard display`);
      } catch (err) {
        console.warn("[Collectible] Failed to save pending claim:", err);
      }

    } catch (err) {
      console.error("Failed to claim:", err);
      setError(err instanceof Error ? err.message : "Failed to claim");
    } finally {
      setIsClaiming(false);
    }
  }, [id, editions, seriesId, userHasClaimed, userPodKey]);

  if (!seriesId || !series) {
    return (
      <div className="min-h-dvh bg-neutral-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">
            {error || "Loading..."}
          </p>
          {error && (
            <Link href="/dashboard/" className="mt-4 inline-block">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-gray-900 pb-20 transition-colors">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b dark:border-gray-700">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard/" className="font-semibold text-gray-900 dark:text-gray-100">
            ← Back
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Main collectible card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          {/* Image */}
          {imageUrl ? (
            <div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-900">
              <Image
                src={imageUrl}
                alt={series.title}
                fill
                className="object-cover"
                unoptimized
                onError={(e) => {
                  console.error('[Collectible] Image failed to load:', imageUrl);
                  setError(`Failed to load image from Swarm: ${series.imageHash}`);
                }}
              />
            </div>
          ) : (
            <div className="w-full aspect-square bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No image</p>
            </div>
          )}

          {/* Details */}
          <div className="p-6 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {series.title}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {series.description}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 py-4 border-y dark:border-gray-700">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-500">Total Editions</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {series.totalSupply}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-500">Available</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {availableCount}
                </p>
              </div>
            </div>

            {/* User status */}
            {userHasClaimed ? (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  ✓ You own edition #{userEdition?.edition}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Your POD is cryptographically signed and proves ownership.
                </p>
              </div>
            ) : availableCount > 0 ? (
              <>
                {/* Success message - shown after claiming */}
                {claimSuccess && claimedEditionNumber && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-4">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      🎉 Successfully claimed edition #{claimedEditionNumber}!
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      Your POD has been cryptographically signed and saved to your collection.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                {/* Confirmation Dialog */}
                {showClaimConfirm && !isClaiming && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Confirm Claim
                      </p>
                      <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                        You're about to sign a POD (Provable Object Data) with your cryptographic key.
                        This will create tamper-proof proof of ownership for this collectible edition.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleClaim}
                        className="flex-1"
                        disabled={isClaiming}
                      >
                        Sign & Claim
                      </Button>
                      <Button
                        onClick={() => setShowClaimConfirm(false)}
                        variant="secondary"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Claim Button */}
                {!showClaimConfirm && (
                  <Button
                    onClick={handleClaimClick}
                    disabled={isClaiming || id.kind === "none"}
                    className="w-full"
                  >
                    {isClaiming ? "Claiming..." : "Claim Edition"}
                  </Button>
                )}

                {id.kind === "none" && !showClaimConfirm && (
                  <p className="text-xs text-center text-gray-500 dark:text-gray-500">
                    <Link href="/" className="underline">Log in</Link> to claim this collectible
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-4">
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  All editions have been claimed
                </p>
              </div>
            )}

            {/* Creator info */}
            <div className="pt-4 border-t dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-500">Creator POD Key</p>
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 break-all">
                {series.creatorPublicKey}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                This is the creator's ed25519 public key used to sign PODs (derived from their Ethereum wallet)
              </p>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            About POD Collectibles
          </h3>
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>• Each edition is cryptographically signed using POD (Provable Object Data)</p>
            <p>• Claiming creates a new POD signed by you, proving ownership</p>
            <p>• Your POD is stored locally and can be verified by anyone</p>
            <p>• All signatures are tamper-proof and verifiable</p>
          </div>
        </div>

        {/* Debug Panel - POD Verification */}
        {userHasClaimed && userEdition && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              🔍 Your POD Proof
            </h3>
            <div className="space-y-3 text-xs font-mono">
              <div>
                <p className="text-gray-500 dark:text-gray-500 mb-1">Edition Number</p>
                <p className="text-gray-900 dark:text-gray-100">#{userEdition.edition}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-500 mb-1">Your POD Public Key</p>
                <p className="text-gray-700 dark:text-gray-300 break-all">{userPodKey}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-500 mb-1">Claimed At</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {new Date().toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-500 mb-1">Storage Location</p>
                <p className="text-gray-700 dark:text-gray-300">
                  localStorage: pod:claimed:{userPodKey?.slice(0, 8)}...:{seriesId?.slice(0, 8)}...
                </p>
              </div>
              {(userEdition as any).claimedPod && (
                <div>
                  <p className="text-gray-500 dark:text-gray-500 mb-1">Signed POD (first 100 chars)</p>
                  <p className="text-gray-700 dark:text-gray-300 break-all">
                    {(userEdition as any).claimedPod.slice(0, 100)}...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CollectiblePage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-neutral-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    }>
      <CollectibleContent />
    </Suspense>
  );
}
