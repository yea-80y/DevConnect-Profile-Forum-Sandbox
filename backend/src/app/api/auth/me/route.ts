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
//   (2) dc_admin cookie contains verified address from admin/elevate
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

/**
 * Get verified admin address from httpOnly cookie
 * The admin elevation endpoint sets this after signature verification
 * Format: "1:{address}" where address is cryptographically verified
 */
function getVerifiedAdminAddress(req: NextRequest): `0x${string}` | null {
  const adminCookie = req.cookies.get(ADMIN_FLAG_COOKIE)?.value;
  if (!adminCookie) return null;

  // Parse format "1:{address}"
  const match = adminCookie.match(/^1:(0x[0-9a-fA-F]{40})$/i);
  if (!match) {
    // Backwards compatibility: old format was just "1"
    if (adminCookie === "1") {
      const header = req.headers.get(SUBJECT_HEADER);
      const cookie = req.cookies.get(SUBJECT_COOKIE)?.value;
      const v = header || cookie;
      return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : null;
    }
    return null;
  }

  return match[1].toLowerCase() as `0x${string}`;
}

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

  // 2) Check if they have a verified admin address from elevation
  const verifiedAdminAddress = getVerifiedAdminAddress(req);

  // 3) Admin requires verified address that matches parent AND is on allowlist
  let isAdmin = false;
  if (verifiedAdminAddress) {
    const addressesMatch = verifiedAdminAddress.toLowerCase() === parent.toLowerCase();
    const onAllowlist = ADMIN_ADDRESSES.includes(verifiedAdminAddress.toLowerCase());
    isAdmin = addressesMatch && onAllowlist;
  }

  return NextResponse.json({
    ok: true,
    address: parent as `0x${string}`,
    isAdmin,
  });
}
