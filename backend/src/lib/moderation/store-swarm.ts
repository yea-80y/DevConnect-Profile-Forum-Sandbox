// src/lib/moderation/store-swarm.ts
import { Bee, PrivateKey, Topic } from "@ethersphere/bee-js"
import { decodeRefs, encodeRefs } from "./page"
import { BEE_URL, POSTAGE_BATCH_ID, FEED_PRIVATE_KEY, normalizePk, assertFeedSignerConfigured } from "@/config/swarm"

// Ensure envs exist (server-side only)
assertFeedSignerConfigured()
if (!POSTAGE_BATCH_ID) throw new Error("Missing POSTAGE_BATCH_ID in env")

const bee = new Bee(BEE_URL)
// normalize to 0x + 32 bytes before creating the signer
const signer = new PrivateKey(normalizePk(FEED_PRIVATE_KEY))
const owner = signer.publicKey().address()


// Build a feed Topic deterministically from a string label.
// (Matches how we suggested: mod:threads:<boardId> / mod:replies:<boardId>)
function topicFor(boardId: string, kind: "thread" | "reply"): Topic {
  const label = kind === "thread" ? `mod:threads:${boardId}` : `mod:replies:${boardId}`
  return Topic.fromString(label)
}

const PAGE_SIZE = 4096

async function readPage(boardId: string, kind: "thread" | "reply"): Promise<Uint8Array> {
  const topic = topicFor(boardId, kind)
  const reader = bee.makeFeedReader(topic, owner)
  try {
    const latest = await reader.downloadPayload()
    const payload = latest.payload.toUint8Array() // use helper, not .bytes
    if (payload.length >= PAGE_SIZE) return payload
    const padded = new Uint8Array(PAGE_SIZE)
    padded.set(payload)
    return padded
  } catch {
    // no feed yet -> empty page
    return new Uint8Array(PAGE_SIZE)
  }
}

async function writePage(boardId: string, kind: "thread" | "reply", page: Uint8Array) {
  const topic = topicFor(boardId, kind)
  const writer = bee.makeFeedWriter(topic, signer)
  await writer.uploadPayload(POSTAGE_BATCH_ID, page)

}

/** Read muted refs (64-hex, lowercase) */
export async function getMuted(boardId: string, kind: "thread" | "reply"): Promise<string[]> {
  const page = await readPage(boardId, kind)
  return decodeRefs(page).map(x => x.toLowerCase())
}

/** Add a muted ref (idempotent prepend; cap 128) */
export async function addMuted(boardId: string, kind: "thread" | "reply", refHex: string): Promise<void> {
  const page = await readPage(boardId, kind)
  const refs = decodeRefs(page).map(x => x.toLowerCase())

  const ref = (refHex.startsWith("0x") ? refHex.slice(2) : refHex).toLowerCase()
  if (!/^[0-9a-fA-F]{64}$/.test(ref)) throw new Error("bad 32-byte hex")

  const next = refs.includes(ref) ? refs : [ref, ...refs]
  const bytes = encodeRefs(next)
  await writePage(boardId, kind, bytes)
}

/** Remove a ref from the muted list (idempotent) */
export async function removeMuted(
  boardId: string,
  kind: "thread" | "reply",
  refHex: string
): Promise<void> {
  // read current page and decode to 64-hex refs (lowercased)
  const page = await readPage(boardId, kind)
  const refs = decodeRefs(page).map(x => x.toLowerCase())

  // normalise input (allow with or without 0x)
  const ref = (refHex.startsWith("0x") ? refHex.slice(2) : refHex).toLowerCase()
  if (!/^[0-9a-fA-F]{64}$/.test(ref)) throw new Error("bad 32-byte hex")

  // remove if present; if not present, no-op
  const next = refs.filter(r => r !== ref)
  if (next.length === refs.length) return

  // re-encode and write page back to the feed
  const bytes = encodeRefs(next)
  await writePage(boardId, kind, bytes)
}
