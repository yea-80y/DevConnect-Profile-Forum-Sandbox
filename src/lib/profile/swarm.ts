export async function getFeedRef(beeUrl: string, owner: string, topicHex: string) {
  const r = await fetch(`${beeUrl}/feeds/${owner}/${topicHex}?type=sequence`);
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const j = await r.json(); // { reference: "0x…" }
  return j.reference as string;
}

/** Read a canonical JSON blob by Swarm reference (posts uploaded via uploadData → /bytes).
 *  - Lowercase ref to match server writes.
 *  - Try /bytes first; fallback to /bzz (NO trailing slash).
 *  - Use text() → JSON.parse to avoid content-type quirks.
 *  - cache: "no-store" avoids reusing truncated cached responses.
 */
export async function fetchJsonByRef(beeUrl: string, refHex: string) {
  const ref = refHex.toLowerCase();

  // 1) Primary: /bytes/<ref>  (matches how posts are stored)
  {
    const r = await fetch(`${beeUrl}/bytes/${ref}`, { cache: "no-store" });
    if (r.ok) {
      const txt = await r.text();
      try { return JSON.parse(txt); }
      catch {
        console.error("[fetchJsonByRef] Invalid JSON from /bytes:", txt.slice(0, 200));
        throw new Error(`POST_JSON_PARSE_FAILED_BYTES ${ref}`);
      }
    }
  }

  // 2) Fallback: /bzz/<ref>  (NO trailing slash)
  {
    const r = await fetch(`${beeUrl}/bzz/${ref}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`bzz ${r.status}`);
    const txt = await r.text();
    try { return JSON.parse(txt); }
    catch {
      console.error("[fetchJsonByRef] Invalid JSON from /bzz:", txt.slice(0, 200));
      throw new Error(`POST_JSON_PARSE_FAILED_BZZ ${ref}`);
    }
  }
}

/** Read a binary/blob by Swarm reference (avatars/images uploaded via uploadFile → /bzz).
 *  - Lowercase ref for consistency.
 *  - Prefer /bzz/<ref> (NO trailing slash); fallback to /bytes for raw blobs.
 *  - cache: "no-store" avoids stale partials.
 */
export async function fetchBlobByRef(beeUrl: string, refHex: string) {
  const ref = refHex.toLowerCase();

  // 1) Prefer /bzz for manifests/files
  {
    const r = await fetch(`${beeUrl}/bzz/${ref}`, { cache: "no-store" });
    if (r.ok) return r.blob();
  }

  // 2) Fallback /bytes for raw blobs
  {
    const r = await fetch(`${beeUrl}/bytes/${ref}`, { cache: "no-store" });
    if (r.ok) return r.blob();
    throw new Error(`blob ${r.status}`);
  }
}

