// src/app/api/auth/admin/elevate/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Elevate to moderator:
 * - NO new signature.
 * - Reads the parent (web3) address from the client-set cookie "woco_subject0x"
 *   which is written by usePostingIdentity after the first EIP-712 login. cite: usePostingIdentity.tsx
 * - If the parent is in ADMIN_ADDRESSES (.env), elevation succeeds.
 * - Optionally sets a tiny httpOnly flag cookie "dc_admin" to speed up UI checks.
 */

export const runtime = "nodejs";

const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const SECURE = process.env.NODE_ENV === "production";
const ADMIN_FLAG_COOKIE = "dc_admin";       // optional UI flag
const SUBJECT_COOKIE = "woco_subject0x";    // set/cleared by usePostingIdentity (client) :contentReference[oaicite:2]{index=2}

function readParentFromCookie(req: NextRequest): string | null {
  const v = req.cookies.get(SUBJECT_COOKIE)?.value;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : null;
}

export async function POST(req: NextRequest) {
  try {
    const parent = readParentFromCookie(req);
    if (!parent) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    const isAdmin = ADMIN_ADDRESSES.includes(parent.toLowerCase());
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Not an admin" }, { status: 403 });
    }

    // Option A: stateless (no cookies) — just return ok:true
    // return NextResponse.json({ ok: true });

    // Option B: set a tiny httpOnly flag (purely for convenience)
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_FLAG_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE,
      path: "/",
      maxAge: 12 * 60 * 60, // 12h
    });
    return res;
  } catch (e) {
    console.error("admin/elevate error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
