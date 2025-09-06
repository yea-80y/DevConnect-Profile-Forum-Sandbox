// src/components/forum/PostItem.tsx
"use client"

// -----------------------------------------------------------------------------
// PostItem
// - Renders one post using the immutable snapshot from the post payload:
//     displayName?: string
//     avatarRef?: string (Swarm 64-hex)
// - Uses Next/Image with { unoptimized: true } so we don't need next.config.js domains
// -----------------------------------------------------------------------------

import Image from "next/image"
import { BEE_URL } from "@/config/swarm"

export function PostItem(props: {
  refHex: string
  author: string
  displayName?: string
  avatarRef?: string
  content: string
  createdAt: number
}) {
  const { refHex, author, displayName, avatarRef, content, createdAt } = props

  return (
    <div className="rounded border p-3 bg-white/90 flex gap-3">
      {/* Avatar (snapshot). If missing, render a placeholder circle. */}
      <div>
        {avatarRef ? (
          <Image
            src={`${BEE_URL}/bzz/${avatarRef}`}
            alt="avatar"
            width={44}
            height={44}
            unoptimized
            className="w-11 h-11 rounded-full object-cover border"
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
