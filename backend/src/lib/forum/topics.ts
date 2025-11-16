// Deterministic topics (bchan-style). Uses ethers for keccak256.
import { keccak256, toUtf8Bytes } from "ethers";

export function topicBoard(boardId: string): `0x${string}` {
  return keccak256(toUtf8Bytes(`board:${boardId}`)) as `0x${string}`;
}

export function topicThread(boardId: string, threadRef: string): `0x${string}` {
  return keccak256(toUtf8Bytes(`thread:${boardId}:${threadRef}`)) as `0x${string}`;
}
