// src/app/api/auth/admin/elevate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "ethers";
import crypto from "crypto";

/**
 * SECURE Moderator Elevation:
 * - Requires a signature proving ownership of an admin address
 * - Two-step flow:
 *   1. GET: Returns a random nonce challenge
 *   2. POST: Verify signature of nonce, grant admin if valid
 * - Sets httpOnly cookie "dc_admin" only after signature verification
 *
 * SECURITY: Never trust client-set cookies/headers for identity.
 * Always verify cryptographic signatures.
 */

export const runtime = "nodejs";

const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const SECURE = process.env.NODE_ENV === "production";
const ADMIN_FLAG_COOKIE = "dc_admin";       // httpOnly flag for admin
const NONCE_COOKIE = "dc_admin_nonce";      // httpOnly nonce for challenge

// Nonce validity: 5 minutes
const NONCE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * GET: Generate a random nonce challenge for admin elevation
 */
export async function GET() {
  try {
    // Generate random nonce with timestamp
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString("hex");
    const nonce = `woco-admin-${timestamp}-${randomBytes}`;

    // Return nonce and set it in httpOnly cookie for verification
    const res = NextResponse.json({
      ok: true,
      nonce,
      message: `WoCo Admin Authentication\n\nSign this message to verify you control an admin address.\n\nNonce: ${nonce}\n\nThis signature will expire in 5 minutes.`
    });

    res.cookies.set(NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: SECURE ? "none" : "lax",
      secure: SECURE,
      path: "/",
      maxAge: 300, // 5 minutes
    });

    return res;
  } catch (e) {
    console.error("admin/elevate GET error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * POST: Verify signature and grant admin access
 * Body: { address: "0x...", signature: "0x..." }
 */
export async function POST(req: NextRequest) {
  try {
    // Get the nonce from httpOnly cookie (not client-settable)
    const storedNonce = req.cookies.get(NONCE_COOKIE)?.value;
    if (!storedNonce) {
      return NextResponse.json({
        ok: false,
        error: "No nonce found. Please request a new challenge first."
      }, { status: 400 });
    }

    // Parse nonce timestamp and check expiry
    const nonceMatch = storedNonce.match(/^woco-admin-(\d+)-/);
    if (!nonceMatch) {
      return NextResponse.json({ ok: false, error: "Invalid nonce format" }, { status: 400 });
    }

    const nonceTimestamp = parseInt(nonceMatch[1], 10);
    if (Date.now() - nonceTimestamp > NONCE_EXPIRY_MS) {
      return NextResponse.json({
        ok: false,
        error: "Nonce expired. Please request a new challenge."
      }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    const { address, signature } = body as { address?: string; signature?: string };

    if (!address || !signature) {
      return NextResponse.json({
        ok: false,
        error: "Missing address or signature"
      }, { status: 400 });
    }

    // Validate address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "Invalid address format" }, { status: 400 });
    }

    // Check if address is in admin list BEFORE signature verification
    // This prevents timing attacks on the admin list
    const isAdmin = ADMIN_ADDRESSES.includes(address.toLowerCase());
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Not an admin address" }, { status: 403 });
    }

    // Construct the exact message that was signed
    const message = `WoCo Admin Authentication\n\nSign this message to verify you control an admin address.\n\nNonce: ${storedNonce}\n\nThis signature will expire in 5 minutes.`;

    // CRITICAL: Verify the signature cryptographically
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (e) {
      console.error("Signature verification failed:", e);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
    }

    // Check if recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      console.warn(`Admin elevation attempt: claimed ${address}, recovered ${recoveredAddress}`);
      return NextResponse.json({
        ok: false,
        error: "Signature does not match claimed address"
      }, { status: 403 });
    }

    // SUCCESS: Signature verified, address is in admin list
    console.log(`Admin elevation successful for ${address}`);

    const res = NextResponse.json({ ok: true, address: recoveredAddress });

    // Set httpOnly admin flag cookie with verified address
    // Format: "1:{address}" - the "1" maintains backwards compatibility,
    // while storing the verified address for secure identity checks
    res.cookies.set(ADMIN_FLAG_COOKIE, `1:${address.toLowerCase()}`, {
      httpOnly: true,
      sameSite: SECURE ? "none" : "lax",
      secure: SECURE,
      path: "/",
      maxAge: 12 * 60 * 60, // 12h
    });

    // Clear the nonce cookie (single use)
    res.cookies.delete(NONCE_COOKIE);

    return res;
  } catch (e) {
    console.error("admin/elevate POST error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
