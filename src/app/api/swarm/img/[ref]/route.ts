// Lightweight Bee→browser image proxy.
// Goal: avoid Bee's occasional wrong Content-Length on /bzz responses,
// and strip Range so the browser doesn't do partial downloads that break images.
//
// Usage from client: /api/swarm/img/<64-hex-ref>?v=<cache-buster>
//
// Behaviour:
// - Try /bytes first (fast path), then /bzz, then /bzz with trailing slash.
// - Stream the body back WITHOUT Content-Length (chunked), set Content-Type,
//   mark as no-store. Also disable Range in/out.
//
// Notes:
// - Keep this Node runtime so it can reach your Bee (local/private).
// - We forward the original query string (e.g. ?v=cache-buster).

// src/app/api/swarm/img/[ref]/route.ts
import type { NextRequest } from "next/server"

const BEE = process.env.BEE_URL || "http://localhost:1633"

// Consider something "image-like" only if:
// - content-type starts with image/*, OR
// - octet-stream with non-zero length (raw bytes avatar)
function isRenderableImage(contentType: string | null, byteLen: number): boolean {
  if (byteLen <= 0) return false
  if (!contentType) return true // some Bee nodes omit it; allow if bytes exist
  const ct = contentType.toLowerCase()
  if (ct.startsWith("image/")) return true
  if (ct === "application/octet-stream") return true
  // Reject common non-image types that gateways sometimes 200-return
  if (ct.startsWith("text/")) return false
  if (ct.includes("json")) return false
  if (ct.includes("html")) return false
  return false
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ ref: string }> }
) {
  const { ref } = await ctx.params
  const refHex = (ref || "").toLowerCase()

  // Basic hex validation for Swarm ref
  if (!/^[0-9a-f]{64}$/.test(refHex)) {
    return new Response("bad ref", {
      status: 400,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Accept-Ranges": "none",
      },
    })
  }

  // Try common fetch variants. /bzz first (matches your ProfileView behaviour)
  const paths = [
    `/bzz/${refHex}`,
    `/bzz/${refHex}/`,
    `/bzz/${refHex}?download=true`,
    `/bytes/${refHex}`,
  ]

  for (const p of paths) {
    try {
      const beeRes = await fetch(`${BEE}${p}`, {
        headers: { Accept: "image/*,application/octet-stream" },
        cache: "no-store", // do not cache upstream responses
      })
      if (!beeRes.ok) continue

      // Buffer fully to avoid streaming/range inconsistencies
      const buf = await beeRes.arrayBuffer()
      const ct = beeRes.headers.get("content-type")

      // Only return 200 if this is actually renderable as an image
      if (!isRenderableImage(ct, buf.byteLength)) {
        // Try next variant; do NOT return a misleading 200
        continue
      }

      // Success: strong cache (Swarm refs are immutable) + disable ranges
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": ct || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Accept-Ranges": "none",
        },
      })
    } catch {
      // Try the next path variant
    }
  }

  // Not found: explicitly no-store so broken snapshots don't get "stuck"
  return new Response("not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Accept-Ranges": "none",
    },
  })
}
