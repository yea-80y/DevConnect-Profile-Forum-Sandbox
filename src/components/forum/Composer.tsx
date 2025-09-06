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
    if (!wallet) {
      setErr("No active account. Create/select one on Home/Accounts.")
      return
    }
    if (!content.trim()) {
      setErr("Write something first")
      return
    }

    setBusy(true)
    try {
      // 1) Build signed payload
      const payload: SignedPostPayload = {
        subject: wallet.address as `0x${string}`,
        boardId,
        threadRef: replyTo ?? undefined,        // undefined = new thread; set = reply
        content,
        contentSha256: (await sha256HexString(content)) as `0x${string}`,
        displayName: profile?.name ?? undefined,     // snapshot
        avatarRef:   profile?.avatarRef ?? undefined, // snapshot (64-hex swarm ref)
        createdAt: Date.now(),
        nonce: crypto.getRandomValues(new Uint32Array(4)).join("-"), // simple anti-replay
        version: 1,
      }

      // 2) EIP-191 sign the JSON string (server checks signer + content hash)
      const message = JSON.stringify(payload)

      // 🔧 CHANGED: narrow the returned string to `` `0x${string}` `` safely.
      const signed = await wallet.signMessage(message)
      assertHex0x(signed)
      const signature = signed // now typed as `0x${string}`

      // 3) POST to our API
      const res = await submitPost({ payload, signature, signatureType: "eip191" })

      // 4) Clear and notify parent to refresh
      setContent("")
      onPosted?.(res)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
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
        <Button onClick={onSubmit} disabled={busy}>
          {busy ? "Posting…" : "Post"}
        </Button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  )
}
