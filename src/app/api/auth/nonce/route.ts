import { NextResponse } from "next/server"
import { randomBytes } from "crypto"

export const runtime = "nodejs" // using Node crypto

const SECURE = process.env.NODE_ENV === "production"  // ← NEW

/** GET /api/auth/nonce */
export async function GET() {
  const nonce = Buffer.from(randomBytes(16)).toString("hex")
  const res = NextResponse.json({ nonce })
  res.cookies.set("dc_admin_nonce", nonce, {
    httpOnly: true, sameSite: "lax", secure: SECURE, path: "/", maxAge: 600,
  })
  return res
}
