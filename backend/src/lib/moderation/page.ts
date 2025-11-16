// 4096-byte page of 32-byte refs (newest-first, zero-padded)
const PAGE_SIZE = 4096
const ENTRY_SIZE = 32
const MAX_ENTRIES = PAGE_SIZE / ENTRY_SIZE // 128

function isZero32(a: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) return false
  return true
}

/** Decode a 4KB page into an array of 64-hex refs (no 0x prefix) */
export function decodeRefs(page: Uint8Array): string[] {
  const out: string[] = []
  for (let i = 0; i < PAGE_SIZE; i += ENTRY_SIZE) {
    const s = page.subarray(i, i + ENTRY_SIZE)
    if (isZero32(s)) break
    out.push(Buffer.from(s).toString("hex"))
  }
  return out
}

function hexTo32Bytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error("bad 32-byte hex")
  return new Uint8Array(Buffer.from(clean, "hex"))
}

/** Encode an array of 64-hex refs into a 4KB zero-padded page */
export function encodeRefs(refs: string[]): Uint8Array {
  const clamped = refs.slice(0, MAX_ENTRIES)
  const buf = new Uint8Array(PAGE_SIZE)
  let off = 0
  for (const r of clamped) {
    buf.set(hexTo32Bytes(r), off)
    off += ENTRY_SIZE
  }
  return buf
}
