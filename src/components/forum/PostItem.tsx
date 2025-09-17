// src/components/forum/PostItem.tsx
"use client"

// -----------------------------------------------------------------------------
// PostItem
// - Renders one post using the immutable snapshot from the post payload:
//     displayName?: string
//     avatarRef?: string (Swarm 64-hex)
// - Uses Next/Image with { unoptimized: true } so we don't need next.config.js domains
// - Robust avatar loading:
//     1) Try the post's snapshot avatar.
//     2) If it fails (GC'd/partial/bad URL), fall back to the author's *current* avatar if provided.
//     3) If that also fails or isn't provided, render a neutral placeholder.
// -----------------------------------------------------------------------------

import { useMemo, useState } from "react"
import Image from "next/image"
import { BEE_URL } from "@/config/swarm"

// Build a safe Bee URL for images uploaded via uploadFile (manifests/files).
// - Lowercase ref.
// - Strip accidental trailing slashes.
// - IMPORTANT: no slash before the query string; e.g. /bzz/<ref>?v=...
function buildBzzImageUrl(refHex?: string | null, cacheMarker?: string | null) {
  if (!refHex) return null
  const clean = refHex.toLowerCase().replace(/\/+$/, "")
  const qs = cacheMarker ? `?v=${cacheMarker}` : ""
  return `${BEE_URL}/bzz/${clean}${qs}`
}

export function PostItem(props: {
  refHex: string
  author: string
  displayName?: string
  avatarRef?: string // snapshot at publish time
  content: string
  createdAt: number

  // 🔽 optional extras (safe: callers can ignore these)
  currentAvatarRef?: string | null // author's *current* avatar to use as a fallback
  avatarMarker?: string | null     // optional cache-buster you already use elsewhere
}) {
  const {
    refHex,
    author,
    displayName,
    avatarRef,       // snapshot
    content,
    createdAt,
    currentAvatarRef = null,
    avatarMarker = null,
  } = props

  // Robust avatar: snapshot first, then optional current avatar as fallback.
  const [useFallback, setUseFallback] = useState(false)
  const primarySrc = useMemo(() => buildBzzImageUrl(avatarRef, avatarMarker), [avatarRef, avatarMarker])
  const fallbackSrc = useMemo(() => buildBzzImageUrl(currentAvatarRef, avatarMarker), [currentAvatarRef, avatarMarker])
  const avatarSrc = useFallback ? fallbackSrc : primarySrc

  return (
    <div className="rounded border p-3 bg-white/90 flex gap-3">
      {/* Avatar (snapshot → fallback → placeholder) */}
      <div>
        {avatarSrc ? (
          <Image
            key={avatarSrc} // ensures rerender when flipping to fallback
            src={avatarSrc}
            alt="avatar"
            width={44}
            height={44}
            unoptimized
            className="w-11 h-11 rounded-full object-cover border"
            onError={() => {
              // If snapshot fails (GC’d/partial/bad URL), try current avatar once.
              if (!useFallback && fallbackSrc && fallbackSrc !== avatarSrc) {
                setUseFallback(true)
              }
            }}
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gray-200 border" />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">{displayName ?? "(anon)"}</div>
          <div className="text-[11px] text-gray-500 break-all">· {author}</div>
          <div className="ml-auto text-[11px] text-gray-400">
            {createdAt ? new Date(createdAt).toLocaleString() : ""}
          </div>
        </div>

        <div className="text-sm whitespace-pre-wrap mt-1">{content}</div>

        {/* Debug/reference */}
        <div className="text-[10px] text-gray-400 break-all mt-2">ref: {refHex}</div>
      </div>
    </div>
  )
}
