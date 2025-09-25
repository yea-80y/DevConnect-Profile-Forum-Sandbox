// src/app/api/forum/board/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Bee, PrivateKey } from "@ethersphere/bee-js";
import { BEE_URL, FEED_PRIVATE_KEY, normalizePk } from "@/config/swarm";
import { topicBoard } from "@/lib/forum/topics";
import { extractFeedPayloadBytes } from "@/lib/forum/bytes"; // your helper

// Construct Bee + derive feed owner (platform signer).
// NOTE: If you ever rotate FEED_PRIVATE_KEY you won't see old board pages,
// because feed reads are keyed by (topic, ownerAddress).
const bee = new Bee(BEE_URL);
const owner = new PrivateKey(normalizePk(FEED_PRIVATE_KEY)).publicKey().address();

// Uint8Array → lowercase hex (no 0x)
function toHex(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0");
  return s;
}

/**
 * Decode a 4096-byte "page" into an array of 32-byte refs (newest-first).
 * Layout:
 *   - Page size = 4096 bytes
 *   - Entry     = 32 bytes (Swarm ref)
 *   - Max       = 128 entries
 *   - Zero-filled tail = no more entries
 */
function decodePage(page: Uint8Array): string[] {
  const out: string[] = [];
  for (let off = 0; off + 32 <= page.length; off += 32) {
    const slice = page.subarray(off, off + 32);
    // stop at the first all-zero entry
    let allZero = true;
    for (let i = 0; i < 32; i++) {
      if (slice[i] !== 0) { allZero = false; break; }
    }
    if (allZero) break;
    out.push(toHex(slice)); // push as 64-hex (no 0x)
  }
  return out;
}

// Small helper: normalize unknown error to string
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * GET /api/forum/board?boardId=<namespace:board>
 * Reads the board page (binary 4096B) written by the platform signer and returns
 * an array of thread-root refs (64-hex, newest-first). If the feed isn't
 * initialised yet, returns an empty list (no 500).
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  try {
    const boardId = (req.nextUrl.searchParams.get("boardId") || "").trim();

    if (!boardId) {
      return NextResponse.json({ ok: false, error: "MISSING_BOARD_ID" }, { status: 400 });
    }
    // Allow alphanum + dot/underscore/dash/colon (covers "devconnect_test:general")
    if (!/^[a-z0-9._:-]{1,64}$/i.test(boardId)) {
      return NextResponse.json({ ok: false, error: "BAD_BOARD_ID" }, { status: 400 });
    }
    if (!BEE_URL || !FEED_PRIVATE_KEY) {
      return NextResponse.json({ ok: false, error: "SERVER_ENV" }, { status: 500 });
    }

    // Deterministic topic for this board ID
    const topic = topicBoard(boardId);

    // Read latest feed payload (single 4096B page); tolerate non-initialised feed
    let pageBytes: Uint8Array | null = null;
    try {
      const res = await bee.makeFeedReader(topic, owner).downloadPayload();
      pageBytes = extractFeedPayloadBytes(res); // your helper → Uint8Array or throw
      console.log("[api:board] feed ms", Date.now() - t0);
    } catch (e) {
      const msg = errMsg(e).toLowerCase();
      const notInit =
        msg.includes("404") ||
        msg.includes("not found") ||
        msg.includes("no feed update") ||
        msg.includes("feed not found");
      if (!notInit) throw e;
      pageBytes = null;
    }

    // Decode page into 64-hex thread roots (newest-first)
    const threads = pageBytes ? decodePage(pageBytes) : [];

    console.log("[api:board] total ms", Date.now() - t0);
    return NextResponse.json({ ok: true, boardId, threads });
  } catch (e: unknown) {
    console.error("GET /api/forum/board error:", errMsg(e));
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
