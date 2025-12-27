// Frontend POD API client - Swarm storage only
import { apiUrl } from "@/config/api";
import type {
  CreateSeriesRequest,
  CreateSeriesResponse,
  ClaimEditionRequest,
  ClaimEditionResponse,
  GetSeriesResponse,
  GetDirectoryResponse,
  GetCollectionResponse,
  LocalPodMetadata,
} from "./types";

// Re-export types for convenience
export type { LocalPodMetadata };

/**
 * Create a new POD series on Swarm
 */
export async function createPodSeries(
  request: CreateSeriesRequest
): Promise<CreateSeriesResponse & { needsUpload?: boolean }> {
  const { series } = request;

  try {
    // Upload to Swarm via backend API
    console.log("[pod-api] Uploading to Swarm...");
    const response = await fetch(apiUrl("/api/pod/series"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const result = (await response.json()) as CreateSeriesResponse;

    if (result.ok && result.storageStatus === "swarm") {
      // Success! POD is on Swarm
      console.log("[pod-api] Swarm upload successful");
      return result;
    }

    // API returned error
    console.error("[pod-api] Swarm upload failed:", result.error);
    return {
      ok: false,
      error: result.error || "Upload failed",
      seriesId: series.seriesId,
    };
  } catch (err) {
    console.error("[pod-api] Swarm upload error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      seriesId: series.seriesId,
    };
  }
}

/**
 * Get a POD series by ID from Swarm
 * @param seriesId - The series ID to fetch
 * @param noCache - If true, bypasses cache to get fresh data (useful after claiming)
 */
export async function getPodSeries(
  seriesId: string,
  noCache = false
): Promise<GetSeriesResponse> {
  try {
    // Add cache-busting timestamp if noCache is true
    const url = noCache
      ? apiUrl(`/api/pod/series?id=${seriesId}&_t=${Date.now()}`)
      : apiUrl(`/api/pod/series?id=${seriesId}`);

    const response = await fetch(url, {
      // Disable browser cache if noCache is requested
      cache: noCache ? "no-store" : "default",
    });
    const result = (await response.json()) as GetSeriesResponse;

    if (result.ok && result.series) {
      return result;
    }

    return {
      ok: false,
      error: result.error || "Series not found",
    };
  } catch (err) {
    console.error("[pod-api] Failed to fetch series:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch series",
    };
  }
}

/**
 * Claim an edition on Swarm
 */
export async function claimPodEdition(
  request: ClaimEditionRequest
): Promise<ClaimEditionResponse> {
  try {
    const response = await fetch(apiUrl("/api/pod/claim"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const result = (await response.json()) as ClaimEditionResponse;

    if (result.ok) {
      return result;
    }

    return {
      ok: false,
      error: result.error || "Claim failed",
    };
  } catch (err) {
    console.error("[pod-api] Claim failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Claim failed",
    };
  }
}

/**
 * Get the global POD directory
 */
export async function getPodDirectory(): Promise<GetDirectoryResponse> {
  try {
    const response = await fetch(apiUrl("/api/pod/directory"));
    return await response.json();
  } catch (err) {
    console.error("[pod-api] Failed to fetch directory:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get a user's POD collection by Ethereum address
 * @param ethAddress - The user's Ethereum address
 * @param noCache - If true, bypasses cache
 */
export async function getUserCollection(
  ethAddress: string,
  noCache = false
): Promise<GetCollectionResponse> {
  try {
    const url = noCache
      ? apiUrl(`/api/pod/collection?address=${ethAddress}&_t=${Date.now()}`)
      : apiUrl(`/api/pod/collection?address=${ethAddress}`);

    const response = await fetch(url, {
      cache: noCache ? "no-store" : "default",
    });
    return await response.json();
  } catch (err) {
    console.error("[pod-api] Failed to fetch collection:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Sync user's collection from existing claims
 * Scans all series for claims by this user and adds them to their collection
 */
export async function syncUserCollection(
  ethAddress: string,
  podPublicKey: string
): Promise<{ ok: boolean; synced?: number; total?: number; error?: string }> {
  try {
    const response = await fetch(apiUrl("/api/pod/collection/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ethAddress, podPublicKey }),
    });
    return await response.json();
  } catch (err) {
    console.error("[pod-api] Failed to sync collection:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Stub: Retry upload for a POD series (no-op since we're Swarm-only)
 * @deprecated PODs are now stored directly on Swarm
 */
export async function retryUpload(
  seriesId: string
): Promise<{ ok: boolean; storageStatus?: string; error?: string }> {
  console.warn("[pod-api] retryUpload is deprecated - PODs are stored on Swarm");
  return {
    ok: false,
    error: "Local storage fallback is no longer supported",
  };
}

/**
 * Stub: Clear local POD data (no-op since we're Swarm-only)
 * @deprecated PODs are now stored directly on Swarm
 */
export function clearLocalPod(seriesId: string): void {
  console.warn("[pod-api] clearLocalPod is deprecated - PODs are stored on Swarm");
  // Clear any leftover localStorage entries
  try {
    localStorage.removeItem(`pod:series:${seriesId}`);
    localStorage.removeItem(`pod:editions:${seriesId}`);
    localStorage.removeItem(`pod:metadata:${seriesId}`);
  } catch {
    // Ignore errors
  }
}
