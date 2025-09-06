// Node/web-crypto SHA-256 → 0xhex
export async function sha256HexString(s: string): Promise<`0x${string}`> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  return `0x${hex}`;
}
