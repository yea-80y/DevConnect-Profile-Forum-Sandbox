// src/components/auth/PostingAuthNudge.tsx
"use client"

import usePostingIdentity from "@/lib/auth/usePostingIdentity"
import { Button } from "@/components/ui/button"

export default function PostingAuthNudge() {
  const id = usePostingIdentity()

  // Render nothing unless we're a web3 session missing capability
  if (!id.ready || id.kind !== "web3" || id.postAuth === "parent-bound" || !id.signCapabilityNow) return null

  return (
    <div className="rounded border p-3 bg-amber-50/60 space-y-2">
      <div className="text-sm">
        Enable posting by authorizing a safe key with your wallet.
      </div>
      <Button onClick={id.signCapabilityNow}>Authorize (EIP-712)</Button>
    </div>
  )
}
