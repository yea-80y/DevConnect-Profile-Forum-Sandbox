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
import { FEED_NS } from "@/lib/swarm-core/topics";
import { useProfile } from "@/lib/profile/context";
import { apiUrl } from "@/config/api";

// NEW: source of truth for WHO the user is (subject).
// - Web3  → parent wallet address (NOT the safe)
// - Local → main address derived from local PK
import usePostingIdentity from "@/lib/auth/usePostingIdentity";

function to64Hex(s: string | null | undefined): string {
  if (!s) throw new Error("missing ref")
  const h = s.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "")
  if (h.length !== 64) throw new Error(`bad ref length: ${h.length}`)
  return h
}

/* ----------------------------- Types (client) ----------------------------- */

type Hex0x = `0x${string}`

/* ------------------------ LocalStorage keys (client) ---------------------- */

//const ACTIVE_PK_KEY = "woco.active_pk"; // new key we use in this demo
//const LEGACY_PK_KEY = "demo_user_pk";   // fallback if present in your older flow

/* -------------------------------- API helper ------------------------------ */

async function postProfile(body: unknown): Promise<{ ok: true; owner: Hex0x } | never> {
  const r = await fetch(apiUrl("/api/profile"), {
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

  // Active user account (subject) loaded from localStorage (created on the Account/Home screens)**

  // Preload cached platform owner (so the read panel can render immediately)
  useEffect(() => {
    try {
      const cached = localStorage.getItem("woco.owner0x") as Hex0x | null;
      if (cached && cached.startsWith("0x")) setOwner0x(cached);
    } catch { /* ignore */ }
  }, []);

  // Force the read panel (<ProfileView key=...>) to remount on profile updates
  useEffect(() => {
    const onUpdated = () => setVersion(v => v + 1);
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);
  

  /**
   * Load the active user private key from localStorage and derive address (subject).
   * Keys:
   *  - "woco.active_pk"   → preferred (new)
   *  - "demo_user_pk"     → legacy fallback if present
   */
  // NEW: use the auth hook for WHO the user is (subject).
  // - Web3  → parent wallet address (NOT the safe)
  // - Local → main address derived from local PK
  const id = usePostingIdentity();

  /**
   * Subject resolution (single source of truth)
   * 1) Prefer auth hook subject when ready:
   *    - Web3: parent wallet address
   *    - Local: local main address
   * 2) Fallback for legacy/local-only setups: derive from stored PK.
   *    (Keeps your older flow working.)
   */
  /**
   * Subject resolution (no fallback)
   * - Web3 → parent (0x…)
   * - Local → safe  (0x… your local main addr)
   * - None → null   (force user prompt to log in / create account)
   */
  const subject0x = useMemo<Hex0x | null>(() => {
    if (!id?.ready) return null;
    const addr =
      id.kind === "web3" ? id.parent :
      id.kind === "local" ? id.safe   :
      undefined;

    return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Hex0x) : null;
  }, [id?.ready, id?.kind, id?.parent, id?.safe]);


  // Keep the current subject visible to the provider (and listeners)
  useEffect(() => {
    // only once auth has hydrated
    if (!id?.ready) return;

    try {
      if (subject0x) {
        // some providers read this on mount to know "which profile" they manage
        localStorage.setItem("woco.subject0x", subject0x);

        // (optional but helpful) notify any listeners that the account changed
        // many flows used to listen to this to re-hydrate
        window.dispatchEvent(new Event("account:changed"));
      } else {
        localStorage.removeItem("woco.subject0x");
        window.dispatchEvent(new Event("account:changed"));
      }
    } catch { /* ignore */ }
  }, [id?.ready, subject0x]);


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

      // Compute once, reuse in both blocks (name + avatar)
      const subjectNo0x = subject0x.slice(2).toLowerCase();

      // (1) Save display name (optional) → topic keyed by subject
      const nameToSave = displayName.trim();
      if (nameToSave) {
        const { owner } = await postProfile({
          kind: "name",
          payload: { name: nameToSave, subject: subject0x }
        });
        setOwner0x(owner);
        // NEW: persist owner so ProfileProvider can see it on mount
        try { localStorage.setItem("woco.owner0x", owner); } catch {}

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
        // NEW
        try { localStorage.setItem("woco.owner0x", owner); } catch {}

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
        <div className="font-semibold text-gray-900 mb-2">Create / Update Profile (platform signer → per-user topics)</div>

        <form onSubmit={onSave} className="space-y-4">
          {/* Display name */}
          <div>
            <label className="block text-sm text-gray-900 mb-1">Display name</label>
            <Input
              value={displayName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
              placeholder="e.g. Nickname"
            />
          </div>

          {/* Avatar picker + preview */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-900">Avatar (optional)</label>
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
            <Button type="submit" disabled={busy || !subject0x}>
              {busy ? "Saving…" : "Save"}
            </Button>

            {saved && <span className="text-green-600 text-sm">Saved ✔</span>}
            {err && <span className="text-red-600 text-sm">Error: {err}</span>}
          </div>
          {!id?.ready && (
          <div className="text-sm text-gray-500">Checking your account…</div>
        )}

        {id?.ready && !subject0x && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm">
            No active account. Please{" "}
            <a href="/accounts" className="underline">open Accounts</a>{" "}
            to sign in (Web3) or create a local account.
          </div>
        )}
        </form>
      </div>

      {/* Read panel (renders from in-state; zero network calls here) */}
      <div className="rounded border p-4 bg-white/80">
        <div className="font-semibold text-gray-900 mb-2">Current Profile (in-state)</div>
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
