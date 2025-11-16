// src/app/api/moderation/mute/route.ts
// ------------------------------------------------------------------
// MUTE (admin-only)
// - Authorize with: allowlist AND dc_admin cookie (set by /api/auth/admin/elevate)
// - Parent/web3 address comes from "woco_subject0x" (set by your login hook)
// - Body: { boardId: string, kind: "thread"|"reply", ref: string } (64-hex; 0x ok)
// ------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { addMuted } from "@/lib/moderation/store-swarm";

export const runtime = "nodejs";

// Allowlist from env
const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Cookie names used project-wide
const SUBJECT_COOKIE = "woco_subject0x"; // client-set after initial EIP-712
const ADMIN_FLAG_COOKIE = "dc_admin";    // httpOnly; set by elevate
const SUBJECT_HEADER = "x-subject-address"; // for cross-origin dev setup

type Kind = "thread" | "reply";
type MuteBody = { boardId?: string; kind?: Kind; ref?: string; refHex?: string };

// Simple hex check (accepts with or without 0x)
function isHex64(x: string): boolean {
  const s = x.startsWith("0x") ? x.slice(2) : x;
  return /^[0-9a-fA-F]{64}$/.test(s);
}

function readParent(req: NextRequest): `0x${string}` | null {
  // Try header first (cross-origin), then cookie (same-origin)
  const header = req.headers.get(SUBJECT_HEADER);
  const cookie = req.cookies.get(SUBJECT_COOKIE)?.value;
  const v = header || cookie;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : null;
}

function isAdmin(req: NextRequest, parent: `0x${string}` | null): boolean {
  if (!parent) return false;
  const onAllowlist = ADMIN_ADDRESSES.includes(parent.toLowerCase());
  const hasFlag = req.cookies.get(ADMIN_FLAG_COOKIE)?.value === "1";
  // Require both allowlist + explicit elevate (dc_admin cookie)
  return onAllowlist && hasFlag;
}

export async function POST(req: NextRequest) {
  try {
    // 1) Parse & validate input
    const body = (await req.json()) as MuteBody;
    const boardId = body?.boardId?.trim();
    const ref = (body?.ref ?? body?.refHex)?.trim();
    const kind = body?.kind;

    if (!boardId || !ref || (kind !== "thread" && kind !== "reply") || !isHex64(ref)) {
      return NextResponse.json(
        { ok: false, error: "Bad input (boardId/kind/ref)" },
        { status: 400 }
      );
    }

    // Normalize ref (strip 0x for storage consistency)
    const cleanRef = ref.startsWith("0x") ? ref.slice(2) : ref;

    // 2) Authorize: allowlist + dc_admin flag
    const parent = readParent(req);
    if (!isAdmin(req, parent)) {
      return NextResponse.json(
        { ok: false, error: "Not authorized (admin required)" },
        { status: 403 }
      );
    }

    // 3) Persist mute (idempotency handled inside your store)
    await addMuted(boardId, kind, cleanRef);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("mute error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
