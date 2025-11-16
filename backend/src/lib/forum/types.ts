// Snapshot-only post model (no "latest profile" lookups)
// src/lib/forum/types.ts
import type { Hex0x } from "@/lib/swarm-core/types";

export type SignatureType = "eip191" | "eip712";

export interface SignedPostPayload {
  // identity
  subject: Hex0x;          // LOCAL: subject==signer (safe); WEB3: subject==parent (signer is posting key)
  boardId: string;         // e.g. "devconnect:general"
  threadRef?: string;      // 64-hex (no 0x); root ref when replying

  // content
  content: string;         // text/markdown
  contentSha256: `0x${string}`;

  // immutable profile snapshot at time of posting
  displayName?: string;
  avatarRef?: string;      // 64-hex Swarm ref (no 0x)

  // housekeeping
  createdAt: number;       // ms epoch
  nonce: string;           // anti-replay
  version: 1;
}
