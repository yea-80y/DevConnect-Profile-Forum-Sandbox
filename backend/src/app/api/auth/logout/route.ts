// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Admin-only logout:
 * - Clears the httpOnly "dc_admin" cookie (admin flag).
 * - Does NOT touch the normal user login cookie(s).
 * - After this, /api/auth/me should report isAdmin=false for the same user.
 */
const SESSION_COOKIE = "dc_admin";
const SECURE = process.env.NODE_ENV === "production";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: SECURE ? "none" : "lax", // match elevate route
    secure: SECURE,
    path: "/",
    maxAge: 0, // delete
  });
  return res;
}
