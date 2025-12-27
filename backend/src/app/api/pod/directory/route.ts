// GET /api/pod/directory - Get global POD directory for discovery

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getPodDirectory } from "@/lib/pod/service";
import type { GetDirectoryResponse } from "@/lib/pod/types";

/**
 * GET - Fetch the global POD directory
 *
 * Returns all available POD collectibles for browsing/discovery
 *
 * Returns: GetDirectoryResponse
 */
export async function GET(req: NextRequest) {
  try {
    console.log("[api/pod/directory GET] Fetching global directory");

    const directory = await getPodDirectory();

    console.log(`[api/pod/directory GET] Found ${directory.entries.length} POD series`);
    if (directory.entries.length > 0) {
      console.log(`[api/pod/directory GET] First entry: ${directory.entries[0].seriesId} - ${directory.entries[0].title}`);
    }

    // Cache for 2 minutes (directory updates when new series are created)
    // Flatten structure for frontend: entries at top level
    return NextResponse.json(
      {
        ok: true,
        entries: directory.entries,
        updatedAt: directory.updatedAt,
      } as GetDirectoryResponse,
      {
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
          "CDN-Cache-Control": "public, max-age=120",
        },
      }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[api/pod/directory GET] Error:", err);

    return NextResponse.json(
      {
        ok: false,
        error,
      } as GetDirectoryResponse,
      { status: 500 }
    );
  }
}
