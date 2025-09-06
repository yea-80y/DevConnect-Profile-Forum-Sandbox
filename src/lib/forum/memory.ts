// src/lib/forum/memory.ts
// Tiny in-memory cache (NOT a source of truth). Safe to disable.
// Used to speed up reads and to update after writes for snappy UI.

export type TopicHex = `0x${string}`

const CACHE_TTL_MS = 5_000 // small TTL to avoid stale UI during bursts
type Entry = { refs: string[]; expiresAt: number }

const cache = new Map<TopicHex, Entry>()

export function cacheGet(topic: TopicHex): string[] | null {
  const e = cache.get(topic)
  if (!e) return null
  if (Date.now() > e.expiresAt) {
    cache.delete(topic)
    return null
  }
  return e.refs
}

export function cacheSet(topic: TopicHex, refs: string[]): void {
  cache.set(topic, { refs, expiresAt: Date.now() + CACHE_TTL_MS })
}

export function cacheInvalidate(topic: TopicHex): void {
  cache.delete(topic)
}
