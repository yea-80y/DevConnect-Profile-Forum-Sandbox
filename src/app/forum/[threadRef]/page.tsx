// src/app/forum/[threadRef]/page.tsx
"use client"

// -----------------------------------------------------------------------------
// ThreadPage
// - Reads the thread feed via /api/forum/thread → list of post refs
// - Fetches canonical post JSON for each ref (newest-first)
// - Includes a Composer to reply into the current thread
// -----------------------------------------------------------------------------

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Composer } from "@/components/forum/Composer"
import { PostItem } from "@/components/forum/PostItem"
import { fetchThread, fetchPostJSON, type CanonicalPost } from "@/lib/forum/client"

const BOARD_ID = "devconnect:general"

export default function ThreadPage() {
  const params = useParams<{ threadRef: string }>()
  const threadRef = params.threadRef?.toLowerCase() ?? ""

  const [posts, setPosts] = useState<string[]>([])
  const [canon, setCanon] = useState<Record<string, CanonicalPost | null>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load post refs + fetch each canonical post JSON
  useEffect(() => {
    if (!threadRef) return
    let cancelled = false
    ;(async () => {
      setBusy(true); setErr(null)
      try {
        const t = await fetchThread(BOARD_ID, threadRef)
        if (cancelled) return
        setPosts(t.posts)

        const next: Record<string, CanonicalPost | null> = {}
        for (const r of t.posts) {
          try {
            next[r] = await fetchPostJSON(r)
          } catch {
            next[r] = null
          }
          if (cancelled) return
        }
        setCanon(next)
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load thread")
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [threadRef])

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 space-y-6">
      <h1 className="text-lg font-semibold break-all">Thread</h1>

      {/* reply composer */}
      <Composer
        boardId={BOARD_ID}
        replyTo={threadRef}
        onPosted={(res) => {
          // Add newest post at the top
          setPosts((prev) => [res.postRef, ...prev])
          // Fetch canonical JSON for the new post
          fetchPostJSON(res.postRef)
            .then((c) => setCanon((p) => ({ ...p, [res.postRef]: c })))
            .catch(() => {})
        }}
      />

      {/* posts */}
      <section className="space-y-3">
        {busy && <div className="text-sm text-gray-500">Loading posts…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!busy && !err && posts.length === 0 && (
          <div className="text-sm text-gray-500">No posts yet.</div>
        )}
        {posts.map((ref) => {
          const c = canon[ref]
          return (
            <PostItem
              key={ref}
              refHex={ref}
              author={c?.payload.subject ?? "(unknown)"}
              displayName={c?.payload.displayName}
              avatarRef={c?.payload.avatarRef}
              content={c?.payload.content ?? "(no content)"}
              createdAt={c?.payload.createdAt ?? 0}
            />
          )
        })}
      </section>
    </main>
  )
}
