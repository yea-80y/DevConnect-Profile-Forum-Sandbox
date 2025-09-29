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
import { BOARD_ID } from "@/lib/forum/boardID"
import { Composer } from "@/components/forum/Composer"
import { PostItem } from "@/components/forum/PostItem"
import { fetchThread, fetchPostJSON, type CanonicalPost } from "@/lib/forum/client"
import { useProfile } from "@/lib/profile/context" 
import { primeAvatarCache, pickAvatarRefFromPayload, pickAvatarRefFromProfile } from "@/lib/avatar"
import { useMe } from "@/app/ClientProviders"
import { AdminLoginButton } from "@/components/admin/AdminLoginButton"


// Build a CanonicalPost-shaped stub from a payload (no `any`, zero runtime cost)
const asCanon = (payload: CanonicalPost["payload"]): CanonicalPost =>
  ({ payload } as unknown as CanonicalPost)


export default function ThreadPage() {
  const { profile } = useProfile()                  
  const myAddr = profile?.subject?.toLowerCase()
  const { isAdmin } = useMe()   // ← MODERATION   
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

        // ↓ NEW: fetch muted replies and filter
        const mutedResp = await fetch(
          `/api/moderation/muted?boardId=${encodeURIComponent(BOARD_ID)}&kind=reply`,
          { cache: "no-store" }
        ).then(r => r.json()).catch(() => ({ refs: [] }))
        const mutedSet = new Set<string>(
          Array.isArray(mutedResp.refs) ? mutedResp.refs.map((x: string) => x.toLowerCase()) : []
        )

        const visible = t.posts.filter((r) => !mutedSet.has(r.toLowerCase()))
        setPosts(visible)

        const next: Record<string, CanonicalPost | null> = {}
        for (const r of visible) {
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

  useEffect(() => {
    // pre-warm a handful of authors currently on the board
    const authors = Array.from(
      new Set(
        Object.values(canon)
          .map((c) => c?.payload?.subject?.toLowerCase())
          .filter(Boolean) as string[]
      )
    )
    primeAvatarCache(authors.slice(0, 12))
  }, [canon])

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold break-all">Thread</h1>
        {isAdmin ? (
          <span className="text-xs rounded bg-gray-200 px-2 py-1">Admin mode</span>
        ) : (
          <AdminLoginButton />
        )}
      </div>

      {/* reply composer */}
      <Composer
        boardId={BOARD_ID}
        replyTo={threadRef}
        // Insert a local reply immediately (postRef will be "local:<uuid>")
        onOptimistic={({ postRef, payload }) => {
          setPosts((prev) => [postRef, ...prev])
          setCanon((p) => ({ ...p, [postRef]: asCanon(payload) }))
        }}
        // When server confirms, replace local key with the real postRef and hydrate
        onPosted={(res) => {
          const localKey = res.clientTag ? `local:${res.clientTag}` : null

          setPosts((prev) => [
            res.postRef,
            ...prev.filter((r) => r !== res.postRef && r !== localKey),
          ])

          fetchPostJSON(res.postRef)
            .then((c) => {
              setCanon((p) => {
                const next = { ...p }
                if (localKey) delete next[localKey]  // drop the local stub
                next[res.postRef] = c                // store the real canonical post
                return next
              })
            })
            .catch(() => {
              if (localKey) {
                setCanon((p) => {
                  const next = { ...p }
                  delete next[localKey]
                  return next
                })
              }
            })
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
          const author = c?.payload.subject ?? ""
          const authorLc = author.toLowerCase()

          return (
            <PostItem
              key={ref}
              refHex={ref}
              author={author || "(unknown)"}
              displayName={c?.payload.displayName}
              // snapshot-first; coerce null → undefined to satisfy prop type
              avatarRef={pickAvatarRefFromPayload(c?.payload) ?? undefined}
              currentAvatarRef={
                authorLc && myAddr && authorLc === myAddr
                  ? (pickAvatarRefFromProfile(profile) ?? null)
                  : null
              }
              content={c?.payload.content ?? "(no content)"}
              createdAt={c?.payload.createdAt ?? 0}
              boardId={BOARD_ID}       // ← NEW
              threadRef={threadRef}    // ← NEW
              isRoot={false}           // ← NEW (explicit; default is also false)
            />
          )
        })}
      </section>
    </main>
  )
}
