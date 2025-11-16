import { keccak256, toUtf8Bytes } from "ethers"

/** 32-byte topic from a string (hex) */
function topicHex(s: string): `0x${string}` {
  return keccak256(toUtf8Bytes(s)) as `0x${string}`
}

/** Feed topic for muted thread roots on a board */
export function topicModThreads(boardId: string): `0x${string}` {
  return topicHex(`mod:threads:${boardId}`)
}

/** Feed topic for muted replies on a board */
export function topicModReplies(boardId: string): `0x${string}` {
  return topicHex(`mod:replies:${boardId}`)
}
