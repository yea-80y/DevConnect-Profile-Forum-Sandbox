// src/components/forum/Composer.tsx
"use client"

// -----------------------------------------------------------------------------
// Composer
// - If replyTo is undefined → creates a new thread (post becomes thread root)
// - If replyTo is set (64-hex) → creates a reply in that thread
// - Signs message with Wallet(privateKey) from localStorage (dev flow)
// - Includes *snapshot* profile fields from your ProfileContext into the payload
// -----------------------------------------------------------------------------

import { ChangeEvent, useMemo, useState } from "react"
import { Wallet } from "ethers"
import { Button } from "@/components/ui/button"
import { sha256HexString } from "@/lib/forum/crypto"
import { submitPost } from "@/lib/forum/client"
import type { SignedPostPayload } from "@/lib/forum/types"
import { useProfile } from "@/lib/profile/context"

// 🔧 ADDED: tiny runtime + TS guard that narrows `string` → `` `0x${string}` ``.
function assertHex0x(v: string): asserts v is `0x${string}` {
  if (!/^0x[0-9a-fA-F]+$/.test(v)) {
    throw new Error("Signature not valid hex with 0x prefix")
  }
}

// LocalStorage keys where you keep the dev account private key
const ACTIVE_PK_KEY = "woco.active_pk"
const LEGACY_PK_KEY = "demo_user_pk"

export function Composer(props: {
  boardId: string
  replyTo?: string // 64-hex thread root ref when replying
  onPosted?: (res: { postRef: string; threadRef: string }) => void
}) {
  const { boardId, replyTo, onPosted } = props

  const [content, setContent] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

    type OptimisticRow = {
    body: string
    status: "posting" | "ok" | "error"
    postRef?: string
    threadRef?: string
    error?: string
    }

    // note: we only keep the setter to avoid the "unused var" warning
    const [, setOptimistic] = useState<Record<string, OptimisticRow>>({})

    function addOptimistic(localId: string, body: string) {
    setOptimistic(prev => ({ ...prev, [localId]: { body, status: "posting" } }))
    }

    function markOptimistic(localId: string, patch: Partial<OptimisticRow>) {
    setOptimistic(prev => ({
        ...prev,
        [localId]: { ...(prev[localId] ?? { body: "", status: "posting" }), ...patch },
    }))
    }

  // Profile context → immutable snapshot (name + avatarRef)
  const { profile } = useProfile()

  // Load dev wallet (private key) from localStorage once
  const wallet = useMemo(() => {
    try {
      const pk =
        (localStorage.getItem(ACTIVE_PK_KEY) ||
          localStorage.getItem(LEGACY_PK_KEY)) as `0x${string}` | null
      return pk ? new Wallet(pk) : null
    } catch {
      return null
    }
  }, [])

  async function onSubmit() {
  setErr(null)

  if (!wallet) { setErr("No active account. Create/select one on Home/Accounts."); return }
  if (!content.trim()) { setErr("Write something first"); return }

  setBusy(true) // prevent double-clicks during preflight

  // 1) Optimistic stub: instant UX
  const localId = crypto.randomUUID()
  addOptimistic(localId, content)

  try {
    const tBuild0 = performance.now()
    // 2) Build + sign (preflight)
    const payload: SignedPostPayload = {
      subject: wallet.address as `0x${string}`,
      boardId,
      threadRef: replyTo ?? undefined,
      content,
      contentSha256: (await sha256HexString(content)) as `0x${string}`,
      displayName: profile?.name ?? undefined,
      avatarRef:   profile?.avatarRef ?? undefined,
      createdAt: Date.now(),
      nonce: crypto.getRandomValues(new Uint32Array(4)).join("-"),
      version: 1,
    }

    const message = JSON.stringify(payload)
    const signed = await wallet.signMessage(message)
    assertHex0x(signed)
    const signature = signed

    const tBuild1 = performance.now()
    console.log("[compose] build+sign ms", Math.round(tBuild1 - tBuild0))

    // 3) Clear input now (snappy) and re-enable button
    setContent("")
    setBusy(false)

    // 4) Background publish (DON'T await)
    ;(async () => {
      const tNet0 = performance.now() 
      try {
        const res = await submitPost({ payload, signature, signatureType: "eip191" })
        console.log("[compose] /api/forum/post ms", Math.round(performance.now() - tNet0))

        markOptimistic(localId, { status: "ok", postRef: res.postRef, threadRef: res.threadRef })
        onPosted?.(res)
      } catch (e: unknown) {
        console.log("[compose] /api/forum/post FAILED ms", Math.round(performance.now() - tNet0))
        const msg = e instanceof Error ? e.message : String(e)
        markOptimistic(localId, { status: "error", error: msg })
        setErr(msg)
      }
    })()
  } catch (e: unknown) {
    // if build/sign failed, re-enable and surface error
    const msg = e instanceof Error ? e.message : String(e)
    setBusy(false)
    markOptimistic(localId, { status: "error", error: msg })
    setErr(msg)
  }
}

  return (
    <div className="rounded border p-3 bg-white/90 space-y-2">
      <div className="text-sm font-semibold">{replyTo ? "Reply" : "Start a thread"}</div>

      {/* Textarea (simplest; avoids typing issues of custom inputs) */}
      <textarea
        value={content}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
        placeholder={replyTo ? "Write a reply…" : "Write a new thread…"}
        className="w-full min-h-[90px] rounded border p-2"
      />

      <div className="flex items-center gap-2">
        <Button onClick={onSubmit} disabled={busy || !content.trim()}>
          {busy ? "Posting…" : "Post"}
        </Button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  )
}
