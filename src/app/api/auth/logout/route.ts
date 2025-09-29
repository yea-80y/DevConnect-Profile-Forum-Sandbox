import { NextResponse } from "next/server";
export const runtime = "nodejs";

/** POST /api/auth/logout — clears admin cookies */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("dc_admin_session");
  res.cookies.delete("dc_admin_nonce");
  return res;
}
