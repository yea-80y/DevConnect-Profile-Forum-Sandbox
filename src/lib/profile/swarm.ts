export async function getFeedRef(beeUrl: string, owner: string, topicHex: string) {
  const r = await fetch(`${beeUrl}/feeds/${owner}/${topicHex}?type=sequence`);
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const j = await r.json(); // { reference: "0x…" }
  return j.reference as string;
}
export async function fetchJsonByRef(beeUrl: string, ref: string) {
  const r = await fetch(`${beeUrl}/bzz/${ref}/`);
  if (!r.ok) throw new Error(`bzz ${r.status}`);
  return r.json();
}
export async function fetchBlobByRef(beeUrl: string, ref: string) {
  const r = await fetch(`${beeUrl}/bzz/${ref}/`);
  if (!r.ok) throw new Error(`bzz blob ${r.status}`);
  return r.blob();
}
