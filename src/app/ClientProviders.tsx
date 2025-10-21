"use client";

/**
 * ClientProviders
 * ---------------
 * Existing goals kept exactly the same (subject/feedOwner/profileVersion).
 * Added: ultra-light Admin context that reads /api/auth/me once on mount
 * and exposes { isAdmin, address } via useMe().
 */

import { ReactNode, useEffect, useState, createContext, useContext, useMemo } from "react";
import { ProfileProvider } from "@/lib/profile/context";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";

type HexAddr = `0x${string}` | null;

/* ──────────────────────────────────────────────────────────────────────────
   LocalStorage keys already used across screens
   ────────────────────────────────────────────────────────────────────────── */

/* Cache key for the platform signer (feed owner) so Home/UI can be instant */
const OWNER_CACHE_KEY = "woco.owner0x";

// Read from env; falls back to localhost in dev
const BEE_URL = process.env.NEXT_PUBLIC_BEE_URL || "http://localhost:1633";

/* Typed shape of /api/profile response (no `any`) */
type ProfileApiOk = { ok: true; owner: `0x${string}` };
type ProfileApiErr = { ok: false; error: string };
type ProfileApi = ProfileApiOk | ProfileApiErr;

/* ──────────────────────────────────────────────────────────────────────────
   NEW: Admin context to expose { isAdmin, address } to the whole app
   Use via: const { isAdmin, address } = useMe();
   ────────────────────────────────────────────────────────────────────────── */
type AdminMe = { isAdmin: boolean; address: `0x${string}` | null };
const AdminCtx = createContext<AdminMe>({ isAdmin: false, address: null });
export function useMe() {
  return useContext(AdminCtx);
}

export default function ClientProviders({ children }: { children: ReactNode }) {

  // feedOwner: platform signer address (owner of the profile feed)
  const [feedOwner, setFeedOwner] = useState<HexAddr>(null);

  // profileVersion: increments whenever a profile is updated (to remount & refresh)
  const [profileVersion, setProfileVersion] = useState(0);

  // NEW: admin state from /api/auth/me (httpOnly cookie backed)
  const [me, setMe] = useState<AdminMe>({ isAdmin: false, address: null });

  /**
   * 1) Subject (user address): derive on mount and whenever the account changes.
   */
 // 🔁 Single source of truth for identity
  const id = usePostingIdentity();

  // subject: parent (web3) or safe (local) — validated
  const subject = useMemo<HexAddr>(() => {
    if (!id.ready) return null;
    const addr = id.kind === "web3" ? id.parent : id.safe;
    return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
  }, [id.ready, id.kind, id.parent, id.safe]);

  // Bump when auth/account changes so ProfileProvider remounts and re-runs its cold-start refresh
  // Keep key minimal; remount only when subject or profile version changes
  const providerKey = `${subject ?? "nosub"}|${profileVersion}`;

  // Only pass a real 0x...40 addr to ProfileProvider; otherwise null
  const validFeedOwner: HexAddr =
    feedOwner && /^0x[0-9a-fA-F]{40}$/.test(feedOwner) ? feedOwner : null;


  // NEW: identityKey changes when auth flips states (e.g. logout -> login same address),
  // so the provider remounts and re-runs ensureFresh().
  // Only identity characteristics that actually define "who" the subject is.
  // Exclude postAuth or any token/nonce that can churn.
  

  // Keep the key minimal so we don't remount unnecessarily.
  // Keep key minimal; remount on subject or explicit version bumps
  

  /**
   * 2) Feed owner (platform signer): use cached value immediately, then refresh.
   */
 useEffect(() => {
  // 1) Seed from cache for everyone (local or web3)
  try {
    const cached = localStorage.getItem(OWNER_CACHE_KEY) as `0x${string}` | null;
    if (cached && cached.startsWith("0x")) {
      setFeedOwner(prev => prev ?? cached);
    }
  } catch {}

  // 2) Only platform-backed sessions should call the server for the owner
  if (!me.isAdmin) return;

  let alive = true;
  (async () => {
    try {
      const r = await fetch("/api/profile", { cache: "no-store", credentials: "same-origin" });
      const d = (await r.json()) as ProfileApi;
      if (!alive || !d?.ok || !d.owner?.startsWith?.("0x")) return;
      setFeedOwner(prev => (prev === d.owner ? prev : d.owner));
      try { localStorage.setItem(OWNER_CACHE_KEY, d.owner); } catch {}
    } catch {
      /* keep cached value */
    }
  })();

  return () => { alive = false; };
}, [me.isAdmin]);


    /**
     * 3) Read admin session and keep it fresh.
     *    Triggers:
     *      - on mount
     *      - when the account/subject changes
     *      - when "admin:changed" is dispatched (after elevate or admin logout)
     */
    useEffect(() => {
      let alive = true;
      let inFlight = false;

      const fetchMe = async () => {
        if (inFlight || !alive) return;
        inFlight = true;
        try {
          // small retry window to smooth out cookie set/clear races
          for (const delay of [0, 150, 400]) {
            try {
              if (delay) await new Promise(r => setTimeout(r, delay));
              const r = await fetch("/api/auth/me", {
                credentials: "include", // ← send & read cookies
                cache: "no-store",      // ← avoid stale cached responses
              });
              const j = await r.json().catch(() => ({}));
              if (!alive) return;
              setMe({
                isAdmin: !!j?.isAdmin,
                address: j?.address ?? null,
              });
              return; // success
            } catch {
              // try next delay
            }
          }
        } finally {
          inFlight = false;
        }
      };

      // initial fetch + whenever subject changes
      fetchMe();
      if (subject) fetchMe();

    // listen for "admin:changed" (emitted by sign-in/out buttons) and refetch
    const onAdminChanged = () => fetchMe();
    window.addEventListener("admin:changed", onAdminChanged);

    return () => {
      alive = false;
      window.removeEventListener("admin:changed", onAdminChanged);
    };
  }, [subject]);

  /**
   * 4) When a profile is saved/uploaded elsewhere, bump `profileVersion`.
   */
  useEffect(() => {
    const onUpdated = () => setProfileVersion((v) => v + 1);
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  /**
   * 5) Force a micro-remount of ProfileProvider on account switch or profile update.
   ***/

  return (
    // NEW: wrap the whole app with AdminCtx so components can use useMe()
    <AdminCtx.Provider value={me}>
      <ProfileProvider
        key={providerKey}
        subject={subject}
        feedOwner={validFeedOwner}
        beeUrl={BEE_URL}
      >
        {children}
      </ProfileProvider>
    </AdminCtx.Provider>
  );
}
