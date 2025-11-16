// src/components/forum/Composer.tsx
"use client"

/**
 * Composer
 * - New thread when replyTo is undefined
 * - Reply when replyTo is a 64-hex thread root
 * - Uses a dev Wallet(privateKey) from localStorage
 * - Embeds a *snapshot* of current profile (name + avatarRef) into the payload
 * - OPTIMISTIC UI: immediately emits onOptimistic(), then does the network submit in background.
 *   When the server confirms, emits onPosted() with the same clientTag so the page can replace.
 */

import { ChangeEvent, useState } from "react"
import usePostingIdentity from "@/lib/auth/usePostingIdentity"
import { Button } from "@/components/ui/button"
import { sha256HexString } from "@/lib/forum/crypto"
import { submitPost } from "@/lib/forum/client"
import type { SignedPostPayload } from "@/lib/forum/types"
import { useProfile } from "@/lib/profile/context"

// --- helpers ------------------------------------------------------------------

const to64Hex = (s?: string | null) => {
  if (!s) return null
  const h = s.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "")
  return h.length === 64 ? h : null
}

// Read a 64-hex avatar content hash from any of our known profile shapes (no `any`)
function pickAvatarRefFromProfile(profile: unknown): string | null {
  if (!profile || typeof profile !== "object") return null
  const r = profile as Record<string, unknown>

  const direct = typeof r["avatarRef"] === "string" ? to64Hex(r["avatarRef"]) : null
  const hex    = typeof r["avatarRefHex"] === "string" ? to64Hex(r["avatarRefHex"]) : null

  const avatar = r["avatar"]
  const nested = avatar && typeof avatar === "object"
    ? ((): string | null => {
        const ra = avatar as Record<string, unknown>
        return typeof ra["ref"] === "string" ? to64Hex(ra["ref"]) : null
      })()
    : null

  return direct ?? hex ?? nested ?? null
}

// Narrow at runtime for typed signature
function assertHex0x(v: string): asserts v is `0x${string}` {
  if (!/^0x[0-9a-fA-F]+$/.test(v)) throw new Error("Signature not valid hex (0x…) ")
}

// LocalStorage keys for the dev wallet private key**

// --- component ----------------------------------------------------------------

