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
 *  4) Immediately update UI **in-state** (applyLocalUpdate) so no extra reads are needed.
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
import { useProfile } from "@/lib/profile/context";

function to64Hex(s: string | null | undefined): string {
  if (!s) throw new Error("missing ref")
  const h = s.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "")
  if (h.length !== 64) throw new Error(`bad ref length: ${h.length}`)
  return h
}

/* ----------------------------- Types (client) ----------------------------- */

type Hex0x = `0x${string}`

/* ------------------------ LocalStorage keys (client) ---------------------- */

const ACTIVE_PK_KEY = "woco.active_pk"; // new key we use in this demo
const LEGACY_PK_KEY = "demo_user_pk";   // fallback if present in your older flow

/* -------------------------------- API helper ------------------------------ */

async function postProfile(body: unknown): Promise<{ ok: true; owner: Hex0x } | never> {
  const r = await fetch("/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `POST /api/profile failed: ${r.status}`);
  }
  const j = (await r.json()) as { ok: boolean; owner?: string };
  if (!j.ok || !j.owner || !j.owner.startsWith("0x")) {
    throw new Error("Server did not return a valid owner address");
  }
  return { ok: true, owner: j.owner as Hex0x };
}

/* --------------------------------- Component ------------------------------ */

export default function ProfileTab() {
  const bee = useMemo(() => new Bee(BEE_URL), []);
  const { applyLocalUpdate, ensureFresh } = useProfile();

  // Form state
  const [displayName, setDisplayName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // UI state
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  // Platform signer’s feed owner (WITH 0x, returned by the server after each POST)
  const [owner0x, setOwner0x] = useState<Hex0x | null>(null);

  // Active user account (subject) loaded from localStorage (created on the Account/Home screens)
  const [subject0x, setSubject0x] = useState<Hex0x | null>(null);

  // Preload cached platform owner (so the read panel can render immediately)
  useEffect(() => {
    try {
      const cached = localStorage.getItem("woco.owner0x") as Hex0x | null;
      if (cached && cached.startsWith("0x")) setOwner0x(cached);
    } catch { /* ignore */ }
  }, []);

  /**
   * Load the active user private key from localStorage and derive address (subject).
   * Keys:
   *  - "woco.active_pk"   → preferred (new)
   *  - "demo_user_pk"     → legacy fallback if present
   */
  useEffect(() => {
    try {
      const pk =
        (typeof window !== "undefined" &&
          (localStorage.getItem(ACTIVE_PK_KEY) || localStorage.getItem(LEGACY_PK_KEY))) as `0x${string}` | null;

      if (!pk) {
        setSubject0x(null);
        return;
      }

      // Derive 0x address from private key (ethers v6)
      const w = new Wallet(pk);
      const addr = w.address as Hex0x;
      setSubject0x(addr);
    } catch {
      setSubject0x(null);
    }
  }, []);

  // React to account switches without a reload
  useEffect(() => {
    const onAcct = () => {
      try {
        const pk =
          (localStorage.getItem("woco.active_pk") ||
          localStorage.getItem("demo_user_pk")) as `0x${string}` | null;
        if (!pk) { setSubject0x(null); return; }
        const w = new Wallet(pk);
        setSubject0x(w.address as Hex0x);
      } catch { /* ignore */ }
    };
    window.addEventListener("account:changed", onAcct);
    return () => window.removeEventListener("account:changed", onAcct);
  }, []);

  // ⬇️ ADD THIS EFFECT (forces the read panel to remount after a save)
  useEffect(() => {
    const onUpdated = () => setVersion((v) => v + 1);
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  // Avatar preview when user picks a file
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

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
  const { owner } = await postProfile({
    kind: "name",
    payload: { name: nameToSave, subject: subject0x }
  });
  setOwner0x(owner);

      // 1) Update in-state profile immediately (no extra network read)
      applyLocalUpdate({ name: nameToSave });

      // 2) Persist local cache for other screens (unchanged)
      try {
        const key = `woco.profile.${subject0x.toLowerCase()}`;
        const prev = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(
          key,
          JSON.stringify({ ...prev, name: nameToSave, updatedAt: Date.now() })
        );
      } catch { /* ignore */ }

      // 3) (optional) clear the input so it feels saved
      // setDisplayName("");

      // 4) force the read panel to remount (you already listen for this)
      window.dispatchEvent(new Event("profile:updated"));

      // 5) Give Bee a moment, then re-read the feed so state converges to "live"
      //    Safe: the *old* feed payload will have the same marker as before,
      //    so it won't overwrite your freshly applied local state.
      setTimeout(() => { void ensureFresh(); }, 1200);
      setTimeout(() => { void ensureFresh(); }, 3000);

      // DEBUG: feed GET for the name (topic derived from SUBJECT)
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

      // (2) Upload avatar (if chosen) → immutable BZZ ref → save avatar feed for SUBJECT
      const file = fileRef.current?.files?.[0] ?? null;
      if (file) {
        const uploadRes = await bee.uploadFile(POSTAGE_BATCH_ID, file, file.name);
        const imageRefHex = uploadRes.reference.toHex();
        const cleanRef = to64Hex(imageRefHex); // <-- ensure exactly 64-hex

        console.log("[profile] avatar uploaded (immutable BZZ)", {
          imageRefHex: cleanRef,
          bzz: `${BEE_URL}/bzz/${cleanRef}`,
        });

        const { owner } = await postProfile({
          kind: "avatar",
          payload: { imageRef: cleanRef, subject: subject0x }
        });
        setOwner0x(owner);

        // 1) Switch UI to the new ref immediately (no extra read)
        applyLocalUpdate({ avatarRef: cleanRef, avatarMarker: Date.now().toString(16) });

        // 2) Clear preview + input (optional but avoids confusion)
        setPreviewUrl(null);
        if (fileRef.current) fileRef.current.value = "";

        // 3) Persist cache for other screens (unchanged)
        try {
          const key = `woco.profile.${subject0x.toLowerCase()}`;
          const prev = JSON.parse(localStorage.getItem(key) || "{}");
          localStorage.setItem(key, JSON.stringify({ ...prev, avatarRef: cleanRef, updatedAt: Date.now() }));
        } catch { /* ignore */ }

        window.dispatchEvent(new Event("profile:updated"));

        // 4) Give Bee a moment, then re-read the feed so state converges to "live"
        setTimeout(() => { void ensureFresh(); }, 1200);
        setTimeout(() => { void ensureFresh(); }, 3000);

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
              placeholder="e.g. Nickname"
            />
          </div>

          {/* Avatar picker + preview */}
          <div className="space-y-2">
            <label className="block text-sm">Avatar (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="block w-full text-sm"
            />
            {previewUrl && (
              <div className="flex items-center gap-3">
                <Image
                  src={previewUrl}
                  alt="preview"
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border"
                />
                <div className="text-xs text-gray-500">Preview</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>

            {saved && <span className="text-green-600 text-sm">Saved ✔</span>}
            {err && <span className="text-red-600 text-sm">Error: {err}</span>}
          </div>
        </form>
      </div>

      {/* Read panel (renders from in-state; zero network calls here) */}
      <div className="rounded border p-4 bg-white/80">
        <div className="font-semibold mb-2">Current Profile (in-state)</div>
        {owner0x && subject0x ? (
          <ProfileView key={`${subject0x}|${version}`} subject={subject0x} feedOwner={owner0x} />
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
