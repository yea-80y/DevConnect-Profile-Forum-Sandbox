// src/lib/profile/types.ts
// Minimal, explicit types the UI needs.
// Keep this tiny so we don't need `any` anywhere.

export type Hex0x = `0x${string}`;

/**
 * What the UI renders + the minimal markers we keep
 * for change detection (so we avoid unnecessary re-renders).
 */
export interface ProfileRenderPack {
  beeUrl: string;
  subject: Hex0x;
  feedOwner: Hex0x;

  // Rendered fields
  name?: string;
  avatarRef?: string; // 64-hex Swarm reference for the avatar image

  // Change-detection markers derived from feed payloads
  // (so we update React state ONLY when something actually changed)
  nameMarker?: string;
  avatarMarker?: string;
}
