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
import { BEE_URL } from "@/config/swarm";

type Hex0x = `0x${string}`;

export default function ProfileView(props: {
  subject: Hex0x;
  feedOwner?: Hex0x | null; // optional, for display only
}) {
  const { subject, feedOwner } = props;
  const { profile, ensureFresh } = useProfile();

  const ensureFreshRef = useRef(ensureFresh);
  useEffect(() => { ensureFreshRef.current = ensureFresh; }, [ensureFresh]);

  // snapshot whether we had a local update at the moment of mount
  const avatarMarkerAtMount = useRef(profile?.avatarMarker);

  // Track whether the <Image> failed to load so we can render a placeholder
  const [imgError, setImgError] = useState(false);

  // Whenever the avatar ref or its cache-busting marker changes, clear error
  useEffect(() => {
    setImgError(false);
  }, [profile?.avatarRef, profile?.avatarMarker]);


  // one-time mount effect (empty deps; lint-clean)
  // Align provider with props whenever subject/owner changes, then refresh.
  // Ensure we only refresh when the subject/owner pair *actually* changes.
  // Also, throttle to avoid re-fetch storms in dev/hmr.
  const lastKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const lastRunTsRef = useRef(0);

  useEffect(() => {
    const key = `${subject ?? "nosub"}|${feedOwner ?? "noown"}`;

    // If unchanged, do nothing.
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    // If we just locally saved an avatar in this mount, skip the auto refresh once.
    if (avatarMarkerAtMount.current) return;

    // Throttle: don’t run more than once per 1000ms.
    const now = Date.now();
    if (now - lastRunTsRef.current < 1000) return;
    lastRunTsRef.current = now;

    // Skip if a previous refresh is still in flight
    if (inFlightRef.current) return;
    inFlightRef.current = true;

      const t = setTimeout(async () => {
        try { await ensureFreshRef.current(); } finally { inFlightRef.current = false; }
      }, 250); // tiny stagger to avoid colliding with parent renders

      return () => clearTimeout(t);
    }, [subject, feedOwner]);

  const name = profile?.name ?? null;
  const avatarRef = profile?.avatarRef ?? null;

  // Sanitize the ref: lowercase and strip any accidental trailing slashes
  const avatarRefClean = avatarRef ? avatarRef.toLowerCase().replace(/\/+$/, "") : null;

  // Build the exact URL once (NO trailing slash before ?)
  // Build a stable URL; only changes when the hash or marker changes
  const avatarSrc = useMemo(() => {
    if (!avatarRefClean) return null;
    const qs = profile?.avatarMarker ? `?v=${profile.avatarMarker}` : "";
    return `${BEE_URL}/bzz/${avatarRefClean}${qs}`;
  }, [avatarRefClean, profile?.avatarMarker]);

// (Optional) comment out the noisy log
// console.debug("[ProfileView] avatarSrc =", avatarSrc);


  // Helpful breadcrumb so we can see the exact URL the browser will fetch
  console.log("[ProfileView] avatarRef =", avatarRef, "→ avatarSrc =", avatarSrc);


  return (
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
        <div className="w-20 h-20 rounded-full bg-gray-200 border" />
      )}

      <div>
        <div className="text-lg font-semibold text-gray-900">{name ?? "(no name yet)"}</div>
        <div className="text-xs text-gray-500 break-all">{subject}</div>
        {feedOwner && (
          <div className="text-[10px] text-gray-400 break-all">owner: {feedOwner}</div>
        )}
      </div>
    </div>
  );
}
