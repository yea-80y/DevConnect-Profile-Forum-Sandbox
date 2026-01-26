"use client";

/**
 * Create Collectible Page
 *
 * Mobile-friendly UI for creators to mint collectible PODs.
 * Flow:
 * 1. Upload image
 * 2. Enter title & description
 * 3. Set number of editions
 * 4. Mint all editions (sign with POD keys)
 * 5. Upload to Swarm
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import StaticLink from "@/components/StaticLink";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/config/api";
import { BEE_URL, POSTAGE_BATCH_ID } from "@/config/swarm";
import { createCollectibleSeries, generateSeriesId } from "@/lib/pod/create";
import { derivePODKeypair } from "@/lib/pod/keys";
import { createPodSeries } from "@/lib/pod/api";
import type { CollectibleSeries } from "@/lib/pod/schema";
import type { CreateSeriesRequest } from "@/lib/pod/types";

export default function CreateCollectiblePage() {
  const router = useRouter();
  const id = usePostingIdentity();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalSupply, setTotalSupply] = useState(100);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Success state - tracks completed creation
  const [createdSeriesId, setCreatedSeriesId] = useState<string | null>(null);

  // Handle image selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB");
      return;
    }

    setImageFile(file);
    setError("");

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Upload image to Swarm (using bee-js like profile uploads)
  const uploadImageToSwarm = async (file: File): Promise<string> => {
    if (!POSTAGE_BATCH_ID) {
      throw new Error("POSTAGE_BATCH_ID not configured");
    }

    // Use bee-js library (same as profile image uploads)
    const { Bee } = await import("@ethersphere/bee-js");
    const bee = new Bee(BEE_URL);

    // Upload file to immutable /bzz endpoint with retry logic built-in
    const uploadRes = await bee.uploadFile(POSTAGE_BATCH_ID, file, file.name);

    // Get 64-hex reference
    const imageRefHex = uploadRes.reference.toHex();

    // Ensure exactly 64 hex chars
    const cleanRef = imageRefHex.startsWith("0x")
      ? imageRefHex.slice(2).toLowerCase()
      : imageRefHex.toLowerCase();

    if (!/^[0-9a-f]{64}$/i.test(cleanRef)) {
      throw new Error(`Invalid image reference format: ${cleanRef}`);
    }

    console.log("[POD] Image uploaded to Swarm:", {
      reference: cleanRef,
      url: `${BEE_URL}/bzz/${cleanRef}`,
    });

    return cleanRef;
  };

  // Show confirmation before creating
  const handleCreateClick = () => {
    // Validation
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }
    if (!description.trim()) {
      setError("Please enter a description");
      return;
    }
    if (!imageFile) {
      setError("Please select an image");
      return;
    }
    if (totalSupply < 1 || totalSupply > 127) {
      setError("Number of editions must be between 1 and 127");
      return;
    }
    if (!id.ready || id.kind === "none") {
      setError("Please log in to create collectibles");
      return;
    }

    setShowCreateConfirm(true);
    setError("");
  };

  // Create collectible series after confirmation
  const handleCreate = async () => {
    setShowCreateConfirm(false);
    setIsCreating(true);
    setError("");
    setProgress("Preparing...");

    try {
      // Validate image file
      if (!imageFile) {
        throw new Error("No image selected");
      }

      // Step 1: Upload image to Swarm
      setProgress("Uploading image to Swarm...");
      const imageHash = await uploadImageToSwarm(imageFile);
      console.log("Image uploaded:", imageHash);

      // Step 2: Get creator's wallet (for signing PODs)
      // We need access to the actual wallet instance, not just the hook
      // For now, we'll need to pass this through the auth system
      // TODO: Add a method to usePostingIdentity to get the wallet for POD signing

      setProgress("Deriving POD signing keys...");

      // Get wallet for POD signing (lazy loading - request POD identity if needed)
      let wallet = await id.getWalletForPOD();
      if (!wallet) {
        // First time creating POD - request POD identity signature
        console.log("[CreateCollectible] No POD identity found - requesting signature...");
        setProgress("Requesting POD identity signature...");
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

      // Derive POD keypair from Ethereum wallet (or seed for web3 users)
      const podKeys = await derivePODKeypair(wallet);
      console.log("POD public key:", podKeys.publicKey.hex);

      setProgress(`Minting ${totalSupply} editions...`);

      // Step 3: Create series metadata
      const seriesId = generateSeriesId();
      const createdAt = new Date().toISOString();

      const series: CollectibleSeries = {
        seriesId,
        title: title.trim(),
        description: description.trim(),
        totalSupply,
        creatorPublicKey: podKeys.publicKey.hex,
        imageHash,
        createdAt,
      };

      // Step 4: Sign all editions with POD keys (already derived above)
      const signedEditions = await createCollectibleSeries(series, podKeys);
      console.log(`Minted ${signedEditions.length} signed POD editions`);

      setProgress("Uploading PODs to Swarm...");

      // Step 5: Upload to Swarm via API (with localStorage fallback)
      const ethAddress = id.kind === "web3" ? id.parent : id.safe;
      const request: CreateSeriesRequest = {
        series: {
          seriesId,
          title: series.title,
          description: series.description,
          imageHash,
          creatorPodPublicKey: podKeys.publicKey.hex,
          creatorEthAddress: ethAddress as `0x${string}` | undefined,
          totalSupply,
          createdAt,
        },
        signedPods: signedEditions.map((pod, i) => ({
          edition: i + 1,
          podSerialized: pod.serialized,
        })),
      };

      const result = await createPodSeries(request);

      if (result.ok && result.storageStatus === "swarm") {
        // Success! POD is on Swarm
        setProgress("✅ Successfully uploaded to Swarm!");
        setCreatedSeriesId(seriesId);
        setIsCreating(false);
      } else {
        // Upload failed
        throw new Error(result.error || "Failed to upload to Swarm");
      }

    } catch (err) {
      console.error("Failed to create collectible:", err);
      setError(err instanceof Error ? err.message : "Failed to create collectible");
      setProgress("");
      setIsCreating(false);
    }
  };

  // Not logged in
  if (!id.ready) {
    return (
      <div className="min-h-dvh bg-neutral-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (id.kind === "none") {
    return (
      <div className="min-h-dvh bg-neutral-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Login Required</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You need to be logged in to create collectibles.
          </p>
          <StaticLink href="/">
            <Button>Go to Login</Button>
          </StaticLink>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-gray-900 pb-20 transition-colors">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b dark:border-gray-700">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <StaticLink href="/dashboard" className="font-semibold text-gray-900 dark:text-gray-100">
            ← Back
          </StaticLink>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Success State */}
        {createdSeriesId && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-6 text-center space-y-4">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-bold text-green-900 dark:text-green-100">
              Collectible Created!
            </h2>
            <p className="text-sm text-green-800 dark:text-green-200">
              Your collectible "{title}" with {totalSupply} editions has been uploaded to Swarm.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                onClick={() => router.push(`/collectible/?id=${createdSeriesId}`)}
                className="bg-green-600 hover:bg-green-700"
              >
                View Collectible
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  // Reset form for new creation
                  setCreatedSeriesId(null);
                  setTitle("");
                  setDescription("");
                  setTotalSupply(100);
                  setImageFile(null);
                  setImagePreview(null);
                  setProgress("");
                  setError("");
                }}
              >
                Create Another
              </Button>
            </div>
          </div>
        )}

        {/* Header - hide when success */}
        {!createdSeriesId && (
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Create Collectible
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Mint a limited edition collectible that others can claim.
            </p>
          </div>
        )}

        {/* Form - hide when success */}
        {!createdSeriesId && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              Image *
            </label>
            {imagePreview ? (
              <div className="relative w-full aspect-square max-w-sm mx-auto">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  fill
                  className="object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label htmlFor="collectible-image-upload" className="block w-full aspect-square max-w-sm mx-auto border-2 border-dashed dark:border-gray-600 rounded-lg cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition">
                <div className="flex flex-col items-center justify-center h-full">
                  <svg className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Click to upload image</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Max 5MB</p>
                </div>
                <input
                  id="collectible-image-upload"
                  name="collectible-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              Title *
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title for collectible..."
              maxLength={100}
              disabled={isCreating}
            />
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {title.length}/100 characters
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell the story behind this collectible..."
              maxLength={500}
              rows={4}
              disabled={isCreating}
              className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-900 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {description.length}/500 characters
            </p>
          </div>

          {/* Number of Editions */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              Number of Editions *
            </label>
            <Input
              type="number"
              value={totalSupply}
              onChange={(e) => setTotalSupply(Math.max(1, Math.min(127, parseInt(e.target.value) || 1)))}
              min={1}
              max={127}
              disabled={isCreating}
            />
            <p className="text-xs text-gray-500 dark:text-gray-500">
              How many editions should be available for claiming? (1-127)
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Confirmation Dialog */}
          {showCreateConfirm && !isCreating && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Confirm Creation
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                  You're about to mint {totalSupply} edition{totalSupply !== 1 ? 's' : ''} of "{title}".
                  Each edition will be cryptographically signed with your POD key, creating permanent
                  proof of authorship. This action will upload the image to Swarm.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  className="flex-1"
                  disabled={isCreating}
                >
                  Sign & Create
                </Button>
                <Button
                  onClick={() => setShowCreateConfirm(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Progress */}
          {isCreating && progress && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">{progress}</p>
            </div>
          )}

          {/* Create Button */}
          {!showCreateConfirm && (
            <Button
              onClick={handleCreateClick}
              disabled={isCreating || !title || !description || !imageFile}
              className="w-full"
            >
              {isCreating ? "Creating..." : `Create ${totalSupply} Editions`}
            </Button>
          )}

          {/* Info */}
          <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
            <p>• All editions will be cryptographically signed with your identity</p>
            <p>• Each edition can be claimed by one person</p>
            <p>• Claiming works offline after initial creation</p>
            <p>• Your collectible will be stored on Swarm (decentralized storage)</p>
          </div>
        </div>
        )}
      </div>
    </main>
  );
}
