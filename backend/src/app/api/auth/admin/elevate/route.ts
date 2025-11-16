// src/app/api/auth/admin/elevate/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Elevate to moderator:
 * - NO new signature.
 * - Reads the parent (web3) address from:
 *   1. X-Subject-Address header (cross-origin), or
 *   2. woco_subject0x cookie (same-origin)
 * - If the parent is in ADMIN_ADDRESSES (.env), elevation succeeds.
 * - Sets httpOnly cookie "dc_admin" to speed up UI checks.
 */

export const runtime = "nodejs";

const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const SECURE = process.env.NODE_ENV === "production";
const ADMIN_FLAG_COOKIE = "dc_admin";       // httpOnly flag for admin
const SUBJECT_COOKIE = "woco_subject0x";    // set/cleared by usePostingIdentity (client)
const SUBJECT_HEADER = "x-subject-address"; // for cross-origin dev/prod setup

function readParent(req: NextRequest): string | null {
  // Try header first (cross-origin), then cookie (same-origin)
  const header = req.headers.get(SUBJECT_HEADER);
  const cookie = req.cookies.get(SUBJECT_COOKIE)?.value;
  const v = header || cookie;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : null;
}

export async function POST(req: NextRequest) {
  try {
    const parent = readParent(req);
    if (!parent) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    const isAdmin = ADMIN_ADDRESSES.includes(parent.toLowerCase());
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Not an admin" }, { status: 403 });
    }

    // Set httpOnly admin flag cookie
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_FLAG_COOKIE, "1", {
      httpOnly: true,
      sameSite: SECURE ? "none" : "lax", // "none" for cross-origin in production
      secure: SECURE, // HTTPS required for SameSite=None
      path: "/",
      maxAge: 12 * 60 * 60, // 12h
    });
    return res;
  } catch (e) {
    console.error("admin/elevate error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
