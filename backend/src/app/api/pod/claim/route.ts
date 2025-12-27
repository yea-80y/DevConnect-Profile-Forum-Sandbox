// POST /api/pod/claim - Claim an edition from a series

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { claimEdition } from "@/lib/pod/service";
import type { ClaimEditionRequest, ClaimEditionResponse } from "@/lib/pod/types";

/**
 * POST - Claim an edition from a POD series
 *
 * Body: ClaimEditionRequest
 * {
 *   seriesId: "uuid",
 *   edition: 42,
 *   claimerPodPublicKey: "abc123...",
 *   claimerEthAddress?: "0x..." (optional, for user collection)
 *   claimedPodSerialized: "{...}"
 * }
 *
 * Returns: ClaimEditionResponse
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ClaimEditionRequest;

    // Validate request
    if (!body.seriesId || !body.edition || !body.claimerPodPublicKey || !body.claimedPodSerialized) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields (seriesId, edition, claimerPodPublicKey, claimedPodSerialized)",
        } as ClaimEditionResponse,
        { status: 400 }
      );
    }

    const { seriesId, edition, claimerPodPublicKey, claimerEthAddress, claimedPodSerialized } = body;

    // Validate edition number
    if (edition < 1 || edition > 128) {
      return NextResponse.json(
        { ok: false, error: "Edition must be between 1 and 128" } as ClaimEditionResponse,
        { status: 400 }
      );
    }

    console.log(`[api/pod/claim POST] Claiming edition ${edition} of series ${seriesId}`);
    if (claimerEthAddress) {
      console.log(`[api/pod/claim POST] Claimer ETH address: ${claimerEthAddress}`);
    }

    // Claim the edition
    const result = await claimEdition({
      seriesId,
      edition,
      claimerPodPublicKey,
      claimerEthAddress,
      claimedPodSerialized,
    });

    console.log(`[api/pod/claim POST] Edition ${edition} claimed successfully`);

    return NextResponse.json({
      ok: true,
      edition: result.edition,
      claimedPodHash: result.claimedPodHash,
      storageStatus: "swarm",
    } as ClaimEditionResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[api/pod/claim POST] Error:", err);

    // Check if it's a user error (already claimed, not found, etc.)
    const isUserError =
      error.includes("not found") ||
      error.includes("already claimed") ||
      error.includes("Edition");

    const statusCode = isUserError ? 400 : 500;
    const storageStatus = isUserError ? undefined : "local";

    return NextResponse.json(
      {
        ok: false,
        error,
        storageStatus,
      } as ClaimEditionResponse,
      { status: statusCode }
    );
  }
}
