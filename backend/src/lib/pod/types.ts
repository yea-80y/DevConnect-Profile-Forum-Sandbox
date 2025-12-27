// Backend POD types with versioning for future-proofing

export type Hex64 = string; // 64-char hex (no 0x prefix)
export type Hex0x = `0x${string}`;

/**
 * Storage status for graceful degradation
 */
export type StorageStatus =
  | "swarm" // Successfully stored on Swarm
  | "local" // Only in localStorage (needs upload)
  | "pending"; // Upload in progress

/**
 * POD Series - The collectible campaign
 * Stored in Feed: woco/pod/series/{seriesId}
 */
export interface PodSeriesFeed {
  v: 1; // Version for future migrations
  seriesId: string; // UUID
  title: string;
  description: string;
  imageHash: Hex64; // Swarm reference to image
  creatorPodPublicKey: string; // ed25519 public key (hex)
  creatorEthAddress?: Hex0x; // Optional: original Ethereum address
  totalSupply: number; // Max 128 for v1
  createdAt: string; // ISO timestamp
  editions: EditionEntry[];
}

/**
 * Edition entry in the series feed
 * Tracks claim status for each edition
 */
export interface EditionEntry {
  edition: number; // 1-indexed
  podHash: Hex64; // Swarm /bytes reference to signed POD JSON
  claimed: boolean;
  claimedBy?: string; // Claimer's POD public key (hex)
  claimedPodHash?: Hex64; // Swarm reference to claimed POD (with both signatures)
  claimedAt?: string; // ISO timestamp
}

/**
 * Directory entry for global discovery
 * Lightweight - just enough info for browsing
 */
export interface PodDirectoryEntry {
  seriesId: string;
  title: string;
  imageHash: Hex64;
  creatorPodPublicKey: string;
  totalSupply: number;
  claimedCount: number; // Computed from editions array
  createdAt: string;
}

/**
 * Global POD Directory Feed
 * Stored in Feed: woco/pod/directory
 */
export interface PodDirectoryFeed {
  v: 1;
  entries: PodDirectoryEntry[];
  // Pagination support (for future)
  page?: number; // Default 0
  totalPages?: number; // For pagination later
  updatedAt: string; // ISO timestamp
}

/**
 * Creator's collection index
 * Stored in Feed: woco/pod/creator/{creatorPodKey}
 */
export interface PodCreatorFeed {
  v: 1;
  creatorPodPublicKey: string;
  seriesIds: string[]; // List of UUIDs
  updatedAt: string;
}

/**
 * Signed POD stored in /bytes
 * This is the actual cryptographic proof
 */
export interface StoredPod {
  entries: Record<string, { type: string; value: string }>; // bigints as strings
  signature: string;
  signerPublicKey: string;
}

/**
 * Local storage metadata (for fallback & migration)
 * Tells user which PODs need to be uploaded to Swarm
 */
export interface LocalPodMetadata {
  seriesId: string;
  storageStatus: StorageStatus;
  lastUploadAttempt?: string; // ISO timestamp
  uploadError?: string; // Last error message
  retryCount?: number; // Number of failed attempts
}

/**
 * Request/Response types for API
 */

export interface CreateSeriesRequest {
  series: {
    seriesId: string;
    title: string;
    description: string;
    imageHash: Hex64;
    creatorPodPublicKey: string;
    creatorEthAddress?: Hex0x;
    totalSupply: number;
    createdAt: string;
  };
  signedPods: Array<{
    edition: number;
    podSerialized: string; // JSON string of StoredPod
  }>;
}

export interface CreateSeriesResponse {
  ok: boolean;
  seriesId?: string;
  seriesFeedTopic?: string;
  storageStatus?: StorageStatus; // "swarm" or "local"
  error?: string;
}

export interface ClaimEditionRequest {
  seriesId: string;
  edition: number; // Which edition to claim
  claimerPodPublicKey: string;
  claimerEthAddress?: `0x${string}`; // Optional: for user collection feed
  claimedPodSerialized: string; // JSON string of claimed POD (with both sigs)
}

export interface ClaimEditionResponse {
  ok: boolean;
  edition?: number;
  claimedPodHash?: Hex64;
  storageStatus?: StorageStatus;
  error?: string;
}

export interface GetSeriesResponse {
  ok: boolean;
  series?: PodSeriesFeed;
  storageStatus?: StorageStatus; // Where it was loaded from
  error?: string;
}

export interface GetDirectoryResponse {
  ok: boolean;
  entries?: PodDirectoryEntry[];
  updatedAt?: string;
  error?: string;
}

/**
 * Retry upload for PODs stuck in localStorage
 */
export interface RetryUploadRequest {
  seriesId: string;
}

export interface RetryUploadResponse {
  ok: boolean;
  storageStatus?: StorageStatus;
  error?: string;
}

/**
 * User's POD Collection - Their "passport" of claimed PODs
 * Stored in Feed: woco/pod/collection/{ethAddress}
 * Uses lowercase checksummed Ethereum address for deterministic topic
 */
export interface PodCollectionFeed {
  v: 1;
  ownerEthAddress: Hex0x; // Owner's Ethereum address
  ownerPodPublicKey: string; // Owner's POD public key
  entries: PodCollectionEntry[];
  updatedAt: string;
}

/**
 * Entry in user's POD collection
 * Stores reference to their claimed POD
 */
export interface PodCollectionEntry {
  seriesId: string;
  seriesTitle: string;
  edition: number;
  imageHash: Hex64;
  claimedPodHash: Hex64; // Swarm reference to claimed POD
  claimedAt: string; // ISO timestamp
}

export interface GetCollectionResponse {
  ok: boolean;
  collection?: PodCollectionFeed;
  error?: string;
}

/**
 * Claimers feed - tracks who claimed each edition
 * Stored in Feed: woco/pod/claimers/{seriesId}
 * Each slot stores 32 bytes of the claimer's POD public key (first 32 bytes)
 */
export interface ClaimerInfo {
  edition: number;
  claimerPodPublicKey: string; // Full 64-char hex
  claimedAt: string;
}
