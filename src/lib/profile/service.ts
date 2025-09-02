// src/lib/profile/service.ts
// Ultra-light Swarm reads + safe change detection (version-proof).
// We call this ONLY when:
//   - the app cold-starts (once), or
//   - the tab becomes visible again (rate-limited), or
//   - the user taps a manual "refresh" you may add later.

import { Bee, Topic } from "@ethersphere/bee-js";
import { FEED_NS } from "../swarm-core/topics";
import type { Hex0x, ProfileRenderPack } from "./types";

/** small, dependency-free hash of bytes (FNV-1a 32-bit) → hex string */
function fnv1aHex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    // multiply by 16777619 using bit-ops (avoids bigint/deps)
    hash = (hash + ((hash << 1) >>> 0) + ((hash << 4) >>> 0) + ((hash << 7) >>> 0) + ((hash << 8) >>> 0) + ((hash << 24) >>> 0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** best-effort JSON parse to a plain object */
function tryJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Ultra-light Swarm read:
 *  - name feed   → `${FEED_NS}/name/${subjectNo0x}`
 *  - avatar feed → `${FEED_NS}/avatar/${subjectNo0x}`
 *
 * We rely ONLY on `downloadPayload()` (stable across bee-js versions).
 * For change detection, we hash the UTF-8 payload text (version-proof).
 *
 * Returns the SAME `prev` object (identity) when nothing changed
 * to avoid unnecessary React re-renders.
 */
export async function refreshProfileFromSwarm(opts: {
  beeUrl: string;
  feedOwner: Hex0x;
  subject: Hex0x;
  prev: ProfileRenderPack | null; // pass current cached pack
}): Promise<ProfileRenderPack | null> {
  const { beeUrl, feedOwner, subject, prev } = opts;
  const bee = new Bee(beeUrl);
  const subjectNo0x = subject.slice(2).toLowerCase();

  const nameTopic   = Topic.fromString(`${FEED_NS}/name/${subjectNo0x}`);
  const avatarTopic = Topic.fromString(`${FEED_NS}/avatar/${subjectNo0x}`);

  // Start from prev so unchanged fields are preserved; lets us return `prev` by identity if nothing changed.
  const next: ProfileRenderPack = {
    beeUrl,
    subject,
    feedOwner,
    name: prev?.name,
    avatarRef: prev?.avatarRef,
    nameMarker: prev?.nameMarker,
    avatarMarker: prev?.avatarMarker,
  };

  // ---- NAME ----
  try {
    const res  = await bee.makeFeedReader(nameTopic, feedOwner).downloadPayload();
    const text = res.payload.toUtf8();                               // profile feeds are text (JSON or plain)
    const marker = fnv1aHex(new TextEncoder().encode(text ?? ""));   // <-- version-proof marker

    if (marker !== prev?.nameMarker) {
      const obj = tryJson(text);
      const name =
        (obj && typeof obj.name === "string") ? obj.name :
        (text && typeof text === "string" ? text : undefined);
      next.name = name;
      next.nameMarker = marker;
    }
  } catch {
    // name feed may not exist yet; keep previous values as-is
  }

  // ---- AVATAR ----
  try {
    const res  = await bee.makeFeedReader(avatarTopic, feedOwner).downloadPayload();
    const text = res.payload.toUtf8();
    const marker = fnv1aHex(new TextEncoder().encode(text ?? ""));

    if (marker !== prev?.avatarMarker) {
      const obj = tryJson(text);
      let imageRef: string | undefined;
      if (obj && typeof obj.imageRef === "string") {
        imageRef = obj.imageRef;
      } else if (text && /^[0-9a-f]{64}$/i.test(text)) {
        imageRef = text;
      }
      next.avatarRef = imageRef;
      next.avatarMarker = marker;
    }
  } catch {
    // avatar feed may not exist yet; keep previous values as-is
  }

  const changed =
    next.name !== prev?.name ||
    next.avatarRef !== prev?.avatarRef ||
    next.nameMarker !== prev?.nameMarker ||
    next.avatarMarker !== prev?.avatarMarker ||
    next.beeUrl !== prev?.beeUrl;

  // If nothing changed, return `prev` to preserve identity (no re-render).
  return changed ? next : prev;
}
