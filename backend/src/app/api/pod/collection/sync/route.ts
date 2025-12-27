// POST /api/pod/collection/sync - Sync user's collection from existing claims

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { syncUserCollection } from "@/lib/pod/service";

interface SyncRequest {
  ethAddress: string;
  podPublicKey: string;
}

interface SyncResponse {
  ok: boolean;
  synced?: number;
  total?: number;
  error?: string;
}

/**
 * POST - Sync a user's POD collection from existing claims
 *
 * This scans all series in the directory for claims by this user
 * and adds them to their collection feed.
 *
 * Body: { ethAddress: "0x...", podPublicKey: "abc123..." }
 *
 * Returns: SyncResponse
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SyncRequest;

    if (!body.ethAddress || !body.podPublicKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ethAddress or podPublicKey" } as SyncResponse,
        { status: 400 }
      );
    }

    // Validate address format
    if (!body.ethAddress.startsWith("0x") || body.ethAddress.length !== 42) {
      return NextResponse.json(
        { ok: false, error: "Invalid Ethereum address format" } as SyncResponse,
        { status: 400 }
      );
    }

    console.log(`[api/pod/collection/sync POST] Syncing collection for ${body.ethAddress}`);

    const result = await syncUserCollection(
      body.ethAddress as `0x${string}`,
      body.podPublicKey
    );

    console.log(`[api/pod/collection/sync POST] Synced ${result.synced} claims from ${result.total} series`);

    return NextResponse.json({
      ok: true,
      synced: result.synced,
      total: result.total,
    } as SyncResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[api/pod/collection/sync POST] Error:", err);

    return NextResponse.json(
      {
        ok: false,
        error,
      } as SyncResponse,
      { status: 500 }
    );
  }
}