export function Composer(props: {
  boardId: string
  replyTo?: string // 64-hex root when replying
  /**
   * Fired immediately with a locally-tagged placeholder (clientTag) so the page
   * can insert the post/thread *instantly*.
   */
  onOptimistic?: (o: {
    clientTag: string
    postRef: string
    threadRef: string
    payload: SignedPostPayload
  }) => void
  /**
   * Fired when the server confirms; includes the same clientTag so the page can
   * replace the optimistic row with the real ref.
   */
  onPosted?: (res: { postRef: string; threadRef: string; clientTag?: string }) => void
}) {
  const { boardId, replyTo, onOptimistic, onPosted } = props

  const [content, setContent] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Snapshot current profile (name + avatarRef) for embedding in payload
  const { profile } = useProfile()

  // Load dev wallet (private key) from localStorage once**
  // After: const { profile } = useProfile()
  const id = usePostingIdentity()

  // block until storage & checks are done
  if (!id.ready) {
    return (
      <div className="rounded border p-3 bg-white/90">
        <div className="text-sm">Loading identity…</div>
      </div>
    )
  }

  // Web3 sessions must have a valid capability
  if (id.kind === "web3" && id.postAuth === "blocked") {
    return (
      <div className="rounded border p-3 bg-white/90 space-y-2">
        <div className="text-sm font-semibold text-gray-900">Authorize posting</div>
        <p className="text-sm">
          You need to authorize a posting key with your wallet before posting.
        </p>
        <Button onClick={id.signCapabilityNow}>Authorize (EIP-712)</Button>
      </div>
    )
  }
  

  async function onSubmit() {
    setErr(null)

    if (!id.safe) { setErr("No active posting key. Log in first."); return }
    if (id.kind === "web3" && id.postAuth !== "parent-bound") {
      setErr("Wallet is connected but not authorized to post yet.");
      return;
    }
    if (!content.trim()) { setErr("Write something first"); return }

    setBusy(true) // block double-clicks during preflight

    // Make an optimistic local id to correlate UI + final server refs
    const clientTag = crypto.randomUUID()
    const localPostRef   = `local:${clientTag}`
    const localThreadRef = replyTo ?? `local:${clientTag}`

    try {
      const t0 = performance.now()

    // Determine the actor (whose profile to resolve); signer remains the safe key
    const actor = id.kind === "web3" ? id.parent : id.safe
    if (!actor) { setErr("Missing actor address"); return }


      // --- Build the SignedPostPayload (fast) ---------------------------------
      const snapshotAvatarRef = pickAvatarRefFromProfile(profile)
      const contentHash = (await sha256HexString(content)) as `0x${string}`

      const payload: SignedPostPayload = {
        subject: actor as `0x${string}`,
        boardId,
        threadRef: replyTo ?? undefined,
        content,
        contentSha256: contentHash,
        displayName: profile?.name ?? undefined,
        avatarRef: snapshotAvatarRef ?? undefined, // include only if present
        createdAt: Date.now(),
        nonce: crypto.getRandomValues(new Uint32Array(4)).join("-"),
        version: 1,
      }

      // --- Fire OPTIMISTIC callback immediately (no network yet) --------------
      onOptimistic?.({
        clientTag,
        postRef: localPostRef,
        threadRef: localThreadRef,
        payload,
      })

      // --- Sign the payload (dev) ---------------------------------------------
      const signed = await id.signPost(JSON.stringify(payload))
      assertHex0x(signed)
      const signature = signed

      // Clear input early for snappy feel; background submit will continue
      setContent("")
      setBusy(false)

      console.log("[compose] build+sign ms", Math.round(performance.now() - t0))

      // --- Background publish (DON'T await UI) --------------------------------
      ;(async () => {
        const tNet0 = performance.now()
        try {
          const extraHeaders =
            id.kind === "web3"
              ? {
                  "x-posting-kind": "web3",
                  "x-posting-parent": id.parent!,   // 0x...
                  "x-posting-key": id.safe!,        // posting key (signer)
                  "x-posting-auth": "parent-bound", // you already gate the button on this
                }
              : undefined;

          const res = await submitPost(
            { payload, signature, signatureType: "eip191" },
            extraHeaders
          );
          console.log("[compose] /api/forum/post ms", Math.round(performance.now() - tNet0))

          // Server confirmed; let the page swap the optimistic row for real ones
          onPosted?.({ ...res, clientTag })
        } catch (e: unknown) {
          console.log("[compose] /api/forum/post FAILED ms", Math.round(performance.now() - tNet0))
          const msg = e instanceof Error ? e.message : String(e)
          setErr(msg)
          // Optional: you could emit a failure event with clientTag for the page to mark the row
          // onPosted?.({ postRef: localPostRef, threadRef: localThreadRef, clientTag })
        }
      })()
    } catch (e: unknown) {
      // Preflight failed (e.g., signing error)
      setBusy(false)
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
    }
  }

  return (
    <div className="rounded border p-3 bg-white/90 space-y-2">
      <div className="text-sm font-semibold text-gray-900">{replyTo ? "Reply" : "Start a thread"}</div>

      {/* Plain textarea keeps typing perf solid */}
      <textarea
        value={content}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
        placeholder={replyTo ? "Write a reply…" : "Write a new thread…"}
        className="w-full min-h-[90px] rounded border p-2 text-gray-900"
      />

      <div className="flex items-center gap-2">
        <Button
          onClick={onSubmit}
          disabled={
            busy ||
            !content.trim() ||
            (id.kind === "web3" && id.postAuth !== "parent-bound")
          }
        >
          {busy ? "Posting…" : "Post"}
        </Button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  )
}
