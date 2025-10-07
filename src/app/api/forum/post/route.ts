// src/app/api/forum/post/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Bee } from "@ethersphere/bee-js";
import { getAddress, verifyMessage } from "ethers";
import { BEE_URL, POSTAGE_BATCH_ID } from "@/config/swarm";
import type { SignedPostPayload, SignatureType } from "@/lib/forum/types";
import { topicThread, topicBoard } from "@/lib/forum/topics";
import { updateBoardFeed, updateThreadFeed } from "@/lib/forum/publisher";
import { sha256HexString } from "@/lib/forum/crypto";

const bee = new Bee(BEE_URL);

type HexAddr = `0x${string}`;
type LocalSession = { kind: "local"; safe: HexAddr };
type Web3Session = { kind: "web3"; parent: HexAddr; postingKey: HexAddr; postAuth: "parent-bound" | "blocked" };
type Session = LocalSession | Web3Session;

function isHexAddr(s?: string | null): s is HexAddr {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
}
function addrEq(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  try { return getAddress(a) === getAddress(b); } catch { return false; }
}

/** Read posting session from request *headers* only (keeps types simple). */
function readSessionFromRequest(req: NextRequest): Session | null {
  const h = req.headers;
  const kind = h.get("x-posting-kind");

  if (kind === "local") {
    const safe = h.get("x-posting-safe");
    return isHexAddr(safe) ? { kind: "local", safe: getAddress(safe) as HexAddr } : null;
  }
  if (kind === "web3") {
    const parent = h.get("x-posting-parent");
    const postingKey = h.get("x-posting-key");
    const postAuth = h.get("x-posting-auth"); // expect "parent-bound"
    if (isHexAddr(parent) && isHexAddr(postingKey) && postAuth === "parent-bound") {
      return {
        kind: "web3",
        parent: getAddress(parent) as HexAddr,
        postingKey: getAddress(postingKey) as HexAddr,
        postAuth: "parent-bound",
      };
    }
    return null;
  }
  return null;
}



type PostRequest = {
  payload: SignedPostPayload;
  signature: `0x${string}`;
  signatureType: SignatureType;
};

type ReferenceLike = string | { toString(): string };

function is64HexNo0x(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}
function refLikeToHex(ref: ReferenceLike): string {
  return typeof ref === "string" ? ref : ref.toString();
}

export async function POST(req: NextRequest) {
  const t0 = Date.now(); // ◀️ START total
  try {
    const { payload, signature, signatureType } = (await req.json()) as PostRequest;

    // 0) Basic payload guards
    if (!payload?.boardId || typeof payload.boardId !== "string") {
      return NextResponse.json({ ok: false, error: "BAD_BOARD_ID" }, { status: 400 });
    }
    if (!payload?.subject || !/^0x[0-9a-fA-F]{40}$/.test(payload.subject)) {
      return NextResponse.json({ ok: false, error: "BAD_SUBJECT" }, { status: 400 });
    }

    // 1) Verify signer (EIP-191 only for now)##
    // 1) Verify signer (EIP-191 only for now)
    const tVerify0 = Date.now();
    if (signatureType !== "eip191") {
      return NextResponse.json({ ok: false, error: "UNSUPPORTED_SIGNATURE_TYPE" }, { status: 400 });
    }
    const recovered = getAddress(verifyMessage(JSON.stringify(payload), signature)); // signer of post payload
    console.log("[api:post] verify ms", Date.now() - tVerify0);

    // 1b) Authorize (LOCAL vs WEB3)
    const sess = readSessionFromRequest(req);

    // Fallback: keep your existing local behavior if no headers were sent
    if (!sess) {
      if (!addrEq(recovered, payload.subject)) {
        return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 403 });
      }
    } else if (sess.kind === "local") {
      // LOCAL: subject and signer are the local posting key
      if (!(addrEq(recovered, sess.safe) && addrEq(payload.subject, sess.safe))) {
        return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 403 });
      }
    } else {
      // WEB3: signer === postingKey, subject === parent, and posting is enabled
      if (!(sess.postAuth === "parent-bound" && addrEq(recovered, sess.postingKey) && addrEq(payload.subject, sess.parent))) {
        return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 403 });
      }
    }

    // 2) Validate refs + content hash
    if (payload.threadRef && !is64HexNo0x(payload.threadRef)) {
      return NextResponse.json({ ok: false, error: "BAD_THREAD_REF" }, { status: 400 });
    }
    if (payload.avatarRef && !is64HexNo0x(payload.avatarRef)) {
      return NextResponse.json({ ok: false, error: "BAD_AVATAR_REF" }, { status: 400 });
    }
    if (!payload.content || typeof payload.content !== "string") {
      return NextResponse.json({ ok: false, error: "EMPTY_CONTENT" }, { status: 400 });
    }
    const computed = await sha256HexString(payload.content);
    if (computed.toLowerCase() !== payload.contentSha256.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "CONTENT_HASH_MISMATCH" }, { status: 400 });
    }

    // 3) Topics
    const boardTopic = topicBoard(payload.boardId);

    // 4) Upload canonical post JSON via /bytes
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
        threadTopic: "0x" + "00".repeat(32) as `0x${string}`,
      },
      v: 1 as const,
    };
    const tUpload0 = Date.now();
    const body = new TextEncoder().encode(JSON.stringify(canonical));
    const upload = (await bee.uploadData(POSTAGE_BATCH_ID, body)) as { reference: ReferenceLike };
    const postRefHex = refLikeToHex(upload.reference).toLowerCase();
    console.log("[api:post] upload /bytes ms", Date.now() - tUpload0);

    // 5) Thread root + topic
    const threadRootRefHex = (payload.threadRef ?? postRefHex).toLowerCase();
    const threadTopic = topicThread(payload.boardId, threadRootRefHex);
    canonical.server.threadTopic = threadTopic;

    // 6) Update feeds
    // --- OPTION A (strict, slower API): await both updates ---
    // const tFeeds0 = Date.now();
    // await updateThreadFeed(threadTopic, postRefHex);
    // if (!payload.threadRef) { await updateBoardFeed(boardTopic, threadRootRefHex); }
    // console.log("[api:post] feeds ms", Date.now() - tFeeds0);

    // --- OPTION B (fast API): fire-and-forget feed updates ---
    //     The response returns immediately; feeds catch up shortly after.
    //     This matches your optimistic-UI goal and avoids blocking the client.
    void (async () => {
      try {
        await updateThreadFeed(threadTopic, postRefHex);
        if (!payload.threadRef) {
          await updateBoardFeed(boardTopic, threadRootRefHex);
        }
      } catch (e) {
        console.error("[api:post] feed update failed", e);
      }
    })();

    console.log("[api:post] total ms", Date.now() - t0);
    return NextResponse.json({ ok: true, postRef: postRefHex, threadRef: threadRootRefHex });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("POST /api/forum/post error:", msg);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
