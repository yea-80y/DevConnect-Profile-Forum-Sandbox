// src/app/api/auth/me/route.ts
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAddress } from "ethers"
import { createHmac, timingSafeEqual } from "crypto"

export const runtime = "nodejs" // ensure Node crypto is available

// Comma-separated list of admin wallet addresses.
// Example in .env.local: ADMIN_ADDRESSES=0xabc...,0xdef...
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

// Secret used to HMAC-sign the session token (address.exp.signature).
// For prototype you can leave the default, but strongly set this in .env.local.
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me"

/**
 * Base64url helpers (compact cookie-safe encoding)
 * b64url(Buffer) -> string
 * fromB64url(string) -> Buffer
 */
function b64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}
function fromB64url(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4)           // add missing '=' padding
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad)
  return Buffer.from(base64, "base64")
}

/**
 * signSession(payload) → base64url(HMAC_SHA256(payload, SESSION_SECRET))
 * payload = `${address}.${exp}`
 */
function signSession(payload: string): string {
  const mac = createHmac("sha256", SESSION_SECRET).update(payload).digest()
  return b64url(mac)
}

/**
 * verifySessionToken(token)
 * Token format: "address.exp.signature"
 * - Checks exp (unix seconds) is in the future
 * - HMAC checks signature using SESSION_SECRET
 * - Normalizes the address via ethers.getAddress
 * - Uses timingSafeEqual to avoid subtle timing leaks
 * Returns { address } on success, null otherwise.
 */
function verifySessionToken(token: string): { address: string } | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  const [addr, expStr, sig] = parts
  const exp = Number(expStr)
  const now = Math.floor(Date.now() / 1000)

  // Expired or invalid exp
  if (!Number.isFinite(exp) || exp < now) return null

  // Recompute signature and compare
  const payload = `${addr}.${expStr}`
  const expected = fromB64url(signSession(payload))
  const got = fromB64url(sig)
  if (expected.length !== got.length) return null
  if (!timingSafeEqual(expected, got)) return null

  // Normalize/validate address (throws if bad)
  try {
    return { address: getAddress(addr) }
  } catch {
    return null
  }
}

/**
 * GET /api/auth/me
 * - Reads the HMAC session cookie set by /api/auth/login
 * - Verifies it and returns { isAdmin, address } for client-side gating
 * - If no/invalid cookie → { isAdmin:false, address:null }
 */
export async function GET() {
  // In Next 14/15, cookies() is async; await it to read request cookies.
  const store = await cookies()
  const token = store.get("dc_admin_session")?.value

  if (!token) {
    return NextResponse.json({ ok: true, isAdmin: false, address: null })
  }

  const parsed = verifySessionToken(token)
  if (!parsed) {
    return NextResponse.json({ ok: true, isAdmin: false, address: null })
  }

  // Admin if their normalized address is in the allowlist
  const isAdmin = ADMIN_ADDRESSES.includes(parsed.address.toLowerCase())

  // Tip: add { cache: "no-store" } on the client fetch for fresh reads
  return NextResponse.json({ ok: true, isAdmin, address: parsed.address })
}
