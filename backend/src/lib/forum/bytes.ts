// src/lib/forum/bytes.ts
// -----------------------------------------------------------------------------
// Bee's FeedReader returns an object with a `payload` field, but its exact
// shape varies by version:
//
//   - v10 typically exposes: payload: Bytes (with .toBytes(): Uint8Array)
//   - some builds expose:    payload: { bytes: Uint8Array }
//   - older or polyfilled:   payload: Uint8Array
//
// These guards let us *safely* extract the payload as a Uint8Array without
// using `any` (to keep ESLint happy).
// -----------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

type HasToBytes = { toBytes: () => Uint8Array }
function hasToBytes(v: unknown): v is HasToBytes {
  return isObject(v) && "toBytes" in v && typeof (v as { toBytes: unknown }).toBytes === "function"
}

type HasBytes = { bytes: Uint8Array }
function hasBytes(v: unknown): v is HasBytes {
  return isObject(v) && "bytes" in v && (v as { bytes: unknown }).bytes instanceof Uint8Array
}

/** Accepts Bytes | {bytes:Uint8Array} | Uint8Array | unknown → Uint8Array */
export function extractBytes(maybe: unknown): Uint8Array {
  if (maybe instanceof Uint8Array) return maybe
  if (hasToBytes(maybe)) return maybe.toBytes()
  if (hasBytes(maybe)) return maybe.bytes
  return new Uint8Array()
}

/**
 * Given a raw FeedReader response (unknown), return the payload bytes.
 * Works across bee-js shapes without `any`.
 */
export function extractFeedPayloadBytes(res: unknown): Uint8Array {
  const payload: unknown = isObject(res) ? (res as { payload?: unknown }).payload : undefined
  return extractBytes(payload)
}
