// src/components/forum/PostItem.tsx
"use client"

import NextImage from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { normRef, getLatestAvatarRefCached } from "@/lib/avatar"
import ReplyBadge from "@/components/forum/ReplyBadge" 
import { MuteButton } from "./MuteButton";

// Preload & decode an image off-DOM; resolve only when ready to paint.
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const d = (img as HTMLImageElement).decode?.()
      if (d && typeof d.then === "function") {
        d.then(() => resolve()).catch(() => resolve())
      } else {
        resolve()
      }
    }
    img.onerror = () => reject(new Error("img error"))
    img.src = url
  })
}

export function PostItem(props: {
  refHex: string
  author: string
  displayName?: string | null   // ← widened to also accept null
  avatarRef?: string            // snapshot at time of posting (may be broken/missing)
  content: string
  createdAt: number
  currentAvatarRef?: string | null
  boardId?: string
  threadRef?: string
  isRoot?: boolean              // ← NEW
}) {
  const {
    refHex,
    author,
    displayName,
    avatarRef,
    content,
    createdAt,
    currentAvatarRef = null,
    boardId,
    threadRef,
    isRoot = false,             // ← NEW default
  } = props

  // Start with snapshot; else "current" (if provided); else null.
  const initialRef = useMemo(
    () => normRef(avatarRef) ?? normRef(currentAvatarRef),
    [avatarRef, currentAvatarRef]
  )

  // The ref currently shown in <Image>.
  const [displayRef, setDisplayRef] = useState<string | null>(initialRef)
  // Cache-buster used ONLY when we switch refs.
  const [marker, setMarker] = useState<string>("")
  // Whether the <Image> should be visible (we fade it in/out).
  const [visible, setVisible] = useState<boolean>(!!initialRef)
  // Prevent overlapping heal attempts.
  const healing = useRef(false)
  // Guard against state updates after unmount.
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // Whenever the post/author changes, reset to the new initial candidate.
  useEffect(() => {
    setDisplayRef(initialRef ?? null)
    setVisible(!!initialRef)
    healing.current = false
  }, [initialRef, author])

  // Build the proxy URL for a given ref.
  const src =
    displayRef ? `/api/swarm/img/${displayRef}${marker ? `?v=${marker}` : ""}` : null

  // If there is no initial ref at all, try to heal once (no flicker—placeholder stays).
  useEffect(() => {
    if (displayRef || healing.current) return
    healing.current = true
    ;(async () => {
      try {
        const healed = normRef(await getLatestAvatarRefCached(author))
        if (!healed || !alive.current) return
        const url = `/api/swarm/img/${healed}?v=${Date.now()}`
        await preloadImage(url)
        if (!alive.current) return
        setMarker(String(Date.now()))
        setDisplayRef(healed)
        setVisible(true)
      } finally {
        healing.current = false
      }
    })()
  }, [author, displayRef])

  // If the snapshot image fails, heal without blanking to null.
  const handleError = () => {
    if (healing.current) return
    healing.current = true
    // Hide the broken image; placeholder underneath will show.
    setVisible(false)
    ;(async () => {
      try {
        const healed = normRef(await getLatestAvatarRefCached(author))
        if (!healed || healed === displayRef || !alive.current) {
          // Couldn’t heal; show placeholder.
          setDisplayRef(null)
          setVisible(true)
          return
        }
        const url = `/api/swarm/img/${healed}?v=${Date.now()}`
        await preloadImage(url) // ensure new image is decoded before swap
        if (!alive.current) return
        setMarker(String(Date.now()))
        setDisplayRef(healed)
        setVisible(true) // fade in ready image
      } finally {
        healing.current = false
      }
    })()
  }

  return (
    <div className="rounded border p-3 bg-white/90 flex gap-3">
      {/* Avatar: always render a solid placeholder behind the image. */}
      <div className="relative w-11 h-11">
        {/* Placeholder background (never unmounts) */}
        <div className="absolute inset-0 rounded-full bg-gray-200 border" />

        {src && (
          <NextImage
            // Do NOT set a key on src; keep the element mounted to avoid flashes.
            src={src}
            alt="avatar"
            fill
            sizes="44px"
            unoptimized
            loading="eager"
            priority
            // Rounded & cover; crossfade on visibility toggles.
            className={`rounded-full object-cover border transition-opacity duration-150 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
            onError={handleError}
            onLoad={() => setVisible(true)} // ensures we fade in if browser decodes fast
            draggable={false}
          />
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
        <div className="text-[10px] text-gray-400 break-all mt-2">ref: {refHex}</div>

        {/* Root post: show reply badge + Mute (as thread) */}
        {isRoot && boardId && threadRef && (
          <div className="mt-2">
            <ReplyBadge boardId={boardId} threadRef={threadRef} />
            <MuteButton
              boardId={boardId}
              refHex={refHex}
              kind="thread"
            />
          </div>
        )}

        {/* Replies: no reply badge, but allow Mute (as reply) */}
        {!isRoot && boardId && (
          <div className="mt-2">
            <MuteButton
              boardId={boardId}
              refHex={refHex}
              kind="reply"
            />
          </div>
        )}
      </div>
    </div>
  )
}
