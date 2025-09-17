// src/app/api/forum/board/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { Bee, PrivateKey } from "@ethersphere/bee-js"
import { BEE_URL, FEED_PRIVATE_KEY, normalizePk } from "@/config/swarm"
import { topicBoard } from "@/lib/forum/topics"
import { extractFeedPayloadBytes } from "@/lib/forum/bytes"

// 2) Construct Bee client + derive feed owner (platform signer)
const bee = new Bee(BEE_URL)
const owner = new PrivateKey(normalizePk(FEED_PRIVATE_KEY)).publicKey().address()

// --- small utils -------------------------------------------------------------

/** Uint8Array → lowercase hex string (no 0x) */
function toHex(u8: Uint8Array): string {
  let s = ""
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0")
  return s
}

/**
 * Decode a 4096-byte "page" into an array of 32-byte refs (newest-first).
 * This matches bchan's packer (and your pack.ts):
 * - Page = 4096B
 * - Each entry = 32B (Swarm ref)
 * - Max 128 entries
 * - Zero-filled tail indicates "no more entries"
 */
function decodeRefs(page: Uint8Array): string[] {
  const out: string[] = []
  for (let off = 0; off + 32 <= page.length; off += 32) {
    const slice = page.subarray(off, off + 32)

    // stop when we hit an all-zero entry
    let allZero = true
    for (let i = 0; i < 32; i++) {
      if (slice[i] !== 0) { allZero = false; break }
    }
    if (allZero) break

    out.push(toHex(slice)) // push as 64-hex (no 0x)
  }
  return out // newest-first
}

/** Convert unknown error to readable string (no `any`) */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// --- handler ----------------------------------------------------------------

/**
 * GET /api/forum/board?boardId=devconnect:general
 *
 * Reads the *board* feed page owned by the platform signer and returns an array
 * of thread root refs (64-hex, newest-first). This mirrors bchan:
 *
 *   topic = keccak256("board:" + boardId)
 *   owner = platform signer address (feeds are owned by platform)
 *   payload = 4096B page of 32B refs
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now(); // 
  try {
    // 1) Validate input
    const boardId = req.nextUrl.searchParams.get("boardId") ?? ""
    if (!boardId) {
      return NextResponse.json({ ok: false, error: "MISSING_BOARD_ID" }, { status: 400 })
    }

    // 3) Deterministic topic for "board page"
    const topic = topicBoard(boardId)

    // 4) Try to read latest feed payload (single 4096B page) — tolerate uninitialised feed
    let bytes: Uint8Array | null = null;
    try {
    const res = await bee.makeFeedReader(topic, owner).downloadPayload();
    bytes = extractFeedPayloadBytes(res);
    console.log("[api:board] feed ms", Date.now() - t0);
    } catch (e) {
    
    // If the board feed hasn't been written yet, treat as empty (bchan behaviour)
    const msg = errMsg(e).toLowerCase();
    const notInitialised =
        msg.includes("404") ||
        msg.includes("not found") ||
        msg.includes("no feed update") ||
        msg.includes("feed not found");
    if (!notInitialised) throw e;
    bytes = null;
    }

    // 5) Decode page (if present) into a list of 64-hex thread root refs (newest-first)
    const threads = bytes ? decodeRefs(bytes) : [];

    // 6) Respond
    console.log("[api:board] total ms", Date.now() - t0);
    return NextResponse.json({ ok: true, boardId, threads });
  } catch (e: unknown) {
    console.error("GET /api/forum/board error:", errMsg(e))
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 })
  }
}
