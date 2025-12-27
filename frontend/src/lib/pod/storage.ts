/**
 * Swarm Storage Utilities for PODs
 *
 * Handles storing and retrieving PODs from Swarm using feeds.
 * PODs are organized by:
 * - Series metadata (one per series)
 * - Edition index (maps edition number → Swarm ref for unclaimed POD)
 * - User collections (claimed PODs owned by a user)
 */

import { fetchJsonByRef } from "../profile/swarm";
import type {
  CollectibleSeries,
  UnclaimedEdition,
  ClaimedEdition,
} from "./schema";
import type { SignedPOD } from "./create";

/**
 * Topic naming convention for POD feeds:
 * - Series metadata: woco/pod/series/{seriesId}
 * - Edition index: woco/pod/series/{seriesId}/editions
 * - User collection: woco/pod/user/{userPublicKey}/claimed
 */

/**
 * Edition index entry (maps edition number to its Swarm ref)
 */
export interface EditionIndexEntry {
  edition: number;
  ref: string; // Swarm hash of the serialized POD
  claimed: boolean; // Track if this edition has been claimed
  claimedBy?: string; // Public key of claimer (if claimed)
  claimedAt?: string; // ISO timestamp
}

/**
 * Edition index (stored on Swarm)
 */
export interface EditionIndex {
  seriesId: string;
  totalSupply: number;
  editions: EditionIndexEntry[];
  createdAt: string;
}

/**
 * Upload a serialized POD to Swarm via backend API.
 * Returns the Swarm reference (hash).
 *
 * @param apiUrl - Backend API URL
 * @param serializedPOD - Serialized POD string
 * @param postageBatchId - Swarm postage batch ID
 * @returns Swarm reference (hex hash)
 */
export async function uploadPODToSwarm(
  apiUrl: string,
  serializedPOD: string,
  postageBatchId: string
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/pod/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pod: serializedPOD, postageBatchId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload POD: ${response.status}`);
  }

  const data = await response.json();
  return data.reference as string;
}

/**
 * Upload series metadata to Swarm.
 *
 * @param apiUrl - Backend API URL
 * @param series - Series metadata
 * @param feedOwner - Platform signer's public key
 * @returns API response
 */
export async function uploadSeriesMetadata(
  apiUrl: string,
  series: CollectibleSeries,
  feedOwner: string
): Promise<{ ok: boolean; ref?: string }> {
  const response = await fetch(`${apiUrl}/api/pod/series`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "metadata",
      series,
      feedOwner,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload series metadata: ${response.status}`);
  }

  return await response.json();
}

/**
 * Upload edition index to Swarm.
 *
 * @param apiUrl - Backend API URL
 * @param index - Edition index
 * @param feedOwner - Platform signer's public key
 * @returns API response
 */
export async function uploadEditionIndex(
  apiUrl: string,
  index: EditionIndex,
  feedOwner: string
): Promise<{ ok: boolean; ref?: string }> {
  const response = await fetch(`${apiUrl}/api/pod/series`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "index",
      index,
      feedOwner,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload edition index: ${response.status}`);
  }

  return await response.json();
}

/**
 * Fetch series metadata from Swarm.
 *
 * @param beeUrl - Swarm gateway URL
 * @param seriesId - Series identifier
 * @returns Series metadata
 */
export async function fetchSeriesMetadata(
  beeUrl: string,
  seriesId: string
): Promise<CollectibleSeries | null> {
  try {
    // In v1, we'll fetch via feed topic
    // For now, return null (to be implemented with backend)
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch edition index from Swarm.
 *
 * @param beeUrl - Swarm gateway URL
 * @param seriesId - Series identifier
 * @returns Edition index
 */
export async function fetchEditionIndex(
  beeUrl: string,
  seriesId: string
): Promise<EditionIndex | null> {
  try {
    // To be implemented with backend feed reader
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single POD by Swarm reference.
 *
 * @param beeUrl - Swarm gateway URL
 * @param ref - Swarm reference (hash)
 * @returns Serialized POD string
 */
export async function fetchPODByRef(
  beeUrl: string,
  ref: string
): Promise<string | null> {
  try {
    const data = await fetchJsonByRef(beeUrl, ref);
    // PODs are stored as JSON with a "pod" field containing the serialized string
    if (data && typeof data === "object" && "pod" in data) {
      return data.pod as string;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the next available edition for claiming.
 *
 * @param index - Edition index
 * @returns Next unclaimed edition entry, or null if all claimed
 */
export function getNextAvailableEdition(
  index: EditionIndex
): EditionIndexEntry | null {
  for (const entry of index.editions) {
    if (!entry.claimed) {
      return entry;
    }
  }
  return null;
}

/**
 * Mark an edition as claimed in the index.
 *
 * @param index - Edition index (will be mutated)
 * @param edition - Edition number
 * @param claimedBy - Claimer's public key
 * @returns Updated index
 */
export function markEditionClaimed(
  index: EditionIndex,
  edition: number,
  claimedBy: string
): EditionIndex {
  const entry = index.editions.find(e => e.edition === edition);
  if (entry) {
    entry.claimed = true;
    entry.claimedBy = claimedBy;
    entry.claimedAt = new Date().toISOString();
  }
  return index;
}
