// GET /api/pod/collection?address={ethAddress} - Get user's POD collection

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getUserCollection } from "@/lib/pod/service";
import type { GetCollectionResponse } from "@/lib/pod/types";

/**
 * GET - Fetch a user's POD collection by Ethereum address
 *
 * Query: ?address={ethAddress}
 *
 * The collection is stored in a deterministic Swarm feed:
 * woco/pod/collection/{ethAddress.toLowerCase()}
 *
 * Returns: GetCollectionResponse
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { ok: false, error: "Missing address parameter" } as GetCollectionResponse,
        { status: 400 }
      );
    }

    // Validate address format
    if (!address.startsWith("0x") || address.length !== 42) {
      return NextResponse.json(
        { ok: false, error: "Invalid Ethereum address format" } as GetCollectionResponse,
        { status: 400 }
      );
    }

    console.log(`[api/pod/collection GET] Fetching collection for ${address}`);

    const collection = await getUserCollection(address);

    if (!collection) {
      // No collection yet - return empty
      console.log(`[api/pod/collection GET] No collection found for ${address}`);
      return NextResponse.json({
        ok: true,
        collection: {
          v: 1,
          ownerEthAddress: address as `0x${string}`,
          ownerPodPublicKey: "",
          entries: [],
          updatedAt: new Date().toISOString(),
        },
      } as GetCollectionResponse);
    }

    console.log(`[api/pod/collection GET] Found ${collection.entries.length} entries for ${address}`);

    // Short cache - collection changes when user claims
    return NextResponse.json(
      {
        ok: true,
        collection,
      } as GetCollectionResponse,
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
          "CDN-Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[api/pod/collection GET] Error:", err);

    return NextResponse.json(
      {
        ok: false,
        error,
      } as GetCollectionResponse,
      { status: 500 }
    );
  }
}
