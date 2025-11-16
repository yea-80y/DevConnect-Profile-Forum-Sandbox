// Lists muted refs for a board/kind (public read; UI subtracts these from the feed)
import { NextResponse } from "next/server"
import { getMuted } from "@/lib/moderation/store-swarm"

export const runtime = "nodejs"

/** GET /api/moderation/muted?boardId=...&kind=thread|reply */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const boardId = url.searchParams.get("boardId") || ""
  const kind = url.searchParams.get("kind") as "thread" | "reply" | null

  if (!boardId || (kind !== "thread" && kind !== "reply")) {
    return NextResponse.json({ ok: false, error: "Bad query" }, { status: 400 })
  }

  const refs = await getMuted(boardId, kind) // 64-hex (lowercase), newest-first
  return NextResponse.json({ ok: true, refs })
}
