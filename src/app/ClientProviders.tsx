"use client";

/**
 * ClientProviders
 * ---------------
 * Goal: ultra-lightweight app bootstrap.
 *
 * - Always render immediately (no gating "loading..." screens).
 * - Derive the active subject (user address) from a locally stored private key.
 * - Preload the platform feed owner from localStorage (fast, no flicker),
 *   then refresh it in the background via /api/profile and cache it.
 * - React instantly when:
 *     • the active account changes  → event: "account:changed"
 *     • profile data is updated     → event: "profile:updated"
 * - Force a tiny remount of ProfileProvider on (subject | profileVersion) change
 *   so downstream consumers re-hydrate without manual wiring.
 *
 * Events you should dispatch elsewhere:
 *   window.dispatchEvent(new Event("account:changed"))
 *     → after you set woco.active_pk in /account
 *
 *   window.dispatchEvent(new Event("profile:updated"))
 *     → right after a successful profile save/upload
 */

import { ReactNode, useEffect, useState } from "react";
import { ProfileProvider } from "@/lib/profile/context";

type HexAddr = `0x${string}` | null;

// LocalStorage keys we already use across screens
const ACTIVE_PK_KEY = "woco.active_pk";
const LEGACY_PK_KEY = "demo_user_pk";

// Cache key for the platform signer (feed owner) so Home/UI can be instant
const OWNER_CACHE_KEY = "woco.owner0x";

// Keep this in one place; swap to your env/config if needed
const BEE_URL = "http://bee.swarm.public.dappnode:1633";

// Typed shape of /api/profile response (no `any`)
type ProfileApiOk = { ok: true; owner: `0x${string}` };
type ProfileApiErr = { ok: false; error: string };
type ProfileApi = ProfileApiOk | ProfileApiErr;

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

  /**
   * 1) Subject (user address): derive on mount and whenever the account changes.
   *    - We listen for:
   *        - "account:changed" (explicit signal from /account page)
   *        - (Optionally) "storage" if you change localStorage from another tab
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
   *    - Prevents the “loading platform signer…” flash on Home.
   *    - After fetching, cache to localStorage for future instant loads.
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
   * 3) When a profile is saved/uploaded elsewhere, bump `profileVersion`.
   *    The provider gets a new `key`, forcing a tiny remount → fresh read downstream.
   */
  useEffect(() => {
    const onUpdated = () => setProfileVersion((v) => v + 1);
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  /**
   * 4) Force a micro-remount of ProfileProvider on account switch or profile update.
   *    This avoids wiring refresh logic in every consumer component.
   */
  const providerKey = `${subject ?? "nosub"}|${profileVersion}`;

  return (
    <ProfileProvider
      key={providerKey}
      subject={subject}
      feedOwner={feedOwner}
      beeUrl={BEE_URL}
    >
      {children}
    </ProfileProvider>
  );
}
