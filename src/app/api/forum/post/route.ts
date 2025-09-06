// src/app/api/forum/post/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Bee } from "@ethersphere/bee-js";
import { getAddress, verifyMessage } from "ethers";
import { BEE_URL, POSTAGE_BATCH_ID } from "@/config/swarm";
import type { SignedPostPayload, SignatureType } from "@/lib/forum/types";
import { topicBoard, topicThread } from "@/lib/forum/topics";
import { updateBoardFeed, updateThreadFeed } from "@/lib/forum/publisher";
import { sha256HexString } from "@/lib/forum/crypto";

// Types for the request body
type PostRequest = {
  payload: SignedPostPayload;
  signature: `0x${string}`;
  signatureType: SignatureType;
};

// Reference-like for uploadData return (handles Bee types across versions)
type ReferenceLike = string | { toString(): string };

// helpers
function is64HexNo0x(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}
function refLikeToHex(ref: ReferenceLike): string {
  return typeof ref === "string" ? ref : ref.toString();
}

const bee = new Bee(BEE_URL);

export async function POST(req: NextRequest) {
  try {
    const { payload, signature, signatureType } = (await req.json()) as PostRequest;

    // 0) Basic payload guards
    if (!payload?.boardId || typeof payload.boardId !== "string") {
      return NextResponse.json({ ok: false, error: "BAD_BOARD_ID" }, { status: 400 });
    }
    if (!payload?.subject || !/^0x[0-9a-fA-F]{40}$/.test(payload.subject)) {
      return NextResponse.json({ ok: false, error: "BAD_SUBJECT" }, { status: 400 });
    }

    // 1) Verify signer (currently EIP-191 only; reject others until added)
    if (signatureType !== "eip191") {
      // TODO: support eip712 via ethers.verifyTypedData(...)
      return NextResponse.json({ ok: false, error: "UNSUPPORTED_SIGNATURE_TYPE" }, { status: 400 });
    }
    const recovered = getAddress(verifyMessage(JSON.stringify(payload), signature));
    if (recovered.toLowerCase() !== payload.subject.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 400 });
    }

    // 2) Validate optional threadRef format (64-hex, no 0x)
    if (payload.threadRef && !is64HexNo0x(payload.threadRef)) {
      return NextResponse.json({ ok: false, error: "BAD_THREAD_REF" }, { status: 400 });
    }

    // 3) Validate optional avatarRef format if present
    if (payload.avatarRef && !is64HexNo0x(payload.avatarRef)) {
      return NextResponse.json({ ok: false, error: "BAD_AVATAR_REF" }, { status: 400 });
    }

    // 4) Enforce content hash integrity on the server
    if (!payload.content || typeof payload.content !== "string") {
      return NextResponse.json({ ok: false, error: "EMPTY_CONTENT" }, { status: 400 });
    }
    const computed = await sha256HexString(payload.content);
    if (computed.toLowerCase() !== payload.contentSha256.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "CONTENT_HASH_MISMATCH" }, { status: 400 });
    }

    // 5) Build topics (deterministic, bchan-style)
    const boardTopic = topicBoard(payload.boardId);

    // 6) Upload canonical post JSON via platform batch
    if (!POSTAGE_BATCH_ID) {
      return NextResponse.json({ ok: false, error: "POSTAGE_BATCH_ID missing" }, { status: 500 });
    }

    const canonical = {
      kind: "post" as const,
      payload,
      signature,
      signatureType,
      server: {
        receivedAt: Date.now(),
        boardTopic,
        threadTopic:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      },
      v: 1 as const,
    };

    const body = new TextEncoder().encode(JSON.stringify(canonical));
    const upload = (await bee.uploadData(POSTAGE_BATCH_ID, body)) as { reference: ReferenceLike };
    const postRefHex = refLikeToHex(upload.reference);

    // 7) Decide thread root (new thread uses own post as root)
    const threadRootRefHex = payload.threadRef ?? postRefHex;
    const threadTopic = topicThread(payload.boardId, threadRootRefHex);
    canonical.server.threadTopic = threadTopic;

    // 8) Update feeds (bchan mechanics)
    await updateThreadFeed(threadTopic, postRefHex);
    if (!payload.threadRef) {
      await updateBoardFeed(boardTopic, threadRootRefHex);
    }

    return NextResponse.json({ ok: true, postRef: postRefHex, threadRef: threadRootRefHex });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("POST /api/forum/post error:", msg);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
