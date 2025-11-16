// src/lib/avatar.ts (minimal server version)
const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Extract a swarm ref for the avatar from a profile payload.
 * Accepts multiple shapes:
 *  - payload.avatar?.ref
 *  - payload.avatarRef
 *  - payload.avatar?.bzz (legacy)
 * Returns a lowercase hex-64 string or null.
 */
export function pickAvatarRefFromPayload(payload: any): string | null {
  if (!payload) return null;

  const candidates: unknown[] = [
    payload.avatar?.ref,
    payload.avatarRef,
    payload.avatar?.bzz,
  ];

  for (const v of candidates) {
    if (typeof v === "string") {
      const ref = v.toLowerCase();
      if (HEX64.test(ref)) return ref;
    }
  }
  return null;
}
