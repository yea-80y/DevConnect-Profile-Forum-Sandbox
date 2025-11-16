// src/lib/avatar.ts
// Robust avatar ref picking with NO `any`. Scans all JSON fields returned by /api/profile
// and picks a 64-hex candidate, preferring keys/paths containing "avatar".
// Change from your version: also extracts 64-hex from URL-ish strings like "/bzz/<hash>".

import { apiUrl } from "@/config/api";

type Maybe<T> = T | null | undefined

// ---------- guards & helpers ----------
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object"
}
export function isHex64(s: Maybe<string>): boolean {
  return !!s && /^[0-9a-fA-F]{64}$/.test(s)
}
export function normRef(s: Maybe<string>): string | null {
  if (!s) return null
  const hex = s.toLowerCase().replace(/^0x/, "")
  return isHex64(hex) ? hex : null
}
export function isEthAddress(s: Maybe<string>): boolean {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s)
}

// NEW: pull a 64-hex from anywhere inside a string (e.g., "/bzz/<hash>" or URLs)
function extractHexFromString(s: string): string | null {
  const m = s.toLowerCase().match(/([0-9a-f]{64})/)
  return m ? m[1] : null
}

// ---------- recursive scan over JSON ----------
// Walk whole JSON; collect 64-hex strings. Score by key/path to prefer avatar-ish fields.
type Candidate = { ref: string; score: number; path: string }

function collectHexCandidates(node: unknown, path: string[] = [], out: Candidate[] = []): Candidate[] {
  if (typeof node === "string") {
    const p = path.join(".").toLowerCase()

    // exact 64-hex? else try extracting from URL-ish strings
    const exact = normRef(node)
    const extracted = exact ?? extractHexFromString(node)

    if (extracted) {
      // scoring: bias toward avatar-related paths/keys
      let score = 0
      if (p.includes("avatarref")) score += 200
      if (p.endsWith(".avatar.ref") || p.includes(".avatar.ref")) score += 180
      if (p.includes("avatar")) score += 150
      if (p.includes("profile")) score += 25
      if (p.includes("current") || p.includes("latest")) score += 15
      if (p.endsWith(".ref")) score += 2
      // prefer exact matches slightly over extracted-from-URL
      if (!exact) score -= 5

      out.push({ ref: extracted, score, path: path.join(".") })
    }
    return out
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) collectHexCandidates(node[i], [...path, String(i)], out)
    return out
  }
  if (isRecord(node)) {
    for (const [k, v] of Object.entries(node)) collectHexCandidates(v, [...path, k], out)
    return out
  }
  return out
}

function bestAvatarRefFromJson(json: unknown): string | null {
  const cands = collectHexCandidates(json)
  if (!cands.length) return null
  // Choose the highest score; if tie, prefer paths that include "avatar".
  cands.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aAvatar = Number(a.path.toLowerCase().includes("avatar"))
    const bAvatar = Number(b.path.toLowerCase().includes("avatar"))
    return bAvatar - aAvatar
  })
  return cands[0].ref
}

// ---------- public API ----------

