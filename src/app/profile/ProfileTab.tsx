// src/app/profile/ProfileTab.tsx
"use client";

/**
 * ProfileTab (Platform signer writes, per-user topics)
 * ---------------------------------------------------
 * Architecture:
 * - The server holds a **platform signer** (feed owner). It writes feed payloads via /api/profile.
 * - The UI has (or creates) a **user account** (subject). We key topics by this address:
 *      devconnect/profile/name/{subjectNo0x}
 *      devconnect/profile/avatar/{subjectNo0x}
 * - We POST the subject with each write so the backend can derive per-user topics.
 *
 * Flow:
 *  1) User types a Display Name (optional).
 *  2) User picks an avatar image (optional).
 *  3) Save:
 *      - If name present → POST /api/profile { kind: "name", payload: { name, subject } }
 *      - If avatar present:
 *          a) Upload the image to /bzz → get immutable 64-hex reference
 *          b) POST /api/profile { kind: "avatar", payload: { imageRef, subject } }
 *  4) Preview reads the profile using <ProfileView feedOwner={platformSigner} subject={user}>
 *
 * Notes:
 * - Name is stored as JSON inside the feed payload (mutable). No BZZ hash by design.
 * - Avatar is immutable → uploaded to /bzz; we store its 64-hex ref in the avatar feed JSON.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bee, Topic } from "@ethersphere/bee-js";
import Image from "next/image";
import { BEE_URL, POSTAGE_BATCH_ID } from "@/config/swarm";
import ProfileView from "./ProfileView";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wallet } from "ethers"; // ethers v6 (for deriving subject address)
import { FEED_NS } from "@/lib/swarm-core/topics";


/* ----------------------------- Types (client) ----------------------------- */

type Hex0x = `0x${string}`;

/** Server responses (we only need the platform owner's 0x address here) */
interface ApiOk { ok: true; owner: Hex0x; subject?: Hex0x }
interface ApiErr { ok: false; error: string }
type ApiResponse = ApiOk | ApiErr;

/** Request shapes now include the per-user subject (0x…) */
interface NamePayload   { name: string;    subject: Hex0x }
interface AvatarPayload { imageRef: string; subject: Hex0x }
type RequestBody =
  | { kind: "name";   payload: NamePayload }
  | { kind: "avatar"; payload: AvatarPayload };

/** Helper to post profile writes to the server (platform signer will stamp them) */
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

  // Form state
  const [displayName, setDisplayName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Clean up object URLs to avoid memory leaks (runs on unmount and before previewUrl changes)
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // UI state
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Platform signer’s feed owner (WITH 0x, returned by the server after each POST)
  const [owner0x, setOwner0x] = useState<Hex0x | null>(null);

  // Active user account (subject) loaded from localStorage (created on the Account/Home screens)
  const [subject0x, setSubject0x] = useState<Hex0x | null>(null);

  /**
   * Load the active user private key from localStorage and derive address (subject).
   * Keys:
   *  - "woco.active_pk"   → preferred (new)
   *  - "demo_user_pk"     → legacy fallback if present
   */
  useEffect(() => {
    try {
      const pk =
        (typeof window !== "undefined" && (localStorage.getItem("woco.active_pk") || localStorage.getItem("demo_user_pk"))) as Hex0x | null;
      if (pk) {
        const addr = new Wallet(pk).address as Hex0x;
        setSubject0x(addr);
      } else {
        setErr("No active account. Create or select one on the Accounts/Home screen first.");
      }
    } catch (e) {
      setErr(`Failed to load active account: ${String(e)}`);
    }
  }, []);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    setBusy(true);

    try {
      if (!POSTAGE_BATCH_ID) throw new Error("Set NEXT_PUBLIC_POSTAGE_BATCH_ID in .env.local");
      if (!subject0x) throw new Error("No active account – create/select one on the Accounts/Home screen first.");

      // (1) Save display name (optional) → topic keyed by subject
      const nameToSave = displayName.trim();
      if (nameToSave) {
        const { owner } = await postProfile({ kind: "name", payload: { name: nameToSave, subject: subject0x } });
        setOwner0x(owner);

        // DEBUG: feed GET for the name (topic derived from SUBJECT, not owner)
        const subjectNo0x = subject0x.slice(2).toLowerCase();
        const topicStr = `${FEED_NS}/name/${subjectNo0x}`;
        const topicHex = Topic.fromString(topicStr).toString();
        console.log("[profile] name saved via platform signer", {
          feedOwner0x: owner,
          subject0x,
          topicStr,
          topicHex,
          feedGET: `${BEE_URL}/feeds/${owner}/${topicHex}`,
        });
      }

      // (2) Upload avatar → immutable BZZ ref → save avatar feed for SUBJECT
      const file = fileRef.current?.files?.[0] ?? null;
      if (file) {
        const uploadRes = await bee.uploadFile(POSTAGE_BATCH_ID, file, file.name);
        const imageRefHex = uploadRes.reference.toHex();

        console.log("[profile] avatar uploaded (immutable BZZ)", {
          imageRefHex,
          bzz: `${BEE_URL}/bzz/${imageRefHex}`,
        });

        const { owner } = await postProfile({ kind: "avatar", payload: { imageRef: imageRefHex, subject: subject0x } });
        setOwner0x(owner);

        // DEBUG: feed GET for the avatar (topic derived from SUBJECT)
        const subjectNo0x = subject0x.slice(2).toLowerCase();
        const topicStr = `${FEED_NS}/avatar/${subjectNo0x}`;
        const topicHex = Topic.fromString(topicStr).toString();
        console.log("[profile] avatar feed updated via platform signer", {
          feedOwner0x: owner,
          subject0x,
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
        <div className="font-semibold mb-2">Create / Update Profile (platform signer → per-user topics)</div>

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
          {subject0x && (
            <p className="text-xs text-gray-500 break-all">
              Subject (user) address (0x): {subject0x}
            </p>
          )}
        </form>
      </div>

      {/* Preview panel: platform-owned feed, per-user topics */}
      <div className="rounded border p-4 bg-white/80">
        <div className="font-semibold mb-2">Preview</div>
        {owner0x && subject0x ? (
          <ProfileView feedOwner={owner0x} subject={subject0x} />
        ) : (
          <p className="text-sm text-gray-500">
            Save first (needs platform feed owner and an active user account).
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
