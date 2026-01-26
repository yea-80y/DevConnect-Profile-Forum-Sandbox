// src/app/forum/page.tsx
"use client"

// -----------------------------------------------------------------------------
// BoardPage
// - Reads the board feed via /api/forum/board → list of thread root refs
// - Prefetches each thread's root canonical post JSON for preview
// - Renders a Composer to start a new thread
// -----------------------------------------------------------------------------

import StaticLink from "@/components/StaticLink"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { BOARD_ID } from "@/lib/forum/boardID"
import { Composer } from "@/components/forum/Composer"
import { PostItem } from "@/components/forum/PostItem"
import { fetchBoard, fetchThread, fetchPostJSON, type CanonicalPost } from "@/lib/forum/client"
import { useProfile } from "@/lib/profile/context"
import { primeAvatarCache, pickAvatarRefFromPayload, pickAvatarRefFromProfile } from "@/lib/avatar"
import { useMe } from "@/app/ClientProviders"
import { AdminLoginButton } from "@/components/admin/AdminLoginButton"
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton"
import ThemeToggle from "@/components/ThemeToggle"
import { apiUrl } from "@/config/api"
import { useWalletConnection } from "@/lib/wallet/useWalletConnection"
import WalletWarningBanner from "@/components/wallet/WalletWarningBanner"
import usePostingIdentity from "@/lib/auth/usePostingIdentity"    


// Build a CanonicalPost-shaped stub from a payload (no `any`, zero runtime cost)
const asCanon = (payload: CanonicalPost["payload"]): CanonicalPost =>
  ({ payload } as unknown as CanonicalPost)


