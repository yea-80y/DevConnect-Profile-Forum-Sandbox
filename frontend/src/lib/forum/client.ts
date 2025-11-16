// src/lib/forum/client.ts
// -----------------------------------------------------------------------------
// Tiny forum helpers (bchan-aligned):
// - Board/thread read via our API routes
// - Posts fetched from Bee (prefer /bytes, fallback /bzz)
// - Submits go to /api/forum/post and expect { ok, postRef, threadRef }
// -----------------------------------------------------------------------------

import { BEE_URL } from "@/config/swarm"
import type { SignedPostPayload, SignatureType } from "./types"

export type CanonicalPost = {
  kind: "post"
  payload: SignedPostPayload
  signature: `0x${string}`
  signatureType: SignatureType
  server: { receivedAt: number; boardTopic: `0x${string}`; threadTopic: `0x${string}` }
  v: 1
}

/** GET /api/forum/board?boardId=... → list of thread root refs (64-hex) */
export async function fetchBoard(boardId: string) {
  const { apiUrl } = await import("@/config/api");
  const r = await fetch(apiUrl(`/api/forum/board?boardId=${encodeURIComponent(boardId)}`), { cache: "no-store" })
  const j = await r.json()
  if (!r.ok || !j?.ok) throw new Error(j?.error || "BOARD_FETCH_FAILED")
  return j as { ok: true; boardId: string; threads: string[] }
}

/** GET /api/forum/thread?boardId=...&threadRef=... → list of post refs (64-hex) */
export async function fetchThread(boardId: string, threadRef: string) {
  const { apiUrl } = await import("@/config/api");
  const r = await fetch(
    apiUrl(`/api/forum/thread?boardId=${encodeURIComponent(boardId)}&threadRef=${threadRef}`),
    { cache: "no-store" },
  )
  const j = await r.json()
  if (!r.ok || !j?.ok) throw new Error(j?.error || "THREAD_FETCH_FAILED")
  return j as { ok: true; boardId: string; threadRef: string; posts: string[] }
}

/** Fetch canonical post JSON by Swarm ref (prefer /bytes, fallback to /bzz without trailing slash). */
export async function fetchPostJSON(refHex: string): Promise<CanonicalPost> {
  const refLower = refHex.toLowerCase();

  // 1) bytes (this is how the server writes)
  {
    const r = await fetch(`${BEE_URL}/bytes/${refLower}`, { cache: "no-store" });
    if (r.ok) {
      const txt = await r.text();
      try {
        return JSON.parse(txt) as CanonicalPost;
      } catch {
        console.error("[fetchPostJSON] Invalid JSON from /bytes:", txt.slice(0, 200));
        throw new Error(`POST_JSON_PARSE_FAILED_BYTES ${refLower}`);
      }
    }
  }

  // 2) bzz (no trailing slash)
  {
    const r = await fetch(`${BEE_URL}/bzz/${refLower}`, { cache: "no-store" });
    if (r.ok) {
      const txt = await r.text();
      try {
        return JSON.parse(txt) as CanonicalPost;
      } catch {
        console.error("[fetchPostJSON] Invalid JSON from /bzz:", txt.slice(0, 200));
        throw new Error(`POST_JSON_PARSE_FAILED_BZZ ${refLower}`);
      }
    }
  }

  throw new Error(`FETCH_POST_FAILED ${refLower}`);
}

/** POST /api/forum/post → create thread (no threadRef in payload) or reply (with threadRef)
 *  - Measures client round-trip time and logs it.
 *  - Parses JSON defensively (no `any`).
 *  - Narrows the response with a type guard so the return type is safe.
 */
type PostOk = { ok: true; postRef: string; threadRef: string };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Narrower: ok===true and both refs are strings */
function isPostOk(x: unknown): x is PostOk {
  if (!isObject(x)) return false;
  return x.ok === true && typeof x.postRef === "string" && typeof x.threadRef === "string";
}

/** Pull a server error string if present (without `any`) */
function extractError(x: unknown): string | undefined {
  if (!isObject(x)) return undefined;
  const v = (x as Record<string, unknown>).error;
  return typeof v === "string" ? v : undefined;
}

export async function submitPost(
  body: {
    payload: SignedPostPayload;
    signature: `0x${string}`;
    signatureType: SignatureType;
  },
  extraHeaders?: Record<string, string> // ← NEW
) {
  const { apiUrl } = await import("@/config/api");
  const t0 = performance.now(); // start timing the network round trip

  const r = await fetch(apiUrl("/api/forum/post"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(extraHeaders ?? {}), // ← NEW: merge web3 headers when provided
    },
    body: JSON.stringify(body),
  });

  const dt = Math.round(performance.now() - t0); // elapsed ms at response arrival

  let j: unknown;
  try {
    j = await r.json();
  } catch {
    console.warn("[client] /api/forum/post bad JSON ms", dt);
    throw new Error("POST_BAD_JSON");
  }

  // If HTTP failed, try to surface server { error } if available.
  if (!r.ok) {
    const msg = extractError(j) ?? "POST_FAILED";
    console.warn("[client] /api/forum/post failed ms", dt, msg);
    throw new Error(msg);
  }

  // Ensure the success shape is exactly what we expect.
  if (!isPostOk(j)) {
    const msg = extractError(j) ?? "POST_FAILED";
    console.warn("[client] /api/forum/post malformed ms", dt, msg);
    throw new Error(msg);
  }

  console.log("[client] /api/forum/post ok ms", dt);
  return j; // `j` is narrowed to PostOk here
}

