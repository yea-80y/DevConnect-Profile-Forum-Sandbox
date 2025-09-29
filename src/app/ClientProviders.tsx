"use client";

/**
 * ClientProviders
 * ---------------
 * Existing goals kept exactly the same (subject/feedOwner/profileVersion).
 * Added: ultra-light Admin context that reads /api/auth/me once on mount
 * and exposes { isAdmin, address } via useMe().
 */

import { ReactNode, useEffect, useState, createContext, useContext } from "react";
import { ProfileProvider } from "@/lib/profile/context";

type HexAddr = `0x${string}` | null;

/* ──────────────────────────────────────────────────────────────────────────
   LocalStorage keys already used across screens
   ────────────────────────────────────────────────────────────────────────── */
const ACTIVE_PK_KEY = "woco.active_pk";
const LEGACY_PK_KEY = "demo_user_pk";

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

/** Get the currently selected private key from storage (if any). */
function getActivePk(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(ACTIVE_PK_KEY) ||
    localStorage.getItem(LEGACY_PK_KEY)) as `0x${string}` | null;
}

/** Lazily derive an address from a private key (keeps bundle tiny). */
async function pkToAddress(pk: `0x${string}`): Promise<`0x${string}`> {
  const { Wallet } = await import("ethers"); // v6 — lazy import for speed
  return new Wallet(pk).address as `0x${string}`;
}

export default function ClientProviders({ children }: { children: ReactNode }) {
  // subject: the current user's address (derived from stored PK)
  const [subject, setSubject] = useState<HexAddr>(null);

  // feedOwner: platform signer address (owner of the profile feed)
  const [feedOwner, setFeedOwner] = useState<HexAddr>(null);

  // profileVersion: increments whenever a profile is updated (to remount & refresh)
  const [profileVersion, setProfileVersion] = useState(0);

  // NEW: admin state from /api/auth/me (httpOnly cookie backed)
  const [me, setMe] = useState<AdminMe>({ isAdmin: false, address: null });

  /**
   * 1) Subject (user address): derive on mount and whenever the account changes.
   */
  useEffect(() => {
    let mounted = true;

    const derive = async () => {
      try {
        const pk = getActivePk();
        if (!pk) {
          if (mounted) setSubject(null);
          return;
        }
        const addr = await pkToAddress(pk);
        if (mounted) setSubject(addr);
      } catch {
        if (mounted) setSubject(null);
      }
    };

    derive(); // initial

    const onAccountChanged = () => derive();
    window.addEventListener("account:changed", onAccountChanged);

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_PK_KEY || e.key === LEGACY_PK_KEY) derive();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      window.removeEventListener("account:changed", onAccountChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /**
   * 2) Feed owner (platform signer): use cached value immediately, then refresh.
   */
  useEffect(() => {
    // fast path: preload cached owner for instant UI
    try {
      const cached = localStorage.getItem(OWNER_CACHE_KEY) as `0x${string}` | null;
      if (cached && cached.startsWith("0x")) setFeedOwner(cached);
    } catch {
      /* ignore cache errors */
    }

    // background refresh
    let alive = true;
    fetch("/api/profile")
      .then((r) => r.json() as Promise<ProfileApi>)
      .then((d) => {
        if (!alive) return;
        if (d.ok) {
          setFeedOwner(d.owner);
          try {
            localStorage.setItem(OWNER_CACHE_KEY, d.owner);
          } catch {
            /* ignore cache errors */
          }
        }
      })
      .catch(() => {
        /* ignore network errors; keep cached value */
      });

    return () => {
      alive = false;
    };
  }, []);

  /**
   * 3) Read admin session once on mount, and refresh when:
   *    - the local account changes  → "account:changed"
   *    - we explicitly dispatch an event after login/logout  → "admin:changed"
   */
  useEffect(() => {
    let alive = true;

    const loadMe = () =>
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          setMe({ isAdmin: !!j.isAdmin, address: j.address ?? null });
        })
        .catch(() => {
          if (!alive) return;
          setMe({ isAdmin: false, address: null });
        });

    loadMe(); // initial

    // Re-check admin state when account changes (useful in dev/prototype flows)
    const onAccountChanged = () => loadMe();
    const onAdminChanged = () => loadMe(); // call after login/logout
    window.addEventListener("account:changed", onAccountChanged);
    window.addEventListener("admin:changed", onAdminChanged);

    return () => {
      alive = false;
      window.removeEventListener("account:changed", onAccountChanged);
      window.removeEventListener("admin:changed", onAdminChanged);
    };
  }, []);

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
   */
  const providerKey = `${subject ?? "nosub"}|${profileVersion}`;

  return (
    // NEW: wrap the whole app with AdminCtx so components can use useMe()
    <AdminCtx.Provider value={me}>
      <ProfileProvider
        key={providerKey}
        subject={subject}
        feedOwner={feedOwner}
        beeUrl={BEE_URL}
      >
        {children}
      </ProfileProvider>
    </AdminCtx.Provider>
  );
}
