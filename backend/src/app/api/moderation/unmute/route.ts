// src/app/api/moderation/unmute/route.ts
// ------------------------------------------------------------------
// UNMUTE (admin-only)
// - Uses same auth as mute: verified address from dc_admin httpOnly cookie
// - Body: { boardId: string, kind: "thread"|"reply", ref: string } (64-hex; 0x ok)
// ------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { removeMuted } from "@/lib/moderation/store-swarm";

export const runtime = "nodejs";

// Allowlist from env
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Cookie names
const SUBJECT_COOKIE = "woco_subject0x";
const ADMIN_FLAG_COOKIE = "dc_admin";
const SUBJECT_HEADER = "x-subject-address";

type Kind = "thread" | "reply";
type UnmuteBody = { boardId?: string; kind?: Kind; ref?: string };

function isHex64(x: string): boolean {
  const s = x.startsWith("0x") ? x.slice(2) : x;
  return /^[0-9a-fA-F]{64}$/.test(s);
}

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

function isAdmin(req: NextRequest): { isAdmin: boolean; address: `0x${string}` | null } {
  const verifiedAddress = getVerifiedAdminAddress(req);
  if (!verifiedAddress) {
    return { isAdmin: false, address: null };
  }

  const onAllowlist = ADMIN_ADDRESSES.includes(verifiedAddress.toLowerCase());
  return { isAdmin: onAllowlist, address: verifiedAddress };
}

export async function POST(req: NextRequest) {
  try {
    // 1) Parse & validate input
    const body = (await req.json()) as UnmuteBody;
    const boardId = body?.boardId?.trim();
    const ref = body?.ref?.trim();
    const kind = body?.kind;

    if (!boardId || !ref || (kind !== "thread" && kind !== "reply") || !isHex64(ref)) {
      return NextResponse.json(
        { ok: false, error: "Bad input (boardId/kind/ref)" },
        { status: 400 }
      );
    }

    // Normalize ref (strip 0x for storage consistency)
    const cleanRef = ref.startsWith("0x") ? ref.slice(2) : ref;

    // 2) Authorize: verified admin address from httpOnly cookie
    const { isAdmin: adminCheck, address: adminAddress } = isAdmin(req);
    if (!adminCheck) {
      return NextResponse.json(
        { ok: false, error: "Not authorized (admin required)" },
        { status: 403 }
      );
    }
    console.log(`[unmute] Admin action by verified address: ${adminAddress}`);

    // 3) Remove from muted list (idempotent)
    await removeMuted(boardId, kind, cleanRef);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("unmute error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
