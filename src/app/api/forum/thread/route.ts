// src/app/api/forum/thread/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { Bee, PrivateKey } from "@ethersphere/bee-js"
import { BEE_URL, FEED_PRIVATE_KEY, normalizePk } from "@/config/swarm"
import { topicThread } from "@/lib/forum/topics"
import { extractFeedPayloadBytes } from "@/lib/forum/bytes"

// --- small utils -------------------------------------------------------------

/** Uint8Array → lowercase hex string (no 0x) */
function toHex(u8: Uint8Array): string {
  let s = ""
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0")
  return s
}

/** Same 4096B page → array of 32B refs (newest-first) as in board route */
function decodeRefs(page: Uint8Array): string[] {
  const out: string[] = []
  for (let off = 0; off + 32 <= page.length; off += 32) {
    const slice = page.subarray(off, off + 32)
    let allZero = true
    for (let i = 0; i < 32; i++) {
      if (slice[i] !== 0) { allZero = false; break }
    }
    if (allZero) break
    out.push(toHex(slice))
  }
  return out
}

/** validate 64-hex (no 0x) */
const is64Hex = (s: string) => /^[0-9a-fA-F]{64}$/.test(s)

/** error → string (no `any`) */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// --- handler ----------------------------------------------------------------

/**
 * GET /api/forum/thread?boardId=devconnect:general&threadRef=<64-hex>
 *
 * Reads the *thread* feed page owned by the platform signer and returns an
 * array of post refs (64-hex, newest-first). Mirrors bchan:
 *
 *   topic = keccak256("thread:" + boardId + ":" + threadRef)
 *   owner = platform signer address
 *   payload = 4096B page of 32B refs
 */
export async function GET(req: NextRequest) {
  try {
    // 1) Inputs
    const boardId = req.nextUrl.searchParams.get("boardId") ?? ""
    const threadRef = (req.nextUrl.searchParams.get("threadRef") ?? "").toLowerCase()

    if (!boardId) {
      return NextResponse.json({ ok: false, error: "MISSING_BOARD_ID" }, { status: 400 })
    }
    if (!is64Hex(threadRef)) {
      return NextResponse.json({ ok: false, error: "BAD_THREAD_REF" }, { status: 400 })
    }

    // 2) Bee + platform signer address (feed owner)
    const bee = new Bee(BEE_URL)
    const owner = new PrivateKey(normalizePk(FEED_PRIVATE_KEY)).publicKey().address()

    // 3) Deterministic topic for this thread
    const topic = topicThread(boardId, threadRef)

    // 4) Read the latest 4096B page
    const res = await bee.makeFeedReader(topic, owner).downloadPayload()

    // 5) Extract bytes across bee-js payload variants
    const bytes = extractFeedPayloadBytes(res)

    // 6) Decode into 64-hex post refs (newest-first)
    const posts = decodeRefs(bytes)

    // 7) Respond
    return NextResponse.json({ ok: true, boardId, threadRef, posts })
  } catch (e: unknown) {
    console.error("GET /api/forum/thread error:", errMsg(e))
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 })
  }
}
