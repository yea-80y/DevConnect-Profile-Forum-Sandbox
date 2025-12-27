/**
 * POD Schema for Generic Collectibles
 *
 * A simple, flexible schema that works for:
 * - Memorials (e.g., "RIP Loki 2010-2024")
 * - Art collectibles
 * - Event badges
 * - Limited edition items
 *
 * Each collectible series has multiple editions that users can claim.
 */

import type { PODEntries, PODValue } from "@pcd/pod";

/**
 * POD type identifiers
 */
export const POD_TYPES = {
  /** Unclaimed edition, signed by creator, available for claiming */
  UNCLAIMED: "woco.collectible.v1",
  /** Claimed edition, signed by owner, proves ownership */
  CLAIMED: "woco.collectible.claimed.v1",
} as const;

/**
 * Metadata for a collectible series (e.g., "RIP Loki Memorial Collection")
 */
export interface CollectibleSeries {
  /** Unique identifier (UUID or hash) */
  seriesId: string;
  /** Display title (e.g., "RIP Loki 2010-2024") */
  title: string;
  /** Description/story */
  description: string;
  /** Total number of editions to mint */
  totalSupply: number;
  /** Creator's ed25519 public key (hex) */
  creatorPublicKey: string;
  /** Swarm hash of the collectible image */
  imageHash: string;
  /** ISO timestamp when series was created */
  createdAt: string;
}

/**
 * Single unclaimed edition (signed by creator, stored on Swarm)
 */
export interface UnclaimedEdition {
  podType: typeof POD_TYPES.UNCLAIMED;
  seriesId: string;
  title: string;
  description: string;
  edition: number; // Which edition (1-100)
  totalSupply: number; // Total editions in series
  imageHash: string;
  creator: string; // Creator's ed25519 public key (hex)
  mintedAt: string; // ISO timestamp
}

/**
 * Claimed edition (signed by claimer, proves ownership)
 */
export interface ClaimedEdition {
  podType: typeof POD_TYPES.CLAIMED;
  seriesId: string;
  title: string;
  description: string;
  edition: number;
  totalSupply: number;
  imageHash: string;
  creator: string; // Original creator's public key
  owner: string; // Claimer's ed25519 public key (hex)
  mintedAt: string; // When creator minted it
  claimedAt: string; // When user claimed it
  originalPodHash: string; // Hash of unclaimed POD (for verification)
}

/**
 * Convert UnclaimedEdition to PODEntries for signing
 */
export function unclaimedToPODEntries(edition: UnclaimedEdition): PODEntries {
  return {
    pod_type: { type: "string", value: edition.podType },
    series_id: { type: "string", value: edition.seriesId },
    title: { type: "string", value: edition.title },
    description: { type: "string", value: edition.description },
    edition: { type: "int", value: BigInt(edition.edition) },
    total_supply: { type: "int", value: BigInt(edition.totalSupply) },
    image_hash: { type: "string", value: edition.imageHash },
    creator: { type: "string", value: edition.creator },
    minted_at: { type: "string", value: edition.mintedAt },
  };
}

/**
 * Convert ClaimedEdition to PODEntries for signing
 */
export function claimedToPODEntries(edition: ClaimedEdition): PODEntries {
  return {
    pod_type: { type: "string", value: edition.podType },
    series_id: { type: "string", value: edition.seriesId },
    title: { type: "string", value: edition.title },
    description: { type: "string", value: edition.description },
    edition: { type: "int", value: BigInt(edition.edition) },
    total_supply: { type: "int", value: BigInt(edition.totalSupply) },
    image_hash: { type: "string", value: edition.imageHash },
    creator: { type: "string", value: edition.creator },
    owner: { type: "string", value: edition.owner },
    minted_at: { type: "string", value: edition.mintedAt },
    claimed_at: { type: "string", value: edition.claimedAt },
    original_pod_hash: { type: "string", value: edition.originalPodHash },
  };
}

/**
 * Parse PODEntries back to UnclaimedEdition
 */
export function podEntriesToUnclaimed(entries: PODEntries): UnclaimedEdition {
  return {
    podType: POD_TYPES.UNCLAIMED,
    seriesId: (entries.series_id as PODValue & { type: "string" }).value,
    title: (entries.title as PODValue & { type: "string" }).value,
    description: (entries.description as PODValue & { type: "string" }).value,
    edition: Number((entries.edition as PODValue & { type: "int" }).value),
    totalSupply: Number((entries.total_supply as PODValue & { type: "int" }).value),
    imageHash: (entries.image_hash as PODValue & { type: "string" }).value,
    creator: (entries.creator as PODValue & { type: "string" }).value,
    mintedAt: (entries.minted_at as PODValue & { type: "string" }).value,
  };
}

/**
 * Parse PODEntries back to ClaimedEdition
 */
export function podEntriesToClaimed(entries: PODEntries): ClaimedEdition {
  return {
    podType: POD_TYPES.CLAIMED,
    seriesId: (entries.series_id as PODValue & { type: "string" }).value,
    title: (entries.title as PODValue & { type: "string" }).value,
    description: (entries.description as PODValue & { type: "string" }).value,
    edition: Number((entries.edition as PODValue & { type: "int" }).value),
    totalSupply: Number((entries.total_supply as PODValue & { type: "int" }).value),
    imageHash: (entries.image_hash as PODValue & { type: "string" }).value,
    creator: (entries.creator as PODValue & { type: "string" }).value,
    owner: (entries.owner as PODValue & { type: "string" }).value,
    mintedAt: (entries.minted_at as PODValue & { type: "string" }).value,
    claimedAt: (entries.claimed_at as PODValue & { type: "string" }).value,
    originalPodHash: (entries.original_pod_hash as PODValue & { type: "string" }).value,
  };
}
