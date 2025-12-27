// Frontend POD types (mirrors backend types)

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
 */
export interface PodSeriesFeed {
  v: 1;
  seriesId: string;
  title: string;
  description: string;
  imageHash: Hex64;
  creatorPodPublicKey: string;
  creatorEthAddress?: Hex0x;
  totalSupply: number;
  createdAt: string;
  editions: EditionEntry[];
}

/**
 * Edition entry in the series feed
 */
export interface EditionEntry {
  edition: number;
  podHash: Hex64;
  claimed: boolean;
  claimedBy?: string;
  claimedPodHash?: Hex64;
  claimedAt?: string;
}

/**
 * Local storage metadata (for fallback & migration)
 */
export interface LocalPodMetadata {
  seriesId: string;
  storageStatus: StorageStatus;
  lastUploadAttempt?: string;
  uploadError?: string;
  retryCount?: number;
}

/**
 * API Request/Response types
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
    podSerialized: string;
  }>;
}

export interface CreateSeriesResponse {
  ok: boolean;
  seriesId?: string;
  seriesFeedTopic?: string;
  storageStatus?: StorageStatus;
  error?: string;
}

export interface ClaimEditionRequest {
  seriesId: string;
  edition: number;
  claimerPodPublicKey: string;
  claimerEthAddress?: `0x${string}`; // Optional: for user collection feed
  claimedPodSerialized: string;
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
  storageStatus?: StorageStatus;
  error?: string;
}

/**
 * Directory entry for a POD series
 */
export interface PodDirectoryEntry {
  seriesId: string;
  title: string;
  imageHash: Hex64;
  creatorPodPublicKey: string;
  totalSupply: number;
  claimedCount: number;
  createdAt: string;
}

export interface GetDirectoryResponse {
  ok: boolean;
  entries?: PodDirectoryEntry[];
  updatedAt?: string;
  error?: string;
}

/**
 * User's POD Collection - Their "passport" of claimed PODs
 * Stored in Feed: woco/pod/collection/{ethAddress.toLowerCase()}
 */
export interface PodCollectionFeed {
  v: 1;
  ownerEthAddress: Hex0x;
  ownerPodPublicKey: string;
  entries: PodCollectionEntry[];
  updatedAt: string;
}

/**
 * Entry in user's POD collection
 */
export interface PodCollectionEntry {
  seriesId: string;
  seriesTitle: string;
  edition: number;
  imageHash: Hex64;
  claimedPodHash: Hex64;
  claimedAt: string;
}

export interface GetCollectionResponse {
  ok: boolean;
  collection?: PodCollectionFeed;
  error?: string;
}
