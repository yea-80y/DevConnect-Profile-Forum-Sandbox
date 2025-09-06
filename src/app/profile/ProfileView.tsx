// src/app/profile/ProfileView.tsx
"use client";

/**
 * ProfileView (presentational, state-driven)
 * - Renders from ProfileProvider (fast), but triggers a one-time
 *   ensureFresh() on mount to sync with Swarm automatically.
 */

import Image from "next/image";
import { useEffect, useRef } from "react";
import { useProfile } from "@/lib/profile/context";
import { BEE_URL } from "@/config/swarm";

type Hex0x = `0x${string}`;

export default function ProfileView(props: {
  subject: Hex0x;
  feedOwner?: Hex0x | null; // optional, for display only
}) {
  const { subject, feedOwner } = props;
  const { profile, ensureFresh } = useProfile();

  const did = useRef(false);
  const ensureFreshRef = useRef(ensureFresh);
  useEffect(() => { ensureFreshRef.current = ensureFresh; }, [ensureFresh]);

  // snapshot whether we had a local update at the moment of mount
  const avatarMarkerAtMount = useRef(profile?.avatarMarker);

  // one-time mount effect (empty deps; lint-clean)
  useEffect(() => {
    if (did.current) return;
    did.current = true;

    // if we just saved locally, don’t immediately fetch and overwrite
    if (!avatarMarkerAtMount.current) {
      const t = setTimeout(() => { void ensureFreshRef.current(); }, 400);
      return () => clearTimeout(t);
    }
  }, []);

  const name = profile?.name ?? null;
  const avatarRef = profile?.avatarRef ?? null;

  console.log("[ProfileView] avatarRef in state =", profile?.avatarRef)


  return (
    <div className="flex items-center gap-4">
      {/* Avatar (/bzz/{ref} immutable). Add ?v=avatarMarker to nudge caches after updates */}
      {avatarRef ? (
        <Image
          key={`${avatarRef}-${profile?.avatarMarker ?? "0"}`}
          src={`${BEE_URL}/bzz/${avatarRef}${
            profile?.avatarMarker ? `?v=${profile.avatarMarker}` : ""
          }`}
          alt="avatar"
          width={80}
          height={80}
          unoptimized
          className="w-20 h-20 rounded-full object-cover border"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-gray-200 border" />
      )}

      <div>
        <div className="text-lg font-semibold">{name ?? "(no name yet)"}</div>
        <div className="text-xs text-gray-500 break-all">{subject}</div>
        {feedOwner && (
          <div className="text-[10px] text-gray-400 break-all">owner: {feedOwner}</div>
        )}
      </div>
    </div>
  );
}
