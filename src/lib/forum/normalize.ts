// Normalize to bare 64-hex (no 0x). Returns null if invalid.
const normalize64 = (v: unknown): string | null => {
  if (typeof v !== "string") return null
  const n = v.toLowerCase().replace(/^0x/, "")
  return /^[0-9a-f]{64}$/.test(n) ? n : null
}

// Snapshot avatar from a post payload (supports old/new shapes)
export const pickAvatarRefFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null
  const r = payload as Record<string, unknown>
  const direct = normalize64(r["avatarRef"])
  const hex    = normalize64(r["avatarRefHex"])
  const avatar = r["avatar"]
  const nested = avatar && typeof avatar === "object"
    ? normalize64((avatar as Record<string, unknown>)["ref"])
    : null
  return direct ?? hex ?? nested ?? null
}

// Current avatar from a profile object (for *my* posts only)
export const pickAvatarRefFromProfile = (profile: unknown): string | null => {
  if (!profile || typeof profile !== "object") return null
  const r = profile as Record<string, unknown>
  const direct = normalize64(r["avatarRef"])
  const hex    = normalize64(r["avatarRefHex"])
  const avatar = r["avatar"]
  const nested = avatar && typeof avatar === "object"
    ? normalize64((avatar as Record<string, unknown>)["ref"])
    : null
  return direct ?? hex ?? nested ?? null
}
