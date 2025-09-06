// src/app/forum/page.tsx
"use client"

// -----------------------------------------------------------------------------
// BoardPage
// - Reads the board feed via /api/forum/board → list of thread root refs
// - Prefetches each thread's root canonical post JSON for preview
// - Renders a Composer to start a new thread
// -----------------------------------------------------------------------------

import Link from "next/link"
import { useEffect, useState } from "react"
import { Composer } from "@/components/forum/Composer"
import { PostItem } from "@/components/forum/PostItem"
import { fetchBoard, fetchPostJSON, type CanonicalPost } from "@/lib/forum/client"

const BOARD_ID = "devconnect:general" // single board for now; easy to param later

export default function BoardPage() {
  const [threads, setThreads] = useState<string[]>([])
  const [firstPosts, setFirstPosts] = useState<Record<string, CanonicalPost | null>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Initial load of board threads + prefetch thread-root post JSON
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true); setErr(null)
      try {
        const b = await fetchBoard(BOARD_ID)
        if (cancelled) return
        setThreads(b.threads)

        const next: Record<string, CanonicalPost | null> = {}
        for (const t of b.threads) {
          try {
            next[t] = await fetchPostJSON(t)
          } catch {
            next[t] = null
          }
          if (cancelled) return
        }
        setFirstPosts(next)
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load board")
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 space-y-6">
      <h1 className="text-lg font-semibold">Forum — {BOARD_ID}</h1>

      {/* new thread composer */}
      <Composer
        boardId={BOARD_ID}
        onPosted={(res) => {
          // Optimistically add the new thread at the top
          setThreads((prev) => [res.threadRef, ...prev.filter((r) => r !== res.threadRef)])
          // Prefetch the thread root post
          fetchPostJSON(res.threadRef)
            .then((c) => setFirstPosts((p) => ({ ...p, [res.threadRef]: c })))
            .catch(() => {})
        }}
      />

      {/* list of threads */}
      <section className="space-y-3">
        {busy && <div className="text-sm text-gray-500">Loading board…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!busy && !err && threads.length === 0 && (
          <div className="text-sm text-gray-500">No threads yet. Start one!</div>
        )}
        {threads.map((ref) => {
          const c = firstPosts[ref]
          return (
            <Link key={ref} href={`/forum/${ref}`} className="block hover:opacity-90 transition">
              <PostItem
                refHex={ref}
                author={c?.payload.subject ?? "(unknown)"}
                displayName={c?.payload.displayName}
                avatarRef={c?.payload.avatarRef}
                content={c?.payload.content ?? "(no content)"}
                createdAt={c?.payload.createdAt ?? 0}
              />
            </Link>
          )
        })}
      </section>
    </main>
  )
}
