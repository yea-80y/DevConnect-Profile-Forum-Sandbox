// src/app/profile/ProfileTab.tsx
"use client";

/**
 * ProfileTab (Platform signer writes, per-user topics)
 * ---------------------------------------------------
 * Architecture:
 * - The server holds a **platform signer** (feed owner). It writes feed payloads via /api/profile.
 * - The UI has (or creates) a **user account** (subject). We key topics by this address:
 *      devconnect/profile/name/{subjectNo0x}
 *      devconnect/profile/avatar/{subjectNo0x}
 * - We POST the subject with each write so the backend can derive per-user topics.
 *
 * Flow:
 *  1) User types a Display Name (optional).
 *  2) User picks an avatar image (optional).
 *  3) Save:
 *      - If name present → POST /api/profile { kind: "name", payload: { name, subject } }
 *      - If avatar present:
 *          a) Upload the image to /bzz → get immutable 64-hex reference
 *          b) POST /api/profile { kind: "avatar", payload: { imageRef, subject } }
 *  4) Immediately update UI **in-state** (applyLocalUpdate) so no extra reads are needed.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bee, Topic } from "@ethersphere/bee-js";
import Image from "next/image";
import { BEE_URL, POSTAGE_BATCH_ID } from "@/config/swarm";
import ProfileView from "./ProfileView";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorModal } from "@/components/ui/ErrorModal";
import { FEED_NS } from "@/lib/swarm-core/topics";
import { useProfile } from "@/lib/profile/context";
import { apiUrl } from "@/config/api";
import { invalidateAvatarCache } from "@/lib/avatar";

// NEW: source of truth for WHO the user is (subject).
// - Web3  → parent wallet address (NOT the safe)
// - Local → main address derived from local PK
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { useWalletConnection } from "@/lib/wallet/useWalletConnection";
import WalletWarningBanner from "@/components/wallet/WalletWarningBanner";
import type { CapabilityBundle } from "@/lib/auth/types";

function to64Hex(s: string | null | undefined): string {
  if (!s) throw new Error("missing ref")
  const h = s.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "")
  if (h.length !== 64) throw new Error(`bad ref length: ${h.length}`)
  return h
}

/* ----------------------------- Types (client) ----------------------------- */

type Hex0x = `0x${string}`

/* ------------------------ LocalStorage keys (client) ---------------------- */

//const ACTIVE_PK_KEY = "woco.active_pk"; // new key we use in this demo
//const LEGACY_PK_KEY = "demo_user_pk";   // fallback if present in your older flow

/* -------------------------------- API helper ------------------------------ */

async function postProfile(
  body: unknown,
  options?: {
    postingKind?: "local" | "web3";
    capability?: CapabilityBundle;
  }
): Promise<{ ok: true; owner: Hex0x } | never> {
  const headers: Record<string, string> = { "content-type": "application/json" };

  // Add posting kind header if specified
  if (options?.postingKind) {
    headers["x-posting-kind"] = options.postingKind;
  }

  // Include capability in body for web3 users
  const finalBody = options?.capability
    ? { ...body as object, capability: options.capability }
    : body;

  const r = await fetch(apiUrl("/api/profile"), {
    method: "POST",
    headers,
    body: JSON.stringify(finalBody),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `POST /api/profile failed: ${r.status}`);
  }
  const j = (await r.json()) as { ok: boolean; owner?: string };
  if (!j.ok || !j.owner || !j.owner.startsWith("0x")) {
    throw new Error("Server did not return a valid owner address");
  }
  return { ok: true, owner: j.owner as Hex0x };
}

/* --------------------------------- Component ------------------------------ */