function ForumContent() {
  const searchParams = useSearchParams()
  const threadParam = searchParams.get("thread")?.toLowerCase() || null

  const { profile } = useProfile()
  const myAddr = profile?.subject?.toLowerCase()

  // MODERATION: read admin state ONCE at the top (rules of hooks)
  const { isAdmin } = useMe()

  // Wallet connection monitoring (for Web3 users only)
  const id = usePostingIdentity()
  const wallet = useWalletConnection()

  const [threads, setThreads] = useState<string[]>([])
  const [firstPosts, setFirstPosts] = useState<Record<string, CanonicalPost | null>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isThreadView = !!threadParam

  // Initial load of board threads OR thread posts
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true); setErr(null)
      try {
        if (threadParam) {
          // Thread view - load posts in this thread
          // Parallelize: fetch thread list AND muted list at the same time
          const [t, mutedResp] = await Promise.all([
            fetchThread(BOARD_ID, threadParam),
            fetch(
              apiUrl(`/api/moderation/muted?boardId=${encodeURIComponent(BOARD_ID)}&kind=reply`),
              { cache: "no-store" }
            ).then(r => r.json()).catch(() => ({ refs: [] }))
          ])
          if (cancelled) return

          const mutedSet = new Set<string>(
            Array.isArray(mutedResp.refs) ? mutedResp.refs.map((x: string) => x.toLowerCase()) : []
          )

          const visible = t.posts.filter((r) => !mutedSet.has(r.toLowerCase()))
          setThreads(visible)

          // Fetch all posts in PARALLEL for better performance
          const results = await Promise.allSettled(
            visible.map(r => fetchPostJSON(r))
          )
          if (cancelled) return

          const next: Record<string, CanonicalPost | null> = {}
          visible.forEach((r, i) => {
            const result = results[i]
            next[r] = result.status === "fulfilled" ? result.value : null
          })
          setFirstPosts(next)
        } else {
          // Board view - load thread list
          // Parallelize: fetch board AND muted list at the same time
          const [b, mutedResp] = await Promise.all([
            fetchBoard(BOARD_ID),
            fetch(
              apiUrl(`/api/moderation/muted?boardId=${encodeURIComponent(BOARD_ID)}&kind=thread`),
              { cache: "no-store" }
            ).then(r => r.json()).catch(() => ({ refs: [] }))
          ])
          if (cancelled) return

          const mutedSet = new Set<string>(
            Array.isArray(mutedResp.refs) ? mutedResp.refs.map((x: string) => x.toLowerCase()) : []
          )

          const visible = b.threads.filter((r) => !mutedSet.has(r.toLowerCase()))
          setThreads(visible)

          // Fetch all thread previews in PARALLEL for better performance
          const results = await Promise.allSettled(
            visible.map(t => fetchPostJSON(t))
          )
          if (cancelled) return

          const next: Record<string, CanonicalPost | null> = {}
          visible.forEach((t, i) => {
            const result = results[i]
            next[t] = result.status === "fulfilled" ? result.value : null
          })
          setFirstPosts(next)
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load")
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [threadParam])

  useEffect(() => {
    // Pre-warm avatar cache for all visible authors
    // This triggers background lookups so avatars load faster
    const authors = Array.from(
      new Set(
        Object.values(firstPosts)
          .map((c) => c?.payload?.subject?.toLowerCase())
          .filter(Boolean) as string[]
      )
    )
    // Prime all authors (the cache handles deduplication and rate limiting)
    primeAvatarCache(authors)
  }, [firstPosts])
  
  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-gray-900 pb-20 transition-colors">
      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        {/* title + admin controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
                const target = isThreadView ? '/forum/' : '/dashboard/';
                window.location.href = basePath ? `${basePath}${target}` : target;
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline"
            >
              {isThreadView ? 'Back' : 'Back to Dashboard'}
            </button>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{isThreadView ? 'Thread' : `Forum — ${BOARD_ID}`}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAdmin ? (
              <>
                <span className="text-xs rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-gray-900 dark:text-gray-100">Admin mode</span>
                <AdminLogoutButton />
              </>
            ) : (
              <AdminLoginButton />
            )}
          </div>
        </div>

        {/* Wallet disconnected warning (Web3 users only) */}
        {id.kind === "web3" && wallet.isConnected === false && (
          <WalletWarningBanner onReconnect={wallet.reconnect} />
        )}

      {/* thread/reply composer */}
      <Composer
        boardId={BOARD_ID}
        replyTo={isThreadView ? threadParam : undefined}
        // Insert a local stub immediately
        onOptimistic={({ threadRef, postRef, payload }) => {
          const ref = isThreadView ? postRef : threadRef
          if (ref) {
            setThreads((prev) => [ref, ...prev])
            setFirstPosts((p) => ({ ...p, [ref]: asCanon(payload) }))
          }
        }}
        // When server confirms, replace local key with the real ref and hydrate
        onPosted={(res) => {
          const newRef = isThreadView ? res.postRef : res.threadRef
          const localKey = res.clientTag ? `local:${res.clientTag}` : null

          setThreads((prev) => [
            newRef,
            ...prev.filter((r) => r !== newRef && r !== localKey),
          ])

          fetchPostJSON(newRef)
            .then((c) => {
              setFirstPosts((p) => {
                const next = { ...p }
                if (localKey) delete next[localKey]
                next[newRef] = c
                return next
              })
            })
            .catch(() => {
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

        {/* list of threads/posts */}
        <section className="space-y-3">
          {busy && <div className="text-sm text-gray-500 dark:text-gray-400">{isThreadView ? 'Loading thread…' : 'Loading board…'}</div>}
          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
          {!busy && !err && threads.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">{isThreadView ? 'No posts in this thread.' : 'No threads yet. Start one!'}</div>
          )}
        {/* In thread view, reverse order so original post is at top, replies below */}
        {(isThreadView ? [...threads].reverse() : threads).map((ref, index, arr) => {
          const c = firstPosts[ref]
          const author = c?.payload.subject ?? ""
          const authorLc = author.toLowerCase()
          // In thread view, the first post (index 0) is the original post
          const isOriginalPost = isThreadView && index === 0

          const postItem = (
            <PostItem
              key={ref}
              refHex={ref}
              author={c?.payload.subject ?? "(unknown)"}
              displayName={c?.payload.displayName}
              avatarRef={pickAvatarRefFromPayload(c?.payload) ?? undefined}
              currentAvatarRef={
                authorLc && myAddr && authorLc === myAddr
                  ? (pickAvatarRefFromProfile(profile) ?? null)
                  : null
              }
              content={c?.payload.content ?? "(no content)"}
              createdAt={c?.payload.createdAt ?? 0}
              boardId={BOARD_ID}
              threadRef={isThreadView ? threadParam : ref}
              isRoot={!isThreadView || isOriginalPost}
              onMutedThread={(!isThreadView || isOriginalPost) ? () => {
                setThreads((prev) => prev.filter((r) => r !== ref));
                setFirstPosts((prev) => {
                  const next = { ...prev };
                  delete next[ref];
                  return next;
                });
              } : undefined}
            />
          )

          return isThreadView ? (
            postItem
          ) : (
            <StaticLink key={ref} href={`/forum/?thread=${ref}`} className="block hover:opacity-90 transition">
              {postItem}
            </StaticLink>
          )
          })}
        </section>
      </div>
    </main>
  )
}

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-gray-600 dark:text-gray-400">Loading...</div>}>
      <ForumContent />
    </Suspense>
  )
}
