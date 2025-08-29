// src/app/profile/ProfileTab.tsx
"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bee, Topic } from "@ethersphere/bee-js";
import Image from "next/image";
import { BEE_URL, POSTAGE_BATCH_ID } from "@/config/swarm";
import ProfileView from "./ProfileView";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * ProfileTab (Platform Signer version)
 * ------------------------------------
 * UX:
 *  1) User enters a display name (optional).
 *  2) User selects an avatar image (optional).
 *  3) On Save:
 *      - If name present → POST /api/profile { kind: "name",   payload: { name } }
 *      - If avatar present:
 *           a) upload file to Bee (immutable) → get imageRef (hex, no 0x)
 *           b) POST /api/profile { kind: "avatar", payload: { imageRef } }
 *  4) Server holds a private key and writes feed payloads with makeFeedWriter().uploadPayload().
 *  5) Preview reads the platform signer’s feed owner using <ProfileView owner={owner0x} />
 *
 * Notes:
 *  - This mirrors the bchan pattern (platform signer).
 *  - Next step (not implemented here): user EIP-712 signature → POST kind: "verify".
 *
 * Address formatting convention in this component:
 *  - owner0x:  "0x"-prefixed address (returned by the API; pass to <ProfileView> and to /feeds URLs)
 *  - ownerNo0x: no-"0x" lowercased address (only used to construct topic strings for DEBUG logs)
 */

/* ----------------------------- Types (client) ----------------------------- */

type Hex0x = `0x${string}`;

interface ApiOk { ok: true; owner: Hex0x }
interface ApiErr { ok: false; error: string }
type ApiResponse = ApiOk | ApiErr;

interface NamePayload { name: string }
interface AvatarPayload { imageRef: string }
type RequestBody =
  | { kind: "name";   payload: NamePayload }
  | { kind: "avatar"; payload: AvatarPayload };

async function postProfile(body: RequestBody): Promise<ApiOk> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse;
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

export default function ProfileTab() {
  const bee = useMemo(() => new Bee(BEE_URL), []);

  const [displayName, setDisplayName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Platform signer’s feed owner (WITH 0x, as returned by the server).
  const [owner0x, setOwner0x] = useState<Hex0x | null>(null);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    setBusy(true);

    try {
      if (!POSTAGE_BATCH_ID) throw new Error("Set NEXT_PUBLIC_POSTAGE_BATCH_ID in .env.local");

      // (1) Save display name (optional)
      const nameToSave = displayName.trim();
      if (nameToSave) {
        const { owner } = await postProfile({ kind: "name", payload: { name: nameToSave } });
        setOwner0x(owner);

        // DEBUG: compute & print the feed GET URL for the name
        const ownerNo0x = owner.slice(2).toLowerCase();
        const topicStr = `devconnect/profile/name/${ownerNo0x}`;
        const topicHex = Topic.fromString(topicStr).toString();
        console.log("[profile] name saved via platform signer", {
          owner0x: owner,
          topicStr,
          topicHex,
          feedGET: `${BEE_URL}/feeds/${owner}/${topicHex}`,
        });
      }

      // (2) Upload avatar → immutable BZZ ref → save avatar feed (optional)
      const file = fileRef.current?.files?.[0] ?? null;
      if (file) {
        const uploadRes = await bee.uploadFile(POSTAGE_BATCH_ID, file, file.name);
        const imageRefHex = uploadRes.reference.toHex();

        console.log("[profile] avatar uploaded (immutable BZZ)", {
          imageRefHex,
          bzz: `${BEE_URL}/bzz/${imageRefHex}`,
        });

        const { owner } = await postProfile({ kind: "avatar", payload: { imageRef: imageRefHex } });
        setOwner0x(owner);

        // DEBUG: compute & print the feed GET URL for the avatar
        const ownerNo0x = owner.slice(2).toLowerCase();
        const topicStr = `devconnect/profile/avatar/${ownerNo0x}`;
        const topicHex = Topic.fromString(topicStr).toString();
        console.log("[profile] avatar feed updated via platform signer", {
          owner0x: owner,
          topicStr,
          topicHex,
          feedGET: `${BEE_URL}/feeds/${owner}/${topicHex}`,
        });
      }

      setSaved(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      {/* Write panel */}
      <div className="rounded border p-4 bg-white/80">
        <div className="font-semibold mb-2">Create / Update Profile (platform signer)</div>

        <form onSubmit={onSave} className="space-y-4">
          {/* Display name */}
          <div>
            <label className="block text-sm mb-1">Display name</label>
            <Input
              value={displayName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
              placeholder="e.g. Nabil Abbas"
            />
          </div>

          {/* Avatar picker + preview */}
          <div className="space-y-2">
            <label className="block text-sm">Avatar (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                const f = ev.target.files?.[0] ?? null;
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(f ? URL.createObjectURL(f) : null);
              }}
            />

            <div className="flex items-center gap-3">
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="avatar preview"
                  width={64}
                  height={64}
                  unoptimized
                  className="w-16 h-16 rounded-full object-cover border"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 border" />
              )}
            </div>
          </div>

          {/* Save */}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save to Swarm"}
          </Button>

          {/* Status */}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {saved && <p className="text-sm text-green-700">Saved ✓</p>}

          {/* Debug */}
          {owner0x && (
            <p className="text-xs text-gray-500 break-all mt-2">
              Platform feed owner (0x): {owner0x}
            </p>
          )}
        </form>
      </div>

      {/* Preview panel (reads the platform signer’s feeds) */}
      <div className="rounded border p-4 bg-white/80">
        <div className="font-semibold mb-2">Preview</div>
        {owner0x ? (
          <ProfileView owner={owner0x} />
        ) : (
          <p className="text-sm text-gray-500">
            Save first to see preview (uses the platform signer’s owner address).
          </p>
        )}
      </div>

      {/* Environment info */}
      <p className="text-xs text-gray-500">
        Bee: {BEE_URL} • Batch: {POSTAGE_BATCH_ID?.slice(0, 10)}…
      </p>
    </div>
  );
}
