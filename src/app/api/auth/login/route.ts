import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAddress, verifyTypedData, type TypedDataDomain, type TypedDataField } from "ethers"
import { createHmac } from "crypto"

export const runtime = "nodejs"

type AdminLoginMsg = {
  host: string
  nonce: string
  issuedAt: number
  purpose: "moderation-login"
}
type LoginBody = { address: string; signature: string; message: AdminLoginMsg }

const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean)

const SESSION_SECRET = (process.env.SESSION_SECRET || "dev-secret-change-me")
const SESSION_TTL_SEC = 60 * 60 * 24 // 24h

const DOMAIN: TypedDataDomain = { name: "WoCo Admin Auth", version: "1" }
const TYPES: Record<string, TypedDataField[]> = {
  AdminLogin: [
    { name: "host", type: "string" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "purpose", type: "string" },
  ],
}

function isLoginBody(x: unknown): x is LoginBody {
  if (!x || typeof x !== "object") return false
  const b = x as Record<string, unknown>
  const m = b.message as Record<string, unknown> | undefined
  return (
    typeof b.address === "string" &&
    typeof b.signature === "string" &&
    !!m &&
    typeof m.host === "string" &&
    typeof m.nonce === "string" &&
    m.purpose === "moderation-login" &&
    typeof m.issuedAt === "number" &&
    Number.isFinite(m.issuedAt)
  )
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}
function signSession(payload: string): string {
  const mac = createHmac("sha256", SESSION_SECRET).update(payload).digest()
  return b64url(mac)
}
function issueSession(address: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  const payload = `${address}.${exp}`
  const sig = signSession(payload)
  return `${payload}.${sig}`
}

const SECURE = process.env.NODE_ENV === "production"   // ← NEW

/** POST /api/auth/login */
export async function POST(req: Request) {
  const store = await cookies()
  const cookieNonce = store.get("dc_admin_nonce")?.value
  if (!cookieNonce) return NextResponse.json({ ok: false, error: "No nonce" }, { status: 400 })

  const bodyUnknown = await req.json()
  if (!isLoginBody(bodyUnknown)) {
    return NextResponse.json({ ok: false, error: "Bad payload" }, { status: 400 })
  }
  const body = bodyUnknown

  // anti-replay
  if (body.message.nonce !== cookieNonce)
    return NextResponse.json({ ok: false, error: "Nonce mismatch" }, { status: 400 })
  if (body.message.purpose !== "moderation-login")
    return NextResponse.json({ ok: false, error: "Bad purpose" }, { status: 400 })
  if (Math.abs(Math.floor(Date.now() / 1000) - body.message.issuedAt) > 600)
    return NextResponse.json({ ok: false, error: "Expired" }, { status: 400 })

  // (optional) host check — uncomment if you want to enforce it
  // const reqHost = new URL(req.url).host
  // if (body.message.host !== reqHost)
  //   return NextResponse.json({ ok:false, error:"Host mismatch" }, { status:400 })

  // recover signer
  const recovered = verifyTypedData(DOMAIN, TYPES, body.message, body.signature)
  const recAddr = getAddress(recovered)
  const wantAddr = getAddress(body.address)
  if (recAddr !== wantAddr)
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 })

  // whitelist
  if (!ADMIN_ADDRESSES.includes(wantAddr.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Not an admin" }, { status: 403 })

  // issue HMAC session (address.exp.signature)
  const token = issueSession(wantAddr)

  const res = NextResponse.json({ ok: true, address: wantAddr, isAdmin: true })
  res.cookies.set("dc_admin_session", token, {
    httpOnly: true, sameSite: "lax", secure: SECURE, path: "/", maxAge: SESSION_TTL_SEC,
  })
  res.cookies.delete("dc_admin_nonce")
  return res
}
