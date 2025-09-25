"use client"

import { useEffect, useState } from "react"

type Props = {
  boardId: string
  threadRef: string
  className?: string
}

export default function ReplyBadge({ boardId, threadRef, className }: Props) {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    if (!boardId || !threadRef) return
    const ctrl = new AbortController()
    const url = `/api/forum/thread?boardId=${encodeURIComponent(boardId)}&threadRef=${encodeURIComponent(threadRef)}&summary=1&limit=0`
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (data?.ok && typeof data.total === "number") setCount(data.total)
      })
      .catch(() => { /* ignore abort/transient */ })
    return () => ctrl.abort()
  }, [boardId, threadRef])

  if (count <= 0) return null

  return (
    // Render a non-anchor because the whole card is already wrapped in a Link.
    <span
        className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs opacity-80 ${className ?? ""}`}
        aria-label={`View ${count} ${count === 1 ? "reply" : "replies"}`}
    >
        <span className="i-lucide-message-circle text-sm" />
        <span>{count} {count === 1 ? "reply" : "replies"}</span>
    </span>
    )
}
