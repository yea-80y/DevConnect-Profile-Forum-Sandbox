// src/lib/profile/context.tsx
"use client";

// Centralized state holder for profile data.
// Flow:
//  1) Hydrate from localStorage for instant UI.
//  2) Do ONE cold-start freshness check against Swarm (ultra-light).
//  3) When tab becomes visible again, do at-most-once-per-window freshness.
//  4) Expose applyLocalUpdate() so the editor (ProfileTab) can update UI instantly after saving.
// No polling. No loops. Only updates if Swarm content actually changed.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Hex0x, ProfileRenderPack } from "./types";
import { refreshProfileFromSwarm } from "./service";

type ProfileCtx = {
  profile: ProfileRenderPack | null;
  ensureFresh: () => Promise<void>;                  // manual refresh (cheap; only updates if changed)
  applyLocalUpdate: (u: Partial<ProfileRenderPack>) => void; // editor pushes updates here after save
};

const ProfileContext = createContext<ProfileCtx | null>(null);

export function useProfile(): ProfileCtx {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within <ProfileProvider>");
  return ctx;
}

// How often we allow a visibility-based freshness check.
const VISIBILITY_REFRESH_MIN_MS = 2 * 60 * 1000; // 2 minutes; increase if you want even fewer calls.

export function ProfileProvider(props: {
  children: React.ReactNode;
  subject: Hex0x | null;
  feedOwner: Hex0x | null;
  beeUrl: string;
}) {
  const { children, subject, feedOwner, beeUrl } = props;

  // Cache key to scope persisted state to (owner, subject)
  const cacheKey = useMemo(() => (
    subject && feedOwner ? `profile:${feedOwner}:${subject}` : null
  ), [subject, feedOwner]);

  // ✅ 1) Hydrate from localStorage SYNCHRONOUSLY (lazy initialization for instant UI)
  const [profile, setProfile] = useState<ProfileRenderPack | null>(() => {
    if (!subject || !feedOwner) return null;
    const key = `profile:${feedOwner}:${subject}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ProfileRenderPack;
      // Only accept if identities match
      if (parsed?.subject === subject && parsed?.feedOwner === feedOwner) {
        return parsed;
      }
    } catch {}
    return null;
  });

  // Keep profile synced when cacheKey changes (e.g., user switches accounts)
  useEffect(() => {
    if (!cacheKey) {
      setProfile(null);
      return;
    }
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) {
        setProfile(null);
        return;
      }
      const parsed = JSON.parse(raw) as ProfileRenderPack;
      // Only accept if identities match
      if (parsed?.subject === subject && parsed?.feedOwner === feedOwner) {
        // Only update if different to avoid unnecessary re-renders
        setProfile(prev => {
          if (JSON.stringify(prev) === JSON.stringify(parsed)) return prev;
          return parsed;
        });
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    }
  }, [cacheKey, subject, feedOwner]);

  // Persist any changes to localStorage (so navigation doesn't lose the state)
  useEffect(() => {
    if (!cacheKey || !profile) return;
    try { localStorage.setItem(cacheKey, JSON.stringify(profile)); } catch {}
  }, [cacheKey, profile]);

  // Re-hydrate from localStorage when profile:updated event fires (e.g., after navigation back from edit page)
  useEffect(() => {
    if (!cacheKey) return;

    const onProfileUpdated = () => {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as ProfileRenderPack;
        if (parsed?.subject === subject && parsed?.feedOwner === feedOwner) {
          // ✅ Only update if content actually changed (prevents unnecessary re-renders)
          setProfile(prev => {
            const prevJson = JSON.stringify(prev);
            const parsedJson = JSON.stringify(parsed);
            if (prevJson === parsedJson) return prev;
            return parsed;
          });
        }
      } catch (err) {
        console.error('[ProfileProvider] Error in profile:updated handler:', err);
      }
    };

    window.addEventListener("profile:updated", onProfileUpdated);
    return () => window.removeEventListener("profile:updated", onProfileUpdated);
  }, [cacheKey, subject, feedOwner]);

  // Simple guards to avoid overlapping calls + rate limit the visibility refresh
  const loadingRef = useRef(false);
  const lastCheckRef = useRef<number>(0);

  // The only place we hit Swarm to refresh; state updates only if markers changed
  const ensureFresh = useCallback(async () => {
    if (!subject || !feedOwner) {
      return;
    }
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    try {
      const next = await refreshProfileFromSwarm({ beeUrl, feedOwner, subject, prev: profile });
      if (next && next !== profile) {
        setProfile(next); // identity check prevents useless re-renders
      }
      lastCheckRef.current = Date.now();
    } catch (error) {
      console.error("[ProfileProvider] ensureFresh error:", error);
    } finally {
      loadingRef.current = false;
    }
  }, [beeUrl, feedOwner, subject, profile]);

  // ✅ Stable ref to ensureFresh (same pattern as ProfileView) to prevent effect loops
  const ensureFreshRef = useRef(ensureFresh);
  useEffect(() => { ensureFreshRef.current = ensureFresh; }, [ensureFresh]);

  // Track if we've fetched for this subject yet (prevents duplicate fetches on same mount)
  const hasFetchedRef = useRef<string | null>(null);

  // 2) Cold-start: fetch profile when we have valid subject + feedOwner
  // OPTIMIZATION: Skip for brand new LOCAL accounts (they can't have a profile yet)
  // CRITICAL: Web3 accounts ALWAYS fetch (isNewAccount flag cleared by startWeb3Login)
  useEffect(() => {
    if (!subject || !feedOwner) {
      return;
    }

    // Skip if we've already fetched for this exact subject
    const fetchKey = `${feedOwner}:${subject}`;
    if (hasFetchedRef.current === fetchKey) {
      return;
    }

    // Check if this is a brand new LOCAL account
    // ONLY skip Swarm fetch if:
    // 1. isNewAccount flag is set (just created LOCAL account)
    // 2. NO cached profile exists (hasn't created profile yet)
    // This saves 2 unnecessary API calls on first dashboard load after LOCAL account creation
    // NOTE: Web3 login ALWAYS clears this flag, so Web3 users ALWAYS fetch from Swarm
    let shouldSkip = false;
    try {
      const isNew = localStorage.getItem("woco.isNewAccount");
      const hasCachedProfile = profile !== null; // Check in-memory state

      if (isNew === "true" && !hasCachedProfile) {
        // Clear flag so next dashboard visit WILL fetch (in case they created profile elsewhere)
        localStorage.removeItem("woco.isNewAccount");
        shouldSkip = true;
      } else if (isNew === "true" && hasCachedProfile) {
        // Profile exists in cache - user created profile, clear flag and fetch to verify
        localStorage.removeItem("woco.isNewAccount");
      }
    } catch {}

    if (shouldSkip) {
      hasFetchedRef.current = fetchKey; // Mark as "handled" so we don't retry
      return;
    }

    // Mark as fetched BEFORE starting the async operation
    hasFetchedRef.current = fetchKey;

    void ensureFreshRef.current();
  }, [subject, feedOwner, profile]);

  // 3) Visibility: at most one freshness check per VISIBILITY_REFRESH_MIN_MS
  useEffect(() => {
    if (!subject || !feedOwner) return;

    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheckRef.current < VISIBILITY_REFRESH_MIN_MS) return;
      await ensureFreshRef.current();
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, feedOwner]);


  // 4) Editor calls this after a successful save to update UI instantly (no network call needed).
  const applyLocalUpdate = useCallback((update: Partial<ProfileRenderPack>) => {
    setProfile(prev => {
      const base: ProfileRenderPack = prev ?? {
        beeUrl,
        subject: subject as Hex0x,
        feedOwner: feedOwner as Hex0x,
      };
      const next = { ...base, ...update };
      return next;
    });
  }, [beeUrl, subject, feedOwner]);

  // Drop stale profile when identity changes
  const prevIdsRef = useRef<{subject: Hex0x | null; feedOwner: Hex0x | null}>({
    subject: null,
    feedOwner: null,
  });

  useEffect(() => {
    const prev = prevIdsRef.current;

    // Reset profile in these cases:
    // 1. Logout: subject goes from valid → null
    // 2. Account switch: both were valid and changed
    const isLogout = prev.subject !== null && subject === null;
    const isAccountSwitch =
      prev.subject !== null && prev.feedOwner !== null &&
      subject !== null && feedOwner !== null &&
      (prev.subject !== subject || prev.feedOwner !== feedOwner);

    if (isLogout) {
      // Logout: clear profile immediately
      setProfile(null);
    } else if (isAccountSwitch) {
      // Account switch: clear and fetch new profile
      setProfile(null);
      void ensureFresh();
    }

    prevIdsRef.current = { subject, feedOwner };
  }, [subject, feedOwner, ensureFresh]);

  const value = useMemo<ProfileCtx>(() => ({
    profile,
    ensureFresh,
    applyLocalUpdate,
  }), [profile, ensureFresh, applyLocalUpdate]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