export default function ProfileTab() {
  const bee = useMemo(() => new Bee(BEE_URL), []);
  const { applyLocalUpdate } = useProfile();

  // Form state
  const [displayName, setDisplayName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreviewInProfile, setShowPreviewInProfile] = useState(false); // Only show in ProfileView after save click

  // UI state
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Upload status for badge
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

  // Debug: Log uploadStatus changes
  useEffect(() => {
    console.log('[ProfileTab] uploadStatus changed to:', uploadStatus);
  }, [uploadStatus]);

  // Error modal state
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Platform signer's feed owner (WITH 0x, returned by the server after each POST)
  const [owner0x, setOwner0x] = useState<Hex0x | null>(null);

  // Active user account (subject) loaded from localStorage (created on the Account/Home screens)**

  // Preload cached platform owner (so the read panel can render immediately)
  useEffect(() => {
    try {
      const cached = localStorage.getItem("woco.owner0x") as Hex0x | null;
      if (cached && cached.startsWith("0x")) setOwner0x(cached);
    } catch { /* ignore */ }
  }, []);
  

  /**
   * Load the active user private key from localStorage and derive address (subject).
   * Keys:
   *  - "woco.active_pk"   → preferred (new)
   *  - "demo_user_pk"     → legacy fallback if present
   */
  // NEW: use the auth hook for WHO the user is (subject).
  // - Web3  → parent wallet address (NOT the safe)
  // - Local → main address derived from local PK
  const id = usePostingIdentity();

  // Wallet connection monitoring (for Web3 users only)
  const wallet = useWalletConnection();

  /**
   * Subject resolution (single source of truth)
   * 1) Prefer auth hook subject when ready:
   *    - Web3: parent wallet address
   *    - Local: local main address
   * 2) Fallback for legacy/local-only setups: derive from stored PK.
   *    (Keeps your older flow working.)
   */
  /**
   * Subject resolution (no fallback)
   * - Web3 → parent (0x…)
   * - Local → safe  (0x… your local main addr)
   * - None → null   (force user prompt to log in / create account)
   */
  const subject0x = useMemo<Hex0x | null>(() => {
    if (!id?.ready) return null;
    const addr =
      id.kind === "web3" ? id.parent :
      id.kind === "local" ? id.safe   :
      undefined;

    return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Hex0x) : null;
  }, [id?.ready, id?.kind, id?.parent, id?.safe]);


  // Keep the current subject visible to the provider (and listeners)
  useEffect(() => {
    // only once auth has hydrated
    if (!id?.ready) return;

    try {
      if (subject0x) {
        // some providers read this on mount to know "which profile" they manage
        localStorage.setItem("woco.subject0x", subject0x);

        // (optional but helpful) notify any listeners that the account changed
        // many flows used to listen to this to re-hydrate
        window.dispatchEvent(new Event("account:changed"));
      } else {
        localStorage.removeItem("woco.subject0x");
        window.dispatchEvent(new Event("account:changed"));
      }
    } catch { /* ignore */ }
  }, [id?.ready, subject0x]);

  // ✅ REMOVED: Background verification on page load
  // Reason: Causes confusing "Backing up to Swarm" badge when not uploading
  // The profile loads optimistically from cache (handled by ProfileProvider)
  // Verification only happens during actual uploads (see handleSave below)

  // Avatar preview when user picks a file
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // ✅ CRITICAL: Prevent duplicate submissions while upload is in progress
    if (busy) {
      console.log('[profile] Save already in progress, ignoring duplicate click');
      return;
    }

    // Layer 3: Check wallet connection before saving profile (Web3 users only)
    if (id.kind === "web3" && wallet.isConnected === false) {
      setErr("Your wallet is disconnected. Please reconnect your wallet to save your profile.");
      setShowErrorModal(true);
      return;
    }

    setErr(null);
    setSaved(false);
    setBusy(true);
    setUploadStatus('uploading');

    try {
      if (!POSTAGE_BATCH_ID) throw new Error("Set NEXT_PUBLIC_POSTAGE_BATCH_ID in .env.local");
      if (!subject0x) throw new Error("No active account – create/select one on the Accounts/Home screen first.");

      // Web3 users must have authorized posting capability
      if (id.kind === "web3" && id.postAuth !== "parent-bound") {
        throw new Error("Please authorize posting first. Your wallet will ask you to sign a message.");
      }

      // Compute once, reuse in both blocks (name + avatar)
      const subjectNo0x = subject0x.slice(2).toLowerCase();

      // ✅ OPTIMISTIC: Update UI immediately BEFORE uploading
      const nameToSave = displayName.trim();
      const avatarFile = fileRef.current?.files?.[0] ?? null;

      // Track what we uploaded for verification later
      let uploadedAvatarRef: string | null = null;

      if (nameToSave) {
        applyLocalUpdate({ name: nameToSave });
      }

      // ✅ OPTIMISTIC: Show avatar preview NOW (when user clicks save)
      if (previewUrl && avatarFile) {
        setShowPreviewInProfile(true);
      }

      // Get capability bundle for web3 users
      const capability = id.kind === "web3" ? await id.getCapabilityBundle() : undefined;
      const postingKind = id.kind === "web3" ? "web3" : id.kind === "local" ? "local" : undefined;

      // (1) Save display name (optional) → topic keyed by subject
      if (nameToSave) {
        // Create signed payload
        const signMessage = JSON.stringify({ kind: "name", subject: subject0x, name: nameToSave });
        const signature = await id.signPost(signMessage) as `0x${string}`;

        const { owner } = await postProfile(
          {
            kind: "name",
            payload: { name: nameToSave, subject: subject0x, signature }
          },
          { postingKind, capability: capability ?? undefined }
        );
        setOwner0x(owner);
        // NEW: persist owner so ProfileProvider can see it on mount
        try { localStorage.setItem("woco.owner0x", owner); } catch {}

        // ✅ No need for manual caching - applyLocalUpdate() already did it above
        // ProfileProvider persists to localStorage automatically via its useEffect

        // DEBUG: feed GET for the name (topic derived from SUBJECT)
        const topicStr = `${FEED_NS}/name/${subjectNo0x}`;
        const topicHex = Topic.fromString(topicStr).toString();
        console.log("[profile] name saved via platform signer", {
          feedOwner0x: owner,
          subject0x,
          topicStr,
          topicHex,
          feedGET: `${BEE_URL}/feeds/${owner}/${topicHex}`,
        });
      }

      // (2) Upload avatar (if chosen) → immutable BZZ ref → save avatar feed for SUBJECT
      if (avatarFile) {
        const uploadRes = await bee.uploadFile(POSTAGE_BATCH_ID, avatarFile, avatarFile.name);
        const imageRefHex = uploadRes.reference.toHex();
        const cleanRef = to64Hex(imageRefHex); // <-- ensure exactly 64-hex
        uploadedAvatarRef = cleanRef; // Save for verification

        console.log("[profile] avatar uploaded (immutable BZZ)", {
          imageRefHex: cleanRef,
          bzz: `${BEE_URL}/bzz/${cleanRef}`,
        });

        // Create signed payload
        const signMessage = JSON.stringify({ kind: "avatar", subject: subject0x, imageRef: cleanRef });
        const signature = await id.signPost(signMessage) as `0x${string}`;

        const { owner } = await postProfile(
          {
            kind: "avatar",
            payload: { imageRef: cleanRef, subject: subject0x, signature }
          },
          { postingKind, capability: capability ?? undefined }
        );
        setOwner0x(owner);
        try { localStorage.setItem("woco.owner0x", owner); } catch {}

        // Update to real Swarm reference (replaces preview)
        applyLocalUpdate({ avatarRef: cleanRef, avatarMarker: Date.now().toString(16) });

        // Invalidate avatar cache so forum shows new avatar immediately
        invalidateAvatarCache(subject0x);

        // Clear preview state + input (ProfileView will now show Swarm URL)
        setPreviewUrl(null);
        setShowPreviewInProfile(false);
        if (fileRef.current) fileRef.current.value = "";

        // DEBUG: feed GET for the avatar (topic derived from SUBJECT)
        const topicStr = `${FEED_NS}/avatar/${subjectNo0x}`;
        const topicHex = Topic.fromString(topicStr).toString();
        console.log("[profile] avatar feed updated via platform signer", {
          feedOwner0x: owner,
          subject0x,
          topicStr,
          topicHex,
          feedGET: `${BEE_URL}/feeds/${owner}/${topicHex}`,
        });
      }

      // ✅ OPTIMISTIC: Profile updated immediately (via applyLocalUpdate above)
      // Now back up to Swarm in background and verify
      setSaved(true);

      // ✅ Background verification with retry logic (fast: 1-4s instead of 10-12s)
      (async () => {
        try {
          // If no avatar was uploaded, name-only updates succeed immediately
          if (!uploadedAvatarRef) {
            console.log('[profile] ✅ Name-only update completed');
            setUploadStatus('success');
            // No need to dispatch profile:updated - applyLocalUpdate already updated ProfileProvider
            return;
          }

          // Avatar was uploaded - show "Backing up to Swarm..." and verify
          setUploadStatus('uploading');
          console.log('[profile] Starting Swarm backup verification...');

          // Step 1: Verify image is retrievable (with retry for network propagation)
          console.log('[profile] Verifying image accessibility...');
          const avatarUrl = `${BEE_URL}/bzz/${uploadedAvatarRef}`;

          // Retry with exponential backoff: 0ms, 500ms, 1s, 2s
          let imageAccessible = false;
          for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt > 0) {
              const delay = Math.pow(2, attempt - 1) * 500;
              console.log(`[profile] Retry ${attempt}/3 after ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
            }

            const check = await fetch(avatarUrl, { method: 'HEAD' });
            if (check.ok) {
              imageAccessible = true;
              console.log(`[profile] ✅ Image verified on Swarm (attempt ${attempt + 1})`);
              break;
            }
          }

          if (!imageAccessible) {
            console.error('[profile] ⚠️ Image not accessible on Swarm after retries');
            setUploadStatus('error');
            return;
          }

          // Step 2: Verify feed points to new image (OPTIONAL - don't fail if this errors)
          try {
            console.log('[profile] Verifying feed update...');
            const avatarTopic = Topic.fromString(`${FEED_NS}/avatar/${subjectNo0x}`);
            const feedReader = bee.makeFeedReader(avatarTopic, owner0x as `0x${string}`);
            const latest = await feedReader.downloadReference();
            const currentFeedRef = latest.reference.toHex().toLowerCase();
            const expectedRef = uploadedAvatarRef.toLowerCase();

            if (currentFeedRef !== expectedRef) {
              console.warn('[profile] Feed pointing to different image (may still be propagating):', { currentFeedRef, expectedRef });
            } else {
              console.log('[profile] ✅ Feed verified pointing to new image');
            }
          } catch (feedErr) {
            // Feed verification is optional - it may 404 if feed hasn't propagated yet
            console.warn('[profile] Feed verification skipped (propagation delay or 404):', feedErr instanceof Error ? feedErr.message : feedErr);
          }

          // Success - image is accessible (feed check is optional bonus)
          console.log('[profile] ✅ Backup verified, profile saved to Swarm');
          setUploadStatus('success');

          // No need to dispatch profile:updated - applyLocalUpdate already updated ProfileProvider
          // and ProfileProvider auto-persists to localStorage. Dashboard has its own verification.
        } catch (verifyErr) {
          console.error('[profile] ⚠️ Swarm backup verification failed:', verifyErr);
          setUploadStatus('error');
        }
      })();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setUploadStatus('error');
      setShowErrorModal(true); // Show error modal on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => {
          setShowErrorModal(false);
          setUploadStatus('idle');
        }}
        title="Profile Upload Failed"
        message={err || "An error occurred while uploading your profile to Swarm. Please try again."}
        redirectTo="/profile"
        redirectLabel="Stay on Profile"
      />

      {/* Wallet disconnected warning (Web3 users only) */}
      {id.kind === "web3" && wallet.isConnected === false && (
        <WalletWarningBanner onReconnect={wallet.reconnect} />
      )}

      {/* Web3 users need to authorize posting before updating profile */}
      {id.kind === "web3" && id.postAuth === "blocked" && (
        <div className="rounded border border-amber-300 dark:border-amber-700 p-4 bg-amber-50/80 dark:bg-amber-900/30">
          <div className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Authorize Profile Updates</div>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            To update your profile, authorize a secure posting account. Your wallet will ask you to sign a message (EIP-712).
          </p>
          <Button onClick={() => id.requestPostingCapability()}>Authorize Posting</Button>
        </div>
      )}

      {/* Write panel */}
      <div className="rounded border dark:border-gray-700 p-4 bg-white/80 dark:bg-gray-800/90">
        <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Create / Update Profile (platform signer → per-user topics)</div>

        <form onSubmit={onSave} className="space-y-4">
          {/* Display name */}
          <div>
            <label className="block text-sm text-gray-900 dark:text-gray-100 mb-1">Display name</label>
            <Input
              value={displayName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
              placeholder="e.g. Nickname"
            />
          </div>

          {/* Avatar picker + preview */}
          <div className="space-y-2">
            <label htmlFor="profile-avatar-upload" className="block text-sm text-gray-900 dark:text-gray-100">Avatar (optional)</label>
            <input
              id="profile-avatar-upload"
              name="profile-avatar"
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="block w-full text-sm"
            />
            {previewUrl && (
              <div className="flex items-center gap-3">
                <Image
                  src={previewUrl}
                  alt="preview"
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border"
                />
                <div className="text-xs text-gray-500">Preview</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy || !subject0x}>
              {busy ? "Saving…" : "Save"}
            </Button>

            {saved && <span className="text-green-600 text-sm">Saved ✔</span>}
            {err && <span className="text-red-600 text-sm">Error: {err}</span>}
          </div>
          {!id?.ready && (
          <div className="text-sm text-gray-500">Checking your account…</div>
        )}

        {id?.ready && !subject0x && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm">
            No active account. Please{" "}
            <a href="/accounts" className="underline">open Accounts</a>{" "}
            to sign in (Web3) or create a local account.
          </div>
        )}
        </form>
      </div>

      {/* Read panel (renders from in-state; zero network calls here) */}
      <div className="rounded border dark:border-gray-700 p-4 bg-white/80 dark:bg-gray-800/90">
        <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Current Profile (in-state)</div>
        {owner0x && subject0x ? (
          <>
            <ProfileView
              key={subject0x}
              subject={subject0x}
              feedOwner={owner0x}
              previewUrl={showPreviewInProfile ? previewUrl : null}
              disableAutoRefresh={true}
            />

            {/* Upload/Verification Status Badge (below profile) */}
            {uploadStatus !== 'idle' && (
              <div className="mt-3">
                {uploadStatus === 'uploading' && (
                  <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 px-3 py-2 rounded-lg flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium">Backing up to Swarm...</span>
                  </div>
                )}
                {uploadStatus === 'success' && (
                  <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-200 px-3 py-2 rounded-lg flex items-center gap-2">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">✓ Backed up to Swarm</span>
                  </div>
                )}
                {uploadStatus === 'error' && (
                  <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 px-3 py-2 rounded-lg flex items-center gap-2">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">Backup failed</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Save first (needs platform feed owner and an active user account).
          </p>
        )}
      </div>

      {/* Environment info */}
      <p className="text-xs text-gray-500">
        Bee: {BEE_URL} • Batch: {POSTAGE_BATCH_ID?.slice(0, 10)}…
      </p>
    </div>
  );
}
