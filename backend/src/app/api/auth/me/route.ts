// src/app/api/auth/me/route.ts
// ----------------------------------------------------
// Returns the current user's parent address and admin
// status for the UI:
//
//   { ok: true, address: "0x...", isAdmin: boolean }
//
// RULES
// - "address" comes from the *existing* login cookie
//   written by your client hook (usePostingIdentity):
//     woco_subject0x = 0xParentAddress
// - "isAdmin" is true only when BOTH are true:
//   (1) address is in ADMIN_ADDRESSES (env allowlist), and
//   (2) dc_admin cookie (set by /api/auth/admin/elevate) exists.
//
// This avoids "auto-admin" just by visiting the page.
// ----------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Comma-separated list in .env(.local), e.g.:
// ADMIN_ADDRESSES=0xAbc...,0xDef...
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Cookie names and headers used across the app
const SUBJECT_COOKIE = "woco_subject0x";    // set by client after initial EIP-712 login
const SUBJECT_HEADER = "x-subject-address"; // for cross-origin dev/prod setup
const ADMIN_FLAG_COOKIE = "dc_admin";       // set by /api/auth/admin/elevate (httpOnly)

export async function GET(req: NextRequest) {
  // 1) Who is logged in? (parent/web3 address; null if not logged in)
  // Try header first (cross-origin), then cookie (same-origin)
  const headerSubject = req.headers.get(SUBJECT_HEADER);
  const cookieSubject = req.cookies.get(SUBJECT_COOKIE)?.value;
  const parent = headerSubject || cookieSubject || null;

  // Not logged in => definitely not admin
  if (!parent) {
    return NextResponse.json({ ok: true, address: null, isAdmin: false });
  }

  // 2) Check if their address is allow-listed for admin
  const onAllowlist = ADMIN_ADDRESSES.includes(parent.toLowerCase());

  // 3) Check if they have explicitly elevated to admin this session
  const hasAdminFlag = req.cookies.get(ADMIN_FLAG_COOKIE)?.value === "1";

  // Admin requires BOTH allowlist + elevate flag
  const isAdmin = onAllowlist && hasAdminFlag;

  return NextResponse.json({
    ok: true,
    address: parent as `0x${string}`,
    isAdmin,
  });
}
