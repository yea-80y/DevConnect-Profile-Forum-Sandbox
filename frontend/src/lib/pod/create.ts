/**
 * POD Creation and Signing Functions
 *
 * Creates and signs PODs using the @pcd/pod library with
 * ed25519 keys derived from Ethereum wallets.
 */

import { POD } from "@pcd/pod";
import {
  unclaimedToPODEntries,
  claimedToPODEntries,
  POD_TYPES,
} from "./schema";
import type {
  CollectibleSeries,
  UnclaimedEdition,
  ClaimedEdition,
} from "./schema";

/**
 * POD Keypair (output from derivePODKeypair)
 */
export interface PODKeypair {
  privateKey: {
    bytes: Uint8Array;
    base64: string;
    hex: string;
  };
  publicKey: {
    bytes: Uint8Array;
    base64: string;
    hex: string;
  };
}

/**
 * Signed POD with metadata
 */
export interface SignedPOD {
  /** The signed POD object */
  pod: POD;
  /** Serialized POD for storage/transmission */
  serialized: string;
  /** Content hash (POD ID) - stored as string for JSON compatibility */
  contentHash: string;
}

/**
 * Create a full series of unclaimed editions.
 * Mints all editions at once (e.g., 100 copies of "RIP Loki").
 *
 * @param series - Series metadata
 * @param creatorPODKeys - Creator's already-derived POD keypair
 * @returns Array of signed unclaimed PODs
 */
export async function createCollectibleSeries(
  series: CollectibleSeries,
  creatorPODKeys: PODKeypair
): Promise<SignedPOD[]> {
  const podKeys = creatorPODKeys;

  // Create all editions
  const signedEditions: SignedPOD[] = [];

  for (let i = 1; i <= series.totalSupply; i++) {
    const edition: UnclaimedEdition = {
      podType: POD_TYPES.UNCLAIMED,
      seriesId: series.seriesId,
      title: series.title,
      description: series.description,
      edition: i,
      totalSupply: series.totalSupply,
      imageHash: series.imageHash,
      creator: podKeys.publicKey.hex,
      mintedAt: series.createdAt,
    };

    // Convert to POD entries
    const entries = unclaimedToPODEntries(edition);

    // Sign with creator's ed25519 private key
    const pod = POD.sign(entries, podKeys.privateKey.base64);

    // Serialize for storage - convert bigints to strings for JSON compatibility
    const podEntries = pod.content.asEntries();
    const serializableEntries: Record<string, any> = {};

    for (const [key, value] of Object.entries(podEntries)) {
      if (value.type === "int") {
        serializableEntries[key] = { type: value.type, value: value.value.toString() };
      } else {
        serializableEntries[key] = value;
      }
    }

    const serialized = JSON.stringify({
      entries: serializableEntries,
      signature: pod.signature,
      signerPublicKey: pod.signerPublicKey
    });

    // Get content hash (POD ID) - convert bigint to string for JSON serialization
    const contentHash = pod.contentID.toString();

    signedEditions.push({ pod, serialized, contentHash });
  }

  return signedEditions;
}

/**
 * Claim an unclaimed edition.
 * User signs the POD with their own key, creating a claimed version.
 *
 * @param unclaimedPOD - The original unclaimed POD
 * @param claimerPODKeys - Claimer's already-derived POD keypair
 * @returns Signed claimed POD
 */
export async function claimEdition(
  unclaimedPOD: POD,
  claimerPODKeys: PODKeypair
): Promise<SignedPOD> {
  const claimerKeys = claimerPODKeys;

  // Extract data from unclaimed POD
  const unclaimedEntries = unclaimedPOD.content.asEntries();
  const seriesId = (unclaimedEntries.series_id as any).value;
  const title = (unclaimedEntries.title as any).value;
  const description = (unclaimedEntries.description as any).value;
  const edition = Number((unclaimedEntries.edition as any).value);
  const totalSupply = Number((unclaimedEntries.total_supply as any).value);
  const imageHash = (unclaimedEntries.image_hash as any).value;
  const creator = (unclaimedEntries.creator as any).value;
  const mintedAt = (unclaimedEntries.minted_at as any).value;

  // Create claimed edition
  const claimedEdition: ClaimedEdition = {
    podType: POD_TYPES.CLAIMED,
    seriesId,
    title,
    description,
    edition,
    totalSupply,
    imageHash,
    creator,
    owner: claimerKeys.publicKey.hex,
    mintedAt,
    claimedAt: new Date().toISOString(),
    originalPodHash: unclaimedPOD.contentID.toString(),
  };

  // Convert to POD entries
  const claimedEntries = claimedToPODEntries(claimedEdition);

  // Sign with claimer's ed25519 private key
  const claimedPOD = POD.sign(claimedEntries, claimerKeys.privateKey.base64);

  // Serialize for storage - convert bigints to strings for JSON compatibility
  const podEntries = claimedPOD.content.asEntries();
  const serializableEntries: Record<string, any> = {};

  for (const [key, value] of Object.entries(podEntries)) {
    if (value.type === "int") {
      serializableEntries[key] = { type: value.type, value: value.value.toString() };
    } else {
      serializableEntries[key] = value;
    }
  }

  return {
    pod: claimedPOD,
    serialized: JSON.stringify({
      entries: serializableEntries,
      signature: claimedPOD.signature,
      signerPublicKey: claimedPOD.signerPublicKey
    }),
    contentHash: claimedPOD.contentID.toString(),
  };
}

/**
 * Verify a POD signature.
 *
 * @param pod - The POD to verify
 * @returns true if signature is valid
 */
export function verifyPOD(pod: POD): boolean {
  try {
    // POD.load will throw if signature is invalid
    const entries = pod.content.asEntries();
    const signature = pod.signature;
    const signerKey = pod.signerPublicKey;

    // Attempt to load (verifies signature internally)
    POD.load(entries, signature, signerKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deserialize a POD from stored string.
 *
 * @param serialized - Serialized POD string
 * @returns Deserialized POD object
 */
export function deserializePOD(serialized: string): POD {
  const parsed = JSON.parse(serialized);

  // Convert string bigints back to BigInt for int types
  const entries: Record<string, any> = {};
  for (const [key, value] of Object.entries(parsed.entries)) {
    const val = value as any;
    if (val.type === "int") {
      entries[key] = { type: val.type, value: BigInt(val.value) };
    } else {
      entries[key] = val;
    }
  }

  return POD.load(entries, parsed.signature, parsed.signerPublicKey);
}

/**
 * Generate a unique series ID (UUID v4).
 */
export function generateSeriesId(): string {
  return crypto.randomUUID();
}
