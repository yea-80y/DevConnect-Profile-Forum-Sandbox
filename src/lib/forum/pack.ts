// src/lib/forum/pack.ts

/** Convert a hex string (0x… or plain 64-hex) to bytes. Throws on bad input. */
export function hexToBytes32(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error(`Expected 32-byte hex, got: ${hex}`)
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Pack up to 128 x 32B refs (newest-first) into exactly 4096 bytes. */
export function packRefs4096(refs: string[]): Uint8Array {
  const page = new Uint8Array(4096)
  // newest-first (so readers see latest first, like bchan)
  const slice = refs.slice(-128).reverse()
  for (let i = 0; i < slice.length; i++) {
    const bytes = hexToBytes32(slice[i])
    page.set(bytes, i * 32)
  }
  return page
}
