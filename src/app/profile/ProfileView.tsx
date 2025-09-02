// src/app/profile/ProfileView.tsx
"use client";

/**
 * ProfileView (presentational, state-driven)
 * -----------------------------------------
 * • Makes ZERO network calls.
 * • Renders from the central ProfileProvider (which:
 *     - hydrates from localStorage
 *     - does ONE cold-start freshness check
 *     - does an optional, rate-limited visibility check
 *     - only updates React state if content actually changed)
 * • After saves, ProfileTab calls applyLocalUpdate(...) so UI updates instantly.
 */

import Image from "next/image";
import { useProfile } from "@/lib/profile/context";
import { BEE_URL } from "@/config/swarm";

type Hex0x = `0x${string}`;

export default function ProfileView(props: {
  subject: Hex0x;
  feedOwner?: Hex0x | null; // optional, for display only
}) {
  const { subject, feedOwner } = props;
  const { profile } = useProfile();

  const name = profile?.name ?? null;
  const avatarRef = profile?.avatarRef ?? null;

  return (
    <div className="flex items-center gap-4">
      {/* Avatar (/bzz/{ref} immutable by content hash) */}
      {avatarRef ? (
        <Image
          src={`${BEE_URL}/bzz/${avatarRef}`}
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
