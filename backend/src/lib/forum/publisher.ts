// src/lib/forum/publisher.ts
// Lightweight, safe, and backward-compatible:
// - Keeps your original exports: updateBoardFeed(boardTopicHex, threadRootRefHex)
//   and updateThreadFeed(threadTopicHex, postRefHex)  ✅ so your imports keep working
// - Also provides bchan-style helpers (publishNewThread / publishPostToThread)
// Implementation: read-modify-write to avoid "only 1 item remains" bug.

import { Bee, Topic, PrivateKey } from "@ethersphere/bee-js";
import {
  BEE_URL,
  POSTAGE_BATCH_ID,
  FEED_PRIVATE_KEY,
  normalizePk,
  assertFeedSignerConfigured,
} from "@/config/swarm";

// --- tiny helpers ---
function assertRefHex32(refHex: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(refHex)) throw new Error(`Bad 32B ref: ${refHex}`);
}
function hexToBytes32(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
// Input array is OLDEST→NEWEST; page stores NEWEST→OLDEST (slot 0 is newest).
function pack4096(refsOldestFirst: string[]): Uint8Array {
  const page = new Uint8Array(4096);
  const newestFirst = refsOldestFirst.slice(-128).reverse();
  for (let i = 0; i < newestFirst.length; i++) page.set(hexToBytes32(newestFirst[i]), i * 32);
  return page;
}
// Decode page NEWEST→OLDEST → OLDEST→NEWEST.
function decode4096_toOldestFirst(page: Uint8Array): string[] {
  const newestFirst: string[] = [];
  for (let i = 0; i < 128; i++) {
    const off = i * 32;
    let zero = true;
    for (let j = 0; j < 32; j++) if (page[off + j] !== 0) { zero = false; break; }
    if (zero) break;
    let h = "";
    for (let j = 0; j < 32; j++) h += page[off + j].toString(16).padStart(2, "0");
    newestFirst.push(h);
  }
  return newestFirst.reverse();
}
// Safely extract payload bytes from bee-js download() without any/eslint ignores.
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
function pushUnique(arr: string[], ref: string) {
  if (arr.length && arr[arr.length - 1] === ref) return;
  if (!arr.includes(ref)) arr.push(ref);
}

// --- bee-js v10 setup (server only) ---
const bee = new Bee(BEE_URL);
assertFeedSignerConfigured();
const platformPk = new PrivateKey(normalizePk(FEED_PRIVATE_KEY));
const ownerAddress = platformPk.publicKey().address().toHex(); // reader uses same owner

async function readOldestFirstByTopic(topic: Topic): Promise<string[]> {
  const reader = bee.makeFeedReader(topic, ownerAddress);
  try {
    const res = await reader.download();
    const bytes = toBytes(res);
    return bytes && bytes.length ? decode4096_toOldestFirst(bytes) : [];
  } catch {
    return [];
  }
}
async function publishPage(topic: Topic, page: Uint8Array): Promise<void> {
  if (!POSTAGE_BATCH_ID) throw new Error("POSTAGE_BATCH_ID missing");
  const writer = bee.makeFeedWriter(topic, platformPk);
  await writer.uploadPayload(POSTAGE_BATCH_ID, page);
}

/* -------------------------------------------------------------------------- */
/*  Backward-compatible exports (HEX TOPICS)                                  */
/* -------------------------------------------------------------------------- */

/** New thread on a board (hex topic). Keeps your original import working. */
export async function updateBoardFeed(boardTopicHex: `0x${string}`, threadRootRefHex: string): Promise<void> {
  assertRefHex32(threadRootRefHex);
  const t = new Topic(boardTopicHex);
  const refs = await readOldestFirstByTopic(t);
  pushUnique(refs, threadRootRefHex);
  await publishPage(t, pack4096(refs));
}

/** Post (root or reply) to a thread (hex topic). Keeps your original import working. */
export async function updateThreadFeed(threadTopicHex: `0x${string}`, postRefHex: string): Promise<void> {
  assertRefHex32(postRefHex);
  const t = new Topic(threadTopicHex);
  const refs = await readOldestFirstByTopic(t);
  pushUnique(refs, postRefHex);
  await publishPage(t, pack4096(refs));
}

/* -------------------------------------------------------------------------- */
/*  Optional bchan-style helpers (STRING TOPICS, IdentifierWord conventions)  */
/* -------------------------------------------------------------------------- */

const boardTopicFromWord = (identifierWord: string) => Topic.fromString(identifierWord);
const threadTopicFromWord = (identifierWord: string, threadRootRefHex: string) =>
  Topic.fromString(identifierWord + threadRootRefHex);

/** New thread using bchan naming (IdentifierWord). */
export async function publishNewThread(identifierWord: string, threadRootRefHex: string): Promise<void> {
  assertRefHex32(threadRootRefHex);
  const t = boardTopicFromWord(identifierWord);
  const refs = await readOldestFirstByTopic(t);
  pushUnique(refs, threadRootRefHex);
  await publishPage(t, pack4096(refs));
}

/** Reply/root post using bchan thread topic naming (IdentifierWord + threadRootRef). */
export async function publishPostToThread(
  identifierWord: string,
  threadRootRefHex: string,
  postRefHex: string
): Promise<void> {
  assertRefHex32(threadRootRefHex); assertRefHex32(postRefHex);
  const t = threadTopicFromWord(identifierWord, threadRootRefHex);
  const refs = await readOldestFirstByTopic(t);
  pushUnique(refs, postRefHex);
  await publishPage(t, pack4096(refs));
}
