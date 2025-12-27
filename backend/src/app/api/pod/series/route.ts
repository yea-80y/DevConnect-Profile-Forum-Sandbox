// POST /api/pod/series - Create new POD series
// GET /api/pod/series?id={seriesId} - Get series by ID

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createPodSeries, getPodSeries } from "@/lib/pod/service";
import type {
  CreateSeriesRequest,
  CreateSeriesResponse,
  GetSeriesResponse,
} from "@/lib/pod/types";

/**
 * POST - Create a new POD collectible series
 *
 * Body: CreateSeriesRequest
 * {
 *   series: { seriesId, title, description, imageHash, creatorPodPublicKey, totalSupply, ... },
 *   signedPods: [{ edition: 1, podSerialized: "..." }, ...]
 * }
 *
 * Returns: CreateSeriesResponse
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateSeriesRequest;

    // Validate request
    if (!body.series || !body.signedPods) {
      return NextResponse.json(
        { ok: false, error: "Missing series or signedPods" } as CreateSeriesResponse,
        { status: 400 }
      );
    }

    const { series, signedPods } = body;

    // Validate series fields
    if (!series.seriesId || !series.title || !series.imageHash || !series.creatorPodPublicKey) {
      return NextResponse.json(
        { ok: false, error: "Missing required series fields" } as CreateSeriesResponse,
        { status: 400 }
      );
    }

    // Validate total supply
    if (series.totalSupply < 1 || series.totalSupply > 128) {
      return NextResponse.json(
        { ok: false, error: "Total supply must be between 1 and 128" } as CreateSeriesResponse,
        { status: 400 }
      );
    }

    // Validate signed PODs count
    if (signedPods.length !== series.totalSupply) {
      return NextResponse.json(
        {
          ok: false,
          error: `Expected ${series.totalSupply} signed PODs, got ${signedPods.length}`,
        } as CreateSeriesResponse,
        { status: 400 }
      );
    }

    console.log(`[api/pod/series POST] Creating series ${series.seriesId}`);

    // Create series on Swarm
    const created = await createPodSeries({
      seriesId: series.seriesId,
      title: series.title,
      description: series.description,
      imageHash: series.imageHash,
      creatorPodPublicKey: series.creatorPodPublicKey,
      creatorEthAddress: series.creatorEthAddress,
      totalSupply: series.totalSupply,
      signedPods,
    });

    console.log(`[api/pod/series POST] Series ${series.seriesId} created successfully`);

    return NextResponse.json({
      ok: true,
      seriesId: created.seriesId,
      seriesFeedTopic: `woco/pod/series/${created.seriesId}`,
      storageStatus: "swarm",
    } as CreateSeriesResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[api/pod/series POST] Error:", err);

    return NextResponse.json(
      {
        ok: false,
        error,
        storageStatus: "local", // Signal to frontend to fall back to localStorage
      } as CreateSeriesResponse,
      { status: 500 }
    );
  }
}

/**
 * GET - Fetch a POD series by ID
 *
 * Query: ?id={seriesId}
 *
 * Returns: GetSeriesResponse
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seriesId = searchParams.get("id");

    if (!seriesId) {
      return NextResponse.json(
        { ok: false, error: "Missing seriesId parameter" } as GetSeriesResponse,
        { status: 400 }
      );
    }

    console.log(`[api/pod/series GET] Fetching series ${seriesId}`);

    const series = await getPodSeries(seriesId);

    if (!series) {
      return NextResponse.json(
        {
          ok: false,
          error: "Series not found",
          storageStatus: "local", // Signal to check localStorage
        } as GetSeriesResponse,
        { status: 404 }
      );
    }

    // Cache for 5 minutes (series data changes when editions are claimed)
    return NextResponse.json(
      {
        ok: true,
        series,
        storageStatus: "swarm",
      } as GetSeriesResponse,
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          "CDN-Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[api/pod/series GET] Error:", err);

    return NextResponse.json(
      {
        ok: false,
        error,
        storageStatus: "local",
      } as GetSeriesResponse,
      { status: 500 }
    );
  }
}
