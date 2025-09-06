// src/lib/forum/client.ts
// -----------------------------------------------------------------------------
// Tiny forum helpers (bchan-aligned):
// - Board/thread read via our API routes
// - Posts fetched from Bee (prefer /bytes, fallback /bzz)
// - Submits go to /api/forum/post and expect { ok, postRef, threadRef }
// -----------------------------------------------------------------------------

import { BEE_URL } from "@/config/swarm"
import type { SignedPostPayload, SignatureType } from "./types"

export type CanonicalPost = {
  kind: "post"
  payload: SignedPostPayload
  signature: `0x${string}`
  signatureType: SignatureType
  server: { receivedAt: number; boardTopic: `0x${string}`; threadTopic: `0x${string}` }
  v: 1
}

/** GET /api/forum/board?boardId=... → list of thread root refs (64-hex) */
export async function fetchBoard(boardId: string) {
  const r = await fetch(`/api/forum/board?boardId=${encodeURIComponent(boardId)}`, { cache: "no-store" })
  const j = await r.json()
  if (!r.ok || !j?.ok) throw new Error(j?.error || "BOARD_FETCH_FAILED")
  return j as { ok: true; boardId: string; threads: string[] }
}

/** GET /api/forum/thread?boardId=...&threadRef=... → list of post refs (64-hex) */
export async function fetchThread(boardId: string, threadRef: string) {
  const r = await fetch(
    `/api/forum/thread?boardId=${encodeURIComponent(boardId)}&threadRef=${threadRef}`,
    { cache: "no-store" },
  )
  const j = await r.json()
  if (!r.ok || !j?.ok) throw new Error(j?.error || "THREAD_FETCH_FAILED")
  return j as { ok: true; boardId: string; threadRef: string; posts: string[] }
}

/** Fetch canonical post JSON by Swarm ref (try /bytes first, then /bzz) */
export async function fetchPostJSON(refHex: string): Promise<CanonicalPost> {
  // 1) raw JSON uploads 
  const r1 = await fetch(`${BEE_URL}/bytes/${refHex}`, { cache: "no-store" });
  if (r1.ok) return r1.json();

  // 2) manifest fallback (in case a post was stored as a manifest)
  const r2 = await fetch(`${BEE_URL}/bzz/${refHex}`, { cache: "no-store" });
  if (r2.ok) return r2.json();

  // 3) some Bee setups require the trailing slash on /bzz
  const r3 = await fetch(`${BEE_URL}/bzz/${refHex}/`, { cache: "no-store" });
  if (r3.ok) return r3.json();

  throw new Error(`FETCH_POST_FAILED ${refHex}`);
}

/** POST /api/forum/post → create thread (no threadRef in payload) or reply (with threadRef) */
export async function submitPost(body: {
  payload: SignedPostPayload
  signature: `0x${string}`
  signatureType: SignatureType
}) {
  const r = await fetch("/api/forum/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok || !j?.ok) throw new Error(j?.error || "POST_FAILED")
  return j as { ok: true; postRef: string; threadRef: string }
}