// Backend POD service - handles Swarm Feed operations with error recovery
// Uses forum-style 4096-byte packed binary feeds for reliability
import { Bee, PrivateKey, Topic } from "@ethersphere/bee-js";
import {
  BEE_URL,
  POSTAGE_BATCH_ID,
  FEED_PRIVATE_KEY,
  normalizePk,
} from "@/config/swarm";
import { topicPodDirectory, topicPodCreator } from "../swarm-core/topics";
import type {
  PodSeriesFeed,
  PodDirectoryFeed,
  PodDirectoryEntry,
  PodCreatorFeed,
  PodCollectionFeed,
  PodCollectionEntry,
  EditionEntry,
  Hex64,
  Hex0x,
} from "./types";

// Initialize Bee client and platform signer
const bee = new Bee(BEE_URL);
const platformSigner = new PrivateKey(normalizePk(FEED_PRIVATE_KEY));
const platformOwner = platformSigner.publicKey().address();

// POD namespace
const POD_NS = "woco/pod" as const;

// Topic helpers for editions and claims feeds
const topicPodEditions = (seriesId: string) =>
  Topic.fromString(`${POD_NS}/editions/${seriesId}`);

const topicPodClaims = (seriesId: string) =>
  Topic.fromString(`${POD_NS}/claims/${seriesId}`);

// Claimers feed - stores who claimed each edition (JSON)
const topicPodClaimers = (seriesId: string) =>
  Topic.fromString(`${POD_NS}/claimers/${seriesId}`);

// User's POD collection - their "passport" of claimed PODs
// Uses lowercase Ethereum address for deterministic topic
const topicPodCollection = (ethAddress: string) =>
  Topic.fromString(`${POD_NS}/collection/${ethAddress.toLowerCase()}`);

/* -------------------------------------------------------------------------- */
/*  Binary packing utilities (same as forum posts)                            */
/* -------------------------------------------------------------------------- */

/**
 * Safely extract payload bytes from bee-js response
 * (copied from forum publisher - handles different bee-js response formats)
 */
function toBytes(res: unknown): Uint8Array | null {
  if (!res) return null;
  if (res instanceof Uint8Array) return res;

  if (typeof res === "object" && res !== null) {
    const rec = res as Record<string, unknown>;

    const payload = rec["payload"];
    if (payload instanceof Uint8Array) return payload;

    if (typeof payload === "object" && payload !== null) {
      const p = payload as { toBytes?: () => Uint8Array; bytes?: Uint8Array };
      if (typeof p.toBytes === "function") return p.toBytes();
      if (p.bytes instanceof Uint8Array) return p.bytes;
    }

    const data = rec["data"];
    if (data instanceof Uint8Array) return data as Uint8Array;

    const bytes = rec["bytes"];
    if (bytes instanceof Uint8Array) return bytes as Uint8Array;
  }
  return null;
}

function hexToBytes32(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytes32ToHex(bytes: Uint8Array, offset: number): string {
  let h = "";
  for (let j = 0; j < 32; j++) h += bytes[offset + j].toString(16).padStart(2, "0");
  return h;
}

/**
 * Pack array of 64-hex hashes into 4096-byte page (128 slots × 32 bytes)
 * Slot 0 = first ref, Slot 127 = last ref
 */
function pack4096(refs: string[]): Uint8Array {
  const page = new Uint8Array(4096);
  const count = Math.min(refs.length, 128);
  for (let i = 0; i < count; i++) {
    page.set(hexToBytes32(refs[i]), i * 32);
  }
  return page;
}

/**
 * Decode 4096-byte page to array of 64-hex hashes
 * Stops at first zero slot
 */
function decode4096(page: Uint8Array): string[] {
  const refs: string[] = [];
  for (let i = 0; i < 128; i++) {
    const off = i * 32;
    let zero = true;
    for (let j = 0; j < 32; j++) if (page[off + j] !== 0) { zero = false; break; }
    if (zero) break;
    refs.push(bytes32ToHex(page, off));
  }
  return refs;
}

/**
 * Decode 4096-byte claims page - returns array of 128 slots (empty string if unclaimed)
 */
function decode4096Claims(page: Uint8Array): string[] {
  const refs: string[] = [];
  for (let i = 0; i < 128; i++) {
    const off = i * 32;
    let zero = true;
    for (let j = 0; j < 32; j++) if (page[off + j] !== 0) { zero = false; break; }
    refs.push(zero ? "" : bytes32ToHex(page, off));
  }
  return refs;
}

/* -------------------------------------------------------------------------- */
/*  Feed read/write using binary pages                                        */
/* -------------------------------------------------------------------------- */

/**
 * Read binary feed page (4096 bytes)
 */
async function readFeedPage(topic: Topic): Promise<Uint8Array | null> {
  try {
    const reader = bee.makeFeedReader(topic, platformOwner);
    const result = await reader.downloadPayload();
    if (!result) return null;

    // Get bytes from payload using helper (handles different bee-js formats)
    const bytes = toBytes(result);
    return bytes;
  } catch (err) {
    console.error("[pod-service] Feed read error:", err);
    return null;
  }
}

/**
 * Read feed page with retry logic for propagation delays
 * Retries up to maxRetries times with exponential backoff
 */
async function readFeedPageWithRetry(
  topic: Topic,
  maxRetries = 5,
  initialDelayMs = 1000
): Promise<Uint8Array | null> {
  let delay = initialDelayMs;
  const topicHex = topic.toString();

  console.log(`[pod-service] Reading feed with retry (topic: ${topicHex.slice(0, 16)}...)`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    console.log(`[pod-service] Attempt ${attempt + 1}/${maxRetries + 1}...`);
    const result = await readFeedPage(topic);
    if (result) {
      console.log(`[pod-service] Feed found on attempt ${attempt + 1}`);
      return result;
    }

    if (attempt < maxRetries) {
      console.log(`[pod-service] Feed not found, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 5000); // Exponential backoff, max 5 seconds
    }
  }

  console.log(`[pod-service] Feed not found after ${maxRetries + 1} attempts`);
  return null;
}

/**
 * Write binary feed page (4096 bytes)
 */
async function writeFeedPage(topic: Topic, page: Uint8Array): Promise<void> {
  if (!POSTAGE_BATCH_ID) {
    throw new Error("POSTAGE_BATCH_ID not configured");
  }
  const writer = bee.makeFeedWriter(topic, platformSigner);
  await writer.uploadPayload(POSTAGE_BATCH_ID, page);
}

/**
 * Upload data to Swarm /bytes
 */
async function uploadToBytes(data: string | Uint8Array): Promise<Hex64> {
  if (!POSTAGE_BATCH_ID) {
    throw new Error("POSTAGE_BATCH_ID not configured");
  }

  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const result = await bee.uploadData(POSTAGE_BATCH_ID, bytes);

  const ref = typeof result.reference === "string"
    ? result.reference
    : result.reference.toString();

  return ref.toLowerCase().replace(/^0x/, "") as Hex64;
}

/**
 * Download data from Swarm /bytes
 * Handles different bee-js response formats
 */
async function downloadFromBytes(ref: string): Promise<string> {
  const result = await bee.downloadData(ref);

  // Debug: log the result type and structure
  console.log("[pod-service] downloadData result type:", typeof result,
    result instanceof Uint8Array ? "Uint8Array" :
    (result && typeof result === "object" ? `Object keys: ${Object.keys(result).join(", ")}` : "unknown"));

  // Handle different bee-js response formats
  // Pattern 1: Direct Uint8Array
  if (result instanceof Uint8Array) {
    return new TextDecoder().decode(result);
  }

  if (typeof result === "object" && result !== null) {
    const res = result as unknown as Record<string, unknown>;

    // Pattern 2: bee-js Data object with toUtf8() method (common in newer versions)
    if (typeof (res as { toUtf8?: () => string }).toUtf8 === "function") {
      return (res as { toUtf8: () => string }).toUtf8();
    }

    // Pattern 3: Object with toText() method
    if (typeof (res as { toText?: () => string }).toText === "function") {
      return (res as { toText: () => string }).toText();
    }

    // Pattern 4: Object with text() method (Response-like)
    if (typeof (res as { text?: () => string | Promise<string> }).text === "function") {
      const textResult = (res as { text: () => string | Promise<string> }).text();
      return textResult instanceof Promise ? await textResult : textResult;
    }

    // Pattern 5: Object with data property
    if (res.data instanceof Uint8Array) {
      return new TextDecoder().decode(res.data);
    }

    // Pattern 6: Object with bytes property
    if (res.bytes instanceof Uint8Array) {
      return new TextDecoder().decode(res.bytes);
    }

    // Pattern 7: Object with payload property (like feed responses)
    if (res.payload && typeof res.payload === "object") {
      const payload = res.payload as Record<string, unknown>;
      if (typeof (payload as { toUtf8?: () => string }).toUtf8 === "function") {
        return (payload as { toUtf8: () => string }).toUtf8();
      }
      if (payload instanceof Uint8Array) {
        return new TextDecoder().decode(payload);
      }
    }

    // Pattern 8: Object with toUint8Array() method
    if (typeof (res as { toUint8Array?: () => Uint8Array }).toUint8Array === "function") {
      return new TextDecoder().decode((res as { toUint8Array: () => Uint8Array }).toUint8Array());
    }

    // Log what we got for debugging
    console.error("[pod-service] Unexpected downloadData result. Keys:", Object.keys(res));
    console.error("[pod-service] Result prototype:", Object.getPrototypeOf(result)?.constructor?.name);
    throw new Error(`Unexpected downloadData result format: ${Object.keys(res).join(", ")}`);
  }

  throw new Error(`Unexpected downloadData result type: ${typeof result}`);
}

/* -------------------------------------------------------------------------- */
/*  Series metadata (stored in /bytes, NOT in feed)                           */
/* -------------------------------------------------------------------------- */

interface SeriesMetadata {
  v: 1;
  seriesId: string;
  title: string;
  description: string;
  imageHash: Hex64;
  creatorPodPublicKey: string;
  creatorEthAddress?: `0x${string}`;
  totalSupply: number;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Create a new POD series on Swarm
 *
 * Storage structure:
 * 1. Series metadata → uploaded to /bytes → metadataRef
 * 2. Each POD → uploaded to /bytes → podHash
 * 3. Editions feed (4096 bytes): [metadataRef, podHash1, podHash2, ...]
 * 4. Claims feed (4096 bytes): all zeros initially
 */
export async function createPodSeries(opts: {
  seriesId: string;
  title: string;
  description: string;
  imageHash: Hex64;
  creatorPodPublicKey: string;
  creatorEthAddress?: string;
  totalSupply: number;
  signedPods: Array<{ edition: number; podSerialized: string }>;
}): Promise<PodSeriesFeed> {
  const {
    seriesId,
    title,
    description,
    imageHash,
    creatorPodPublicKey,
    creatorEthAddress,
    totalSupply,
    signedPods,
  } = opts;

  // Validate inputs (max 127 because slot 0 is metadataRef)
  if (totalSupply > 127) {
    throw new Error("Total supply cannot exceed 127 editions in v1");
  }
  if (signedPods.length !== totalSupply) {
    throw new Error(`Expected ${totalSupply} signed PODs, got ${signedPods.length}`);
  }

  console.log(`[pod-service] Creating series ${seriesId} with ${totalSupply} editions`);

  // Step 1: Upload all signed PODs to /bytes
  const podHashes: string[] = [];
  for (const { edition, podSerialized } of signedPods) {
    console.log(`[pod-service] Uploading edition ${edition}...`);
    const podHash = await uploadToBytes(podSerialized);
    podHashes.push(podHash);

    // Add 100ms delay between uploads to avoid rate limiting
    if (edition < signedPods.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Step 2: Create and upload series metadata to /bytes
  const metadata: SeriesMetadata = {
    v: 1,
    seriesId,
    title,
    description,
    imageHash,
    creatorPodPublicKey,
    creatorEthAddress: creatorEthAddress as `0x${string}` | undefined,
    totalSupply,
    createdAt: new Date().toISOString(),
  };

  console.log(`[pod-service] Uploading series metadata...`);
  const metadataRef = await uploadToBytes(JSON.stringify(metadata));

  // Step 3: Pack editions feed: [metadataRef, podHash1, podHash2, ...]
  const editionRefs = [metadataRef, ...podHashes];
  const editionsPage = pack4096(editionRefs);

  console.log(`[pod-service] Writing editions feed for ${seriesId}`);
  await writeFeedPage(topicPodEditions(seriesId), editionsPage);

  // Verify the editions feed is readable (wait for propagation)
  console.log(`[pod-service] Verifying editions feed write...`);
  const verifyEditions = await readFeedPageWithRetry(topicPodEditions(seriesId), 3, 500);
  if (!verifyEditions) {
    throw new Error(`Failed to verify editions feed write for ${seriesId} - feed not readable after write`);
  }
  console.log(`[pod-service] Editions feed verified successfully`);

  // Step 4: Initialize empty claims feed (all zeros = no claims)
  const claimsPage = new Uint8Array(4096);
  console.log(`[pod-service] Writing claims feed for ${seriesId}`);
  await writeFeedPage(topicPodClaims(seriesId), claimsPage);

  // Verify claims feed write
  console.log(`[pod-service] Verifying claims feed write...`);
  const verifyClaims = await readFeedPageWithRetry(topicPodClaims(seriesId), 3, 500);
  if (!verifyClaims) {
    throw new Error(`Failed to verify claims feed write for ${seriesId} - feed not readable after write`);
  }
  console.log(`[pod-service] Claims feed verified successfully`);

  // Step 5: Update global directory (non-blocking, best-effort)
  try {
    await addToDirectory({
      seriesId,
      title,
      imageHash,
      creatorPodPublicKey,
      totalSupply,
      claimedCount: 0,
      createdAt: metadata.createdAt,
    });
  } catch (err) {
    console.error("[pod-service] Failed to update directory (non-critical):", err);
  }

  // Step 6: Update creator's collection (non-blocking, best-effort)
  try {
    await addToCreatorCollection(creatorPodPublicKey, seriesId);
  } catch (err) {
    console.error("[pod-service] Failed to update creator collection (non-critical):", err);
  }

  // Return reconstructed PodSeriesFeed for API compatibility
  const editions: EditionEntry[] = podHashes.map((podHash, i) => ({
    edition: i + 1,
    podHash,
    claimed: false,
  }));

  return {
    v: 1,
    seriesId,
    title,
    description,
    imageHash,
    creatorPodPublicKey,
    creatorEthAddress: creatorEthAddress as `0x${string}` | undefined,
    totalSupply,
    createdAt: metadata.createdAt,
    editions,
  };
}

/**
 * Get a POD series by ID
 * Reconstructs PodSeriesFeed from packed binary feeds
 * Uses retry logic to handle feed propagation delays
 */
export async function getPodSeries(seriesId: string): Promise<PodSeriesFeed | null> {
  console.log(`[pod-service] Getting series ${seriesId}`);

  // Read editions feed (with retry for propagation delays)
  const editionsPage = await readFeedPageWithRetry(topicPodEditions(seriesId));
  if (!editionsPage) {
    console.log(`[pod-service] Series ${seriesId} not found after retries`);
    return null;
  }

  const editionRefs = decode4096(editionsPage);
  if (editionRefs.length === 0) return null;

  // First ref is metadataRef
  const metadataRef = editionRefs[0];
  const podHashes = editionRefs.slice(1);

  // Fetch metadata from /bytes
  let metadata: SeriesMetadata;
  try {
    const metadataJson = await downloadFromBytes(metadataRef);
    metadata = JSON.parse(metadataJson);
  } catch (err) {
    console.error("[pod-service] Failed to fetch metadata:", err);
    return null;
  }

  // Read claims feed (with retry for propagation delays after claims)
  console.log(`[pod-service] Reading claims feed for ${seriesId}...`);
  const claimsPage = await readFeedPageWithRetry(topicPodClaims(seriesId), 5, 1000);
  const claimedHashes = claimsPage ? decode4096Claims(claimsPage) : [];
  console.log(`[pod-service] Claims feed read: ${claimedHashes.filter(h => h !== "").length} claimed editions`);

  // Read claimers feed (to get who claimed each edition)
  console.log(`[pod-service] Reading claimers feed for ${seriesId}...`);
  const claimersData = await getClaimersFeed(seriesId);
  console.log(`[pod-service] Claimers feed: ${claimersData ? Object.keys(claimersData.claimers).length : 0} entries`);

  // Reconstruct editions array with claimedBy info
  const editions: EditionEntry[] = podHashes.map((podHash, i) => {
    const editionNum = i + 1;
    const claimedPodHash = claimedHashes[i] || "";
    const claimerInfo = claimersData?.claimers[String(editionNum)];
    return {
      edition: editionNum,
      podHash,
      claimed: claimedPodHash !== "",
      claimedBy: claimerInfo?.podPublicKey,
      claimedPodHash: claimedPodHash || undefined,
      claimedAt: claimerInfo?.claimedAt,
    };
  });

  return {
    v: 1,
    seriesId: metadata.seriesId,
    title: metadata.title,
    description: metadata.description,
    imageHash: metadata.imageHash,
    creatorPodPublicKey: metadata.creatorPodPublicKey,
    creatorEthAddress: metadata.creatorEthAddress,
    totalSupply: metadata.totalSupply,
    createdAt: metadata.createdAt,
    editions,
  };
}

/**
 * Claim an edition from a series
 * Updates the claims feed with the claimed POD hash
 * Updates the claimers feed with who claimed it
 * Adds to user's collection feed (if ethAddress provided)
 */
export async function claimEdition(opts: {
  seriesId: string;
  edition: number;
  claimerPodPublicKey: string;
  claimerEthAddress?: Hex0x;
  claimedPodSerialized: string;
}): Promise<{ edition: number; claimedPodHash: Hex64 }> {
  const { seriesId, edition, claimerPodPublicKey, claimerEthAddress, claimedPodSerialized } = opts;

  console.log(`[pod-service] Claiming edition ${edition} of series ${seriesId}`);
  console.log(`[pod-service] Claimer POD key: ${claimerPodPublicKey.slice(0, 16)}...`);
  if (claimerEthAddress) {
    console.log(`[pod-service] Claimer ETH address: ${claimerEthAddress}`);
  }

  // Read current claims feed
  let claimsPage = await readFeedPage(topicPodClaims(seriesId));
  if (!claimsPage) {
    throw new Error(`Series ${seriesId} not found`);
  }

  // Check slot index (edition 1 = slot 0 in claims)
  const slotIndex = edition - 1;
  if (slotIndex < 0 || slotIndex >= 127) {
    throw new Error(`Invalid edition number: ${edition}`);
  }

  // Check if already claimed
  const offset = slotIndex * 32;
  let alreadyClaimed = false;
  for (let j = 0; j < 32; j++) {
    if (claimsPage[offset + j] !== 0) {
      alreadyClaimed = true;
      break;
    }
  }

  if (alreadyClaimed) {
    // Return existing claim hash
    const existingHash = bytes32ToHex(claimsPage, offset);
    console.log(`[pod-service] Edition ${edition} already claimed`);
    return { edition, claimedPodHash: existingHash as Hex64 };
  }

  // Upload claimed POD to /bytes
  console.log(`[pod-service] Uploading claimed POD for edition ${edition}`);
  const claimedPodHash = await uploadToBytes(claimedPodSerialized);

  // Update claims page
  const claimBytes = hexToBytes32(claimedPodHash);
  claimsPage.set(claimBytes, offset);

  // Write updated claims feed
  console.log(`[pod-service] Updating claims feed`);
  await writeFeedPage(topicPodClaims(seriesId), claimsPage);

  // Update claimers feed (JSON with who claimed what)
  console.log(`[pod-service] Updating claimers feed...`);
  try {
    await updateClaimersFeed(seriesId, edition, claimerPodPublicKey);
  } catch (err) {
    console.error(`[pod-service] Failed to update claimers feed:`, err);
  }

  // Add to user's collection (if ethAddress provided)
  if (claimerEthAddress) {
    console.log(`[pod-service] Adding to user's collection for ${claimerEthAddress}...`);
    try {
      const series = await getPodSeries(seriesId);
      if (series) {
        await addToUserCollection(claimerEthAddress, claimerPodPublicKey, {
          seriesId,
          seriesTitle: series.title,
          edition,
          imageHash: series.imageHash,
          claimedPodHash,
          claimedAt: new Date().toISOString(),
        });
        console.log(`[pod-service] Successfully added to user collection!`);
      } else {
        console.warn(`[pod-service] Could not find series ${seriesId} to add to collection`);
      }
    } catch (err) {
      console.error(`[pod-service] Failed to add to user collection:`, err);
    }
  } else {
    console.warn(`[pod-service] No claimerEthAddress provided - skipping user collection update`);
  }

  // Verify the claims feed write (wait for propagation)
  console.log(`[pod-service] Verifying claims feed update...`);
  const verifyUpdatedClaims = await readFeedPageWithRetry(topicPodClaims(seriesId), 3, 500);
  if (!verifyUpdatedClaims) {
    console.warn(`[pod-service] Claims feed verification failed for edition ${edition}`);
  } else {
    console.log(`[pod-service] Claims feed update verified`);
  }

  // Update directory claimed count (non-blocking, best-effort)
  try {
    await updateDirectoryClaimedCount(seriesId);
  } catch (err) {
    console.error("[pod-service] Failed to update directory claimed count:", err);
  }

  return { edition, claimedPodHash };
}

/**
 * Get the global POD directory
 */
export async function getPodDirectory(): Promise<PodDirectoryFeed> {
  console.log("[pod-service] getPodDirectory: Reading directory feed...");
  const page = await readFeedPage(topicPodDirectory() as unknown as Topic);

  if (!page) {
    console.log("[pod-service] getPodDirectory: No feed page found, returning empty directory");
    return {
      v: 1,
      entries: [],
      page: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  console.log(`[pod-service] getPodDirectory: Feed page size: ${page.length} bytes`);

  // Directory stores JSON, not packed refs
  try {
    // Find the end of the actual JSON data (first null byte)
    let jsonLength = page.length;
    for (let i = 0; i < page.length; i++) {
      if (page[i] === 0) {
        jsonLength = i;
        break;
      }
    }

    // Only decode the actual JSON bytes (exclude null padding)
    const jsonBytes = page.subarray(0, jsonLength);
    const json = new TextDecoder().decode(jsonBytes);
    console.log(`[pod-service] getPodDirectory: Decoded JSON length: ${json.length} chars`);
    console.log(`[pod-service] getPodDirectory: JSON preview: ${json.substring(0, 200)}...`);
    const parsed = JSON.parse(json);
    console.log(`[pod-service] getPodDirectory: Parsed directory has ${parsed.entries?.length || 0} entries`);
    return parsed;
  } catch (err) {
    console.error("[pod-service] getPodDirectory: Failed to parse directory JSON:", err);
    return {
      v: 1,
      entries: [],
      page: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Get all series created by a specific creator
 */
export async function getCreatorCollection(creatorPodKey: string): Promise<string[]> {
  const page = await readFeedPage(topicPodCreator(creatorPodKey) as unknown as Topic);
  if (!page) return [];

  try {
    // Find the end of the actual JSON data (first null byte)
    let jsonLength = page.length;
    for (let i = 0; i < page.length; i++) {
      if (page[i] === 0) {
        jsonLength = i;
        break;
      }
    }

    // Only decode the actual JSON bytes (exclude null padding)
    const jsonBytes = page.subarray(0, jsonLength);
    const json = new TextDecoder().decode(jsonBytes);
    const collection = JSON.parse(json) as PodCreatorFeed;
    return collection.seriesIds ?? [];
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*  Directory and creator collection helpers                                  */
/* -------------------------------------------------------------------------- */

async function addToDirectory(entry: PodDirectoryEntry): Promise<void> {
  console.log(`[pod-service] Adding series ${entry.seriesId} to directory...`);

  const directory = await getPodDirectory();
  console.log(`[pod-service] Current directory has ${directory.entries.length} entries`);

  // Check if already exists (idempotency)
  const exists = directory.entries.some((e) => e.seriesId === entry.seriesId);
  if (exists) {
    console.log(`[pod-service] Series ${entry.seriesId} already in directory`);
    return;
  }

  // Add to beginning (newest first)
  directory.entries.unshift(entry);
  directory.updatedAt = new Date().toISOString();

  // Limit to 128 entries per page (for v1)
  if (directory.entries.length > 128) {
    directory.entries = directory.entries.slice(0, 128);
    console.warn("[pod-service] Directory full, oldest entry removed");
  }

  // Directory is small JSON, encode to bytes
  const json = JSON.stringify(directory);
  const page = new TextEncoder().encode(json);
  console.log(`[pod-service] Directory JSON size: ${json.length} bytes`);

  // Pad to 4096 if needed (directory JSON is small)
  const paddedPage = new Uint8Array(4096);
  paddedPage.set(page);

  console.log(`[pod-service] Writing directory feed...`);
  await writeFeedPage(topicPodDirectory() as unknown as Topic, paddedPage);
  console.log(`[pod-service] Directory updated! Now has ${directory.entries.length} entries`);
}

async function updateDirectoryClaimedCount(seriesId: string): Promise<void> {
  const directory = await getPodDirectory();
  const entry = directory.entries.find((e) => e.seriesId === seriesId);

  if (!entry) {
    console.warn(`[pod-service] Series ${seriesId} not found in directory`);
    return;
  }

  // Fetch actual series to get accurate count
  const series = await getPodSeries(seriesId);
  if (!series) return;

  entry.claimedCount = series.editions.filter((e) => e.claimed).length;
  directory.updatedAt = new Date().toISOString();

  const json = JSON.stringify(directory);
  const page = new TextEncoder().encode(json);
  const paddedPage = new Uint8Array(4096);
  paddedPage.set(page);

  await writeFeedPage(topicPodDirectory() as unknown as Topic, paddedPage);
}

async function addToCreatorCollection(creatorPodKey: string, seriesId: string): Promise<void> {
  const existingIds = await getCreatorCollection(creatorPodKey);

  // Check if already exists (idempotency)
  if (existingIds.includes(seriesId)) {
    console.log(`[pod-service] Series ${seriesId} already in creator collection`);
    return;
  }

  const collection: PodCreatorFeed = {
    v: 1,
    creatorPodPublicKey: creatorPodKey,
    seriesIds: [...existingIds, seriesId],
    updatedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(collection);
  const page = new TextEncoder().encode(json);
  const paddedPage = new Uint8Array(4096);
  paddedPage.set(page);

  await writeFeedPage(topicPodCreator(creatorPodKey) as unknown as Topic, paddedPage);
}

/* -------------------------------------------------------------------------- */
/*  Claimers feed - tracks who claimed each edition                           */
/* -------------------------------------------------------------------------- */

interface ClaimersData {
  v: 1;
  claimers: Record<string, { podPublicKey: string; claimedAt: string }>;
  updatedAt: string;
}

/**
 * Read claimers feed for a series
 * Returns map of edition -> claimer info
 */
async function getClaimersFeed(seriesId: string): Promise<ClaimersData | null> {
  const page = await readFeedPage(topicPodClaimers(seriesId));
  if (!page) return null;

  try {
    // Find the end of the actual JSON data (first null byte)
    let jsonLength = page.length;
    for (let i = 0; i < page.length; i++) {
      if (page[i] === 0) {
        jsonLength = i;
        break;
      }
    }

    const jsonBytes = page.subarray(0, jsonLength);
    const json = new TextDecoder().decode(jsonBytes);
    return JSON.parse(json) as ClaimersData;
  } catch {
    return null;
  }
}

/**
 * Update claimers feed with new claimer
 */
async function updateClaimersFeed(
  seriesId: string,
  edition: number,
  claimerPodPublicKey: string
): Promise<void> {
  // Read existing claimers data
  const existing = await getClaimersFeed(seriesId) || {
    v: 1 as const,
    claimers: {},
    updatedAt: new Date().toISOString(),
  };

  // Add new claimer
  existing.claimers[String(edition)] = {
    podPublicKey: claimerPodPublicKey,
    claimedAt: new Date().toISOString(),
  };
  existing.updatedAt = new Date().toISOString();

  // Write updated claimers feed
  const json = JSON.stringify(existing);
  const page = new TextEncoder().encode(json);
  const paddedPage = new Uint8Array(4096);
  paddedPage.set(page);

  await writeFeedPage(topicPodClaimers(seriesId), paddedPage);
  console.log(`[pod-service] Claimers feed updated for series ${seriesId}`);
}

/* -------------------------------------------------------------------------- */
/*  User's POD Collection - their "passport" of claimed PODs                  */
/* -------------------------------------------------------------------------- */

/**
 * Get user's POD collection by Ethereum address
 */
export async function getUserCollection(ethAddress: string): Promise<PodCollectionFeed | null> {
  console.log(`[pod-service] Getting collection for ${ethAddress}`);
  const page = await readFeedPage(topicPodCollection(ethAddress));
  if (!page) return null;

  try {
    let jsonLength = page.length;
    for (let i = 0; i < page.length; i++) {
      if (page[i] === 0) {
        jsonLength = i;
        break;
      }
    }

    const jsonBytes = page.subarray(0, jsonLength);
    const json = new TextDecoder().decode(jsonBytes);
    return JSON.parse(json) as PodCollectionFeed;
  } catch {
    return null;
  }
}

/**
 * Add a claimed POD to user's collection
 */
async function addToUserCollection(
  ethAddress: Hex0x,
  podPublicKey: string,
  entry: PodCollectionEntry
): Promise<void> {
  console.log(`[pod-service] Adding to collection for ${ethAddress}`);

  // Read existing collection
  const existing = await getUserCollection(ethAddress) || {
    v: 1 as const,
    ownerEthAddress: ethAddress,
    ownerPodPublicKey: podPublicKey,
    entries: [],
    updatedAt: new Date().toISOString(),
  };

  // Check if already exists (idempotency - check seriesId + edition)
  const exists = existing.entries.some(
    (e) => e.seriesId === entry.seriesId && e.edition === entry.edition
  );
  if (exists) {
    console.log(`[pod-service] Entry already in collection`);
    return;
  }

  // Add new entry (newest first)
  existing.entries.unshift(entry);
  existing.updatedAt = new Date().toISOString();

  // Write updated collection
  const json = JSON.stringify(existing);
  const page = new TextEncoder().encode(json);
  const paddedPage = new Uint8Array(4096);
  paddedPage.set(page);

  await writeFeedPage(topicPodCollection(ethAddress), paddedPage);
  console.log(`[pod-service] Collection updated for ${ethAddress}, now has ${existing.entries.length} entries`);
}

/**
 * Sync user's collection by scanning all series for their claims
 * This is useful for users who claimed before the collection feed existed
 */
export async function syncUserCollection(
  ethAddress: Hex0x,
  podPublicKey: string
): Promise<{ synced: number; total: number }> {
  console.log(`[pod-service] Syncing collection for ${ethAddress} (POD key: ${podPublicKey.slice(0, 16)}...)`);

  // Get all series from directory
  const directory = await getPodDirectory();
  if (!directory.entries || directory.entries.length === 0) {
    console.log(`[pod-service] No series in directory to sync`);
    return { synced: 0, total: 0 };
  }

  console.log(`[pod-service] Checking ${directory.entries.length} series for claims...`);

  let synced = 0;
  const entriesToAdd: PodCollectionEntry[] = [];

  // Check each series for claims by this user
  for (const dirEntry of directory.entries) {
    const claimersData = await getClaimersFeed(dirEntry.seriesId);
    if (!claimersData) continue;

    // Check if this user claimed any edition
    for (const [editionStr, claimerInfo] of Object.entries(claimersData.claimers)) {
      if (claimerInfo.podPublicKey === podPublicKey) {
        // User claimed this edition
        const edition = parseInt(editionStr, 10);
        console.log(`[pod-service] Found claim: ${dirEntry.title} edition #${edition}`);

        // Get the claimed POD hash from claims feed
        const series = await getPodSeries(dirEntry.seriesId);
        const editionData = series?.editions.find(e => e.edition === edition);

        entriesToAdd.push({
          seriesId: dirEntry.seriesId,
          seriesTitle: dirEntry.title,
          edition,
          imageHash: dirEntry.imageHash,
          claimedPodHash: editionData?.claimedPodHash || "",
          claimedAt: claimerInfo.claimedAt,
        });
        synced++;
      }
    }
  }

  if (entriesToAdd.length === 0) {
    console.log(`[pod-service] No claims found to sync`);
    return { synced: 0, total: directory.entries.length };
  }

  // Get existing collection and merge
  const existing = await getUserCollection(ethAddress) || {
    v: 1 as const,
    ownerEthAddress: ethAddress,
    ownerPodPublicKey: podPublicKey,
    entries: [],
    updatedAt: new Date().toISOString(),
  };

  // Add entries that don't already exist
  let added = 0;
  for (const entry of entriesToAdd) {
    const exists = existing.entries.some(
      e => e.seriesId === entry.seriesId && e.edition === entry.edition
    );
    if (!exists) {
      existing.entries.unshift(entry);
      added++;
    }
  }

  if (added > 0) {
    existing.updatedAt = new Date().toISOString();

    // Sort by claimedAt (newest first)
    existing.entries.sort((a, b) =>
      new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime()
    );

    // Write updated collection
    const json = JSON.stringify(existing);
    const page = new TextEncoder().encode(json);
    const paddedPage = new Uint8Array(4096);
    paddedPage.set(page);

    await writeFeedPage(topicPodCollection(ethAddress), paddedPage);
    console.log(`[pod-service] Synced ${added} claims to collection`);
  }

  return { synced: added, total: directory.entries.length };
}
