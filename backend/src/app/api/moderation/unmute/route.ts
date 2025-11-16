// Removes a ref from the muted list on Swarm (admin-only)
// Uses the same admin session cookie (HMAC) set by /api/auth/login

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { removeMuted } from "@/lib/moderation/store-swarm"
import { getAddress } from "ethers"
import { createHmac, timingSafeEqual } from "crypto"

export const runtime = "nodejs"

// ADMIN allowlist (addresses lowercased)
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

// same HMAC session verification as /api/moderation/mute
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me"

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}
function fromB64url(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4)
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad)
  return Buffer.from(base64, "base64")
}
function signSession(payload: string): string {
  const mac = createHmac("sha256", SESSION_SECRET).update(payload).digest()
  return b64url(mac)
}
function verifySessionToken(token: string): { address: string } | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [addr, expStr, sig] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  const payload = `${addr}.${expStr}`
  const expected = fromB64url(signSession(payload))
  const got = fromB64url(sig)
  if (expected.length !== got.length) return null
  if (!timingSafeEqual(expected, got)) return null
  try { return { address: getAddress(addr) } } catch { return null }
}

function isHex64(x: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(x.startsWith("0x") ? x.slice(2) : x)
}

/** POST /api/moderation/unmute
 * body: { boardId: string, ref: string (64-hex), kind: "thread"|"reply" }
 * idempotent: removing a ref that isn't present is a no-op.
 */
export async function POST(req: Request) {
  // 1) require a valid admin session
  const jar = await cookies()
  const token = jar.get("dc_admin_session")?.value
  const parsed = token ? verifySessionToken(token) : null
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  // 1b) require allowlisted admin
  const isAdmin = ADMIN_ADDRESSES.includes(parsed.address.toLowerCase())
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  // 2) validate input
  const { boardId, ref, kind } = await req.json() as {
    boardId?: string
    ref?: string
    kind?: "thread" | "reply"
  }
  if (!boardId || !ref || (kind !== "thread" && kind !== "reply") || !isHex64(ref)) {
    return NextResponse.json({ ok: false, error: "Bad input" }, { status: 400 })
  }

  // 3) remove ref from the Swarm moderation feed (idempotent)
  await removeMuted(boardId, kind, ref)

  return NextResponse.json({ ok: true })
}
