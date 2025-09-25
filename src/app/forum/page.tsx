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
import { BOARD_ID } from "@/lib/forum/boardID"
import { Composer } from "@/components/forum/Composer"
import { PostItem } from "@/components/forum/PostItem"
import { fetchBoard, fetchPostJSON, type CanonicalPost } from "@/lib/forum/client"
import { useProfile } from "@/lib/profile/context"
import { primeAvatarCache, pickAvatarRefFromPayload, pickAvatarRefFromProfile } from "@/lib/avatar"

// Build a CanonicalPost-shaped stub from a payload (no `any`, zero runtime cost)
const asCanon = (payload: CanonicalPost["payload"]): CanonicalPost =>
  ({ payload } as unknown as CanonicalPost)


export default function BoardPage() {
  const { profile } = useProfile()                  
  const myAddr = profile?.subject?.toLowerCase()
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

  useEffect(() => {
    // pre-warm a handful of authors currently on the board
    const authors = Array.from(
      new Set(
        Object.values(firstPosts)
          .map((c) => c?.payload?.subject?.toLowerCase())
          .filter(Boolean) as string[]
      )
    )
    primeAvatarCache(authors.slice(0, 12))
  }, [firstPosts])
  
  return (
    <main className="mx-auto max-w-3xl px-4 py-4 space-y-6">
      <h1 className="text-lg font-semibold">Forum — {BOARD_ID}</h1>

      {/* new thread composer */}
      <Composer
        boardId={BOARD_ID}
        // Insert a local stub immediately (threadRef will look like "local:<uuid>")
        onOptimistic={({ threadRef, payload }) => {
          setThreads((prev) => [threadRef, ...prev])
          setFirstPosts((p) => ({ ...p, [threadRef]: asCanon(payload) }))
        }}
        // When server confirms, replace local key with the real threadRef and hydrate
        onPosted={(res) => {
          const localKey = res.clientTag ? `local:${res.clientTag}` : null

          setThreads((prev) => [
            res.threadRef,
            ...prev.filter((r) => r !== res.threadRef && r !== localKey),
          ])

          fetchPostJSON(res.threadRef)
            .then((c) => {
              setFirstPosts((p) => {
                const next = { ...p }
                if (localKey) delete next[localKey]  // drop the local stub
                next[res.threadRef] = c              // store the real canonical post
                return next
              })
            })
            .catch(() => {
              // even if hydration fails, remove the local stub so the list is clean
              if (localKey) {
                setFirstPosts((p) => {
                  const next = { ...p }
                  delete next[localKey]
                  return next
                })
              }
            })
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
          const author = c?.payload.subject ?? ""         // ⬅️ normalize author
          const authorLc = author.toLowerCase()

          return (
            <Link key={ref} href={`/forum/${ref}`} className="block hover:opacity-90 transition">
              <PostItem
                refHex={ref}
                author={c?.payload.subject ?? "(unknown)"}
                displayName={c?.payload.displayName}
                // snapshot-first; handle older shapes; null → undefined
                avatarRef={pickAvatarRefFromPayload(c?.payload) ?? undefined}
                currentAvatarRef={
                  authorLc && myAddr && authorLc === myAddr
                    ? (pickAvatarRefFromProfile(profile) ?? null)
                    : null
                }
                content={c?.payload.content ?? "(no content)"}
                createdAt={c?.payload.createdAt ?? 0}
                boardId={BOARD_ID}   // ← ADD: enables ReplyBadge to know which board
                threadRef={ref}      // ← ADD: the root post’s ref is the thread id
              />
            </Link>
          )
        })}
      </section>
    </main>
  )
}
