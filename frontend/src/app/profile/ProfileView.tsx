// src/app/profile/ProfileView.tsx
"use client";

/**
 * ProfileView (presentational, state-driven)
 * - Renders from ProfileProvider (fast), but triggers a one-time
 *   ensureFresh() on mount to sync with Swarm automatically.
 */

import Image from "next/image";
import { useEffect, useRef, useState, useMemo } from "react";
import { useProfile } from "@/lib/profile/context";
import { verifyAvatarOnSwarm } from "@/lib/profile/service";
import { BEE_URL } from "@/config/swarm";
import { apiUrl } from "@/config/api";

type Hex0x = `0x${string}`;

export default function ProfileView(props: {
  subject: Hex0x;
  feedOwner?: Hex0x | null; // optional, for display only
  previewUrl?: string | null; // optional preview image (optimistic UI)
  disableAutoRefresh?: boolean; // disable auto-refresh (for edit page where parent manages refreshes)
}) {
  const { subject, feedOwner, previewUrl, disableAutoRefresh = false } = props;
  const { profile, ensureFresh } = useProfile();

  const ensureFreshRef = useRef(ensureFresh);
  useEffect(() => { ensureFreshRef.current = ensureFresh; }, [ensureFresh]);

  // Track if we just did a local save (don't verify immediately after save)
  // Initialize as undefined so cached profiles still get verified
  const skipNextVerification = useRef(false);

  // Track whether the <Image> failed to load so we can render a placeholder
  const [imgError, setImgError] = useState(false);

  // Track Swarm verification status (for dashboard background check)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'verified' | 'mismatch'>('idle');

  // Whenever the avatar ref or its cache-busting marker changes, clear error
  useEffect(() => {
    setImgError(false);
  }, [profile?.avatarRef, profile?.avatarMarker]);


  // Verification guards: throttle to avoid excessive calls and prevent overlapping requests
  const inFlightRef = useRef(false);
  const lastRunTsRef = useRef(0);

  useEffect(() => {
    console.log('[ProfileView] Verification effect running', {
      disableAutoRefresh,
      subject,
      feedOwner,
      avatarRef: profile?.avatarRef,
      verificationStatus
    });

    // ✅ OPTIMIZATION: Skip auto-refresh on edit page (parent manages polling)
    if (disableAutoRefresh) {
      console.log('[ProfileView] Skipping - auto-refresh disabled');
      return;
    }

    // If we just locally saved an avatar, skip verification once (then reset flag)
    if (skipNextVerification.current) {
      console.log('[ProfileView] Skipping - local save detected');
      skipNextVerification.current = false;
      return;
    }

    // ✅ NEW: Lightweight verification instead of full refresh
    // Only verify avatar feed (not name) for faster background check
    const t = setTimeout(async () => {
      try {
        // Throttle check INSIDE timeout (after StrictMode cleanup runs)
        const now = Date.now();
        if (now - lastRunTsRef.current < 1000) {
          console.log('[ProfileView] Skipping - throttled');
          return;
        }
        lastRunTsRef.current = now;

        // Skip if a previous refresh is still in flight
        if (inFlightRef.current) {
          console.log('[ProfileView] Skipping - already running');
          return;
        }
        inFlightRef.current = true;

        if (!feedOwner || !subject || !profile?.avatarRef) {
          console.log('[ProfileView] Skipping verification - missing data:', {
            feedOwner: !!feedOwner,
            subject: !!subject,
            avatarRef: !!profile?.avatarRef
          });
          inFlightRef.current = false;
          return;
        }

        console.log('[ProfileView] Starting verification...');
        setVerificationStatus('verifying');
        const result = await verifyAvatarOnSwarm({
          beeUrl: BEE_URL,
          feedOwner,
          subject,
          cachedAvatarRef: profile.avatarRef,
        });

        console.log('[ProfileView] Verification result:', result);

        if (result.verified) {
          console.log('[ProfileView] ✓ Verified');
          setVerificationStatus('verified');
        } else if (result.feedHash) {
          // Feed exists but points to different hash - auto-update cached profile
          console.log('[ProfileView] Mismatch detected, syncing...');
          setVerificationStatus('mismatch');
          console.warn('[ProfileView] Avatar mismatch - cached:', profile.avatarRef, 'feed:', result.feedHash);
          console.log('[ProfileView] Auto-updating to feed hash:', result.feedHash);
          // Trigger full refresh to update cached profile with feed data
          await ensureFreshRef.current();
          setVerificationStatus('verified'); // Mark as verified after sync
        } else {
          console.log('[ProfileView] No feed hash found');
          setVerificationStatus('idle');
        }
      } finally {
        inFlightRef.current = false;
      }
    }, 250); // tiny stagger to avoid colliding with parent renders

    return () => clearTimeout(t);
  }, [subject, feedOwner, disableAutoRefresh, profile?.avatarRef]);

  const name = profile?.name ?? null;
  const avatarRef = profile?.avatarRef ?? null;

  // Sanitize the ref: lowercase and strip any accidental trailing slashes
  const avatarRefClean = avatarRef ? avatarRef.toLowerCase().replace(/\/+$/, "") : null;

  // Build the exact URL once (NO trailing slash before ?)
  // Build a stable URL; only changes when the hash or marker changes
  // Use backend API proxy (/api/swarm/img/) instead of direct Bee access to avoid CORS issues
  const avatarSrc = useMemo(() => {
    // ✅ OPTIMISTIC: Show preview immediately if available (takes priority)
    if (previewUrl) return previewUrl;

    // Otherwise show the Swarm-hosted image via backend proxy
    if (!avatarRefClean) return null;
    const qs = profile?.avatarMarker ? `?v=${profile.avatarMarker}` : "";
    return apiUrl(`/api/swarm/img/${avatarRefClean}${qs}`);
  }, [previewUrl, avatarRefClean, profile?.avatarMarker]);

  // Helpful breadcrumb (disabled to reduce console spam during typing)
  // console.log("[ProfileView] avatarRef =", avatarRef, "→ avatarSrc =", avatarSrc, "previewUrl =", previewUrl);


  return (
    <div>
      <div className="flex items-center gap-4">
        {/* Avatar (/bzz/{ref} immutable). Add ?v=avatarMarker to nudge caches after updates */}
        {avatarSrc && !imgError ? (
          <Image
            key={`${avatarRefClean}-${profile?.avatarMarker ?? "0"}`}
            src={avatarSrc}
            alt="avatar"
            width={80}
            height={80}
            unoptimized
            className="w-20 h-20 rounded-full object-cover border"
            onError={() => setImgError(true)}   // <-- fallback to placeholder on load error
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 border dark:border-gray-600" />
        )}

        <div className="flex-1">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{name ?? "(no name yet)"}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{subject}</div>
          {feedOwner && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 break-all">owner: {feedOwner}</div>
          )}

          {/* Simple verification status text (only show on dashboard) */}
          {!disableAutoRefresh && verificationStatus !== 'idle' && (
            <div className="text-xs mt-1">
              {verificationStatus === 'verifying' && (
                <span className="text-blue-600 dark:text-blue-400">🔄 Verifying on Swarm...</span>
              )}
              {verificationStatus === 'verified' && (
                <span className="text-green-600 dark:text-green-400">✓ Verified</span>
              )}
              {verificationStatus === 'mismatch' && (
                <span className="text-amber-600 dark:text-amber-400">⟳ Syncing...</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