// Used by list pages when they pass the post payload (tolerant across shapes).
export function pickAvatarRefFromPayload(payload: unknown): string | null {
  // Try the obvious fast paths first:
  if (isRecord(payload)) {
    const r = payload as Record<string, unknown>

    // direct hex in common fields
    const direct = normRef(r["avatarRef"] as Maybe<string>)
    if (direct) return direct
    const avatar = r["avatar"]
    if (isRecord(avatar)) {
      const n = normRef((avatar as Record<string, unknown>)["ref"] as Maybe<string>)
      if (n) return n
      // NEW: allow URL-ish avatar.src/url
      const aSrc = (avatar as Record<string, unknown>)["src"]
      if (typeof aSrc === "string") {
        const ex = extractHexFromString(aSrc)
        if (ex) return ex
      }
      const aUrl = (avatar as Record<string, unknown>)["url"]
      if (typeof aUrl === "string") {
        const ex = extractHexFromString(aUrl)
        if (ex) return ex
      }
    }

    const profile = r["profile"]
    if (isRecord(profile)) {
      const pr = profile as Record<string, unknown>
      const n1 = normRef(pr["avatarRef"] as Maybe<string>)
      if (n1) return n1
      const pav = pr["avatar"]
      if (isRecord(pav)) {
        const n2 = normRef((pav as Record<string, unknown>)["ref"] as Maybe<string>)
        if (n2) return n2
        // NEW: allow URL-ish profile.avatar.src/url
        const pSrc = (pav as Record<string, unknown>)["src"]
        if (typeof pSrc === "string") {
          const ex = extractHexFromString(pSrc)
          if (ex) return ex
        }
        const pUrl = (pav as Record<string, unknown>)["url"]
        if (typeof pUrl === "string") {
          const ex = extractHexFromString(pUrl)
          if (ex) return ex
        }
      }

      // NEW: allow URL-ish profile-level fields
      const prSrc = pr["avatarSrc"]
      if (typeof prSrc === "string") {
        const ex = extractHexFromString(prSrc)
        if (ex) return ex
      }
      const prUrl = pr["avatarUrl"]
      if (typeof prUrl === "string") {
        const ex = extractHexFromString(prUrl)
        if (ex) return ex
      }
    }

    // NEW: allow top-level URL-ish fields
    const topSrc = r["avatarSrc"]
    if (typeof topSrc === "string") {
      const ex = extractHexFromString(topSrc)
      if (ex) return ex
    }
    const topUrl = r["avatarUrl"]
    if (typeof topUrl === "string") {
      const ex = extractHexFromString(topUrl)
      if (ex) return ex
    }
  }

  // Fallback: scan everything (now handles URL-ish strings too)
  return bestAvatarRefFromJson(payload)
}

// Used when you have a profile object (e.g., from useProfile()).
export function pickAvatarRefFromProfile(profile: unknown): string | null {
  return bestAvatarRefFromJson(profile)
}

// Network: fetch the latest avatar for an owner by scanning /api/profile?owner=0x...
// Try multiple common param names backed by your existing /api/profile route.
// We still reuse the same JSON picker you already have.
export async function fetchLatestAvatarRef(owner: string): Promise<string | null> {
  try {
    const ownerLc = owner?.trim().toLowerCase()
    if (!isEthAddress(ownerLc)) return null

    // Most-to-least likely keys your API might accept
    const keys = ["owner", "subject", "address", "addr", "wallet", "id"]

    for (const k of keys) {
      const url = apiUrl(`/api/profile?${k}=${encodeURIComponent(ownerLc)}`)
      try {
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) continue
        const j: unknown = await res.json()

        const ref = bestAvatarRefFromJson(j) // ← handles hex AND URL-ish strings
        if (ref) return ref
      } catch {
        // try next key
      }
    }

    return null
  } catch {
    return null
  }
}

// Simple per-author memoization to avoid duplicate /api/profile calls across PostItems.
// --- lightweight per-author cache to prevent duplicate lookups ---
const _avatarRefCache = new Map<string, string | null>()
const _avatarRefInflight = new Map<string, Promise<string | null>>()

export function getLatestAvatarRefCached(owner: string): Promise<string | null> {
  const key = owner?.toLowerCase()
  if (!isEthAddress(key)) return Promise.resolve(null)

  if (_avatarRefCache.has(key)) {
    return Promise.resolve(_avatarRefCache.get(key)!)
  }
  const inflight = _avatarRefInflight.get(key)
  if (inflight) return inflight

  const p = fetchLatestAvatarRef(key)
    .then((ref) => {
      _avatarRefCache.set(key, ref ?? null)
      _avatarRefInflight.delete(key)
      return ref ?? null
    })
    .catch(() => {
      _avatarRefInflight.delete(key)
      return null
    })

  _avatarRefInflight.set(key, p)
  return p
}

// (Optional) allow pages to pre-warm a handful of authors
export function primeAvatarCache(owners: string[]) {
  owners.forEach((o) => { void getLatestAvatarRefCached(o) })
}
