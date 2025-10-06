// src/app/api/swarm/img/[ref]/route.ts

// Lightweight Bee → browser image proxy (Node runtime).
// - Normalizes Bee quirks (wrong content-length, range issues, mis-typed content).
// - Immutable refs get long cache; broken refs are no-store so they don't "stick".
// - We forward the original query string (?v=cache-buster) to the browser cache,
//   and (optionally) upstream to Bee — see "search" usage below.

import type { NextRequest } from "next/server";

export const runtime = "nodejs";         // ✅ force Node (can reach local Bee)
export const dynamic = "force-dynamic";  // ✅ don't framework-cache this route

const BEE = process.env.BEE_URL || "http://localhost:1633";
const HEX64 = /^[0-9a-f]{64}$/i;

/** Magic-byte sniff for common image formats (helps when gateways mislabel types). */
function looksLikeImageBytes(buf: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buf);
  if (u8.length < 12) return false;

  // JPEG
  if (u8[0] === 0xff && u8[1] === 0xd8) return true;

  // PNG
  if (
    u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47 &&
    u8[4] === 0x0d && u8[5] === 0x0a && u8[6] === 0x1a && u8[7] === 0x0a
  ) return true;

  // GIF87a / GIF89a
  if (
    u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38 &&
    (u8[4] === 0x37 || u8[4] === 0x39) && u8[5] === 0x61
  ) return true;

  // WebP: "RIFF....WEBP"
  if (
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
    u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50
  ) return true;

  // BMP: "BM"
  if (u8[0] === 0x42 && u8[1] === 0x4d) return true;

  return false;
}

/** Accept if content-type is image/* or octet-stream with bytes, OR bytes sniff as an image. */
function isRenderableImage(contentType: string | null, buf: ArrayBuffer): boolean {
  const byteLen = buf.byteLength;
  if (byteLen <= 0) return false;
  if (!contentType) return true; // some Bee nodes omit it; allow if bytes exist

  const ct = contentType.toLowerCase();
  if (ct.startsWith("image/")) return true;
  if (ct === "application/octet-stream") return true;

  // Some gateways mislabel images as text/plain; fall back to magic-byte sniff.
  if (ct.startsWith("text/")) return looksLikeImageBytes(buf);

  // Reject clear non-image types.
  if (ct.includes("json") || ct.includes("html")) return false;

  return false;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { ref: string } | Promise<{ ref: string }> } // works whether params is a Promise or an object
) {
  // normalize params (handles both Promise and non-Promise cases)
  const { ref } = await Promise.resolve(ctx.params);
  const refHex = (ref || "").toLowerCase();

  // Basic hex validation for Swarm ref
  if (!HEX64.test(refHex)) {
    return new Response("bad ref", {
      status: 400,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Accept-Ranges": "none",
      },
    });
  }

  // Forward the original query string (?v=...) for cache-busting
  const search = new URL(_req.url).search || "";

  // Try common fetch variants. Start with /bzz (matches your ProfileView usage).
  const paths = [
    `/bzz/${refHex}${search}`,
    `/bzz/${refHex}/${search}`,
    `/bzz/${refHex}?download=true`,
    `/bytes/${refHex}${search}`,
  ];

  for (const p of paths) {
    try {
      const beeRes = await fetch(`${BEE}${p}`, {
        headers: { Accept: "image/*,application/octet-stream" },
        cache: "no-store",
      });
      if (!beeRes.ok) continue;

      const buf = await beeRes.arrayBuffer();
      const ct = beeRes.headers.get("content-type");

      if (!isRenderableImage(ct, buf)) continue;

      const contentType =
        ct && !ct.toLowerCase().startsWith("text/") ? ct : "application/octet-stream";

      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Accept-Ranges": "none",
        },
      });
    } catch {
      // try next variant
    }
  }

  return new Response("not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Accept-Ranges": "none",
    },
  });
}
