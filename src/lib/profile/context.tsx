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

  const [profile, setProfile] = useState<ProfileRenderPack | null>(null);

  // Cache key to scope persisted state to (owner, subject)
  const cacheKey = useMemo(() => (
    subject && feedOwner ? `profile:${feedOwner}:${subject}` : null
  ), [subject, feedOwner]);

  // 1) Hydrate from localStorage quickly
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
        setProfile(parsed);
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

  // Simple guards to avoid overlapping calls + rate limit the visibility refresh
  const loadingRef = useRef(false);
  const lastCheckRef = useRef<number>(0);

  // The only place we hit Swarm to refresh; state updates only if markers changed
  const ensureFresh = useCallback(async () => {
    if (!subject || !feedOwner) return;
    if (loadingRef.current) return; // prevent overlaps
    loadingRef.current = true;
    try {
      const next = await refreshProfileFromSwarm({ beeUrl, feedOwner, subject, prev: profile });
      if (next && next !== profile) setProfile(next); // identity check prevents useless re-renders
      lastCheckRef.current = Date.now();
    } finally {
      loadingRef.current = false;
    }
  }, [beeUrl, feedOwner, subject, profile]);

  // 2) Cold-start: one-shot freshness after hydration
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!subject || !feedOwner) return;
      await ensureFresh();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [subject, feedOwner, ensureFresh]);

  // 3) Visibility: at most one freshness check per VISIBILITY_REFRESH_MIN_MS
  useEffect(() => {
    if (!subject || !feedOwner) return;

    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheckRef.current < VISIBILITY_REFRESH_MIN_MS) return;
      await ensureFresh();
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [subject, feedOwner, ensureFresh]);

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

  const value = useMemo<ProfileCtx>(() => ({
    profile,
    ensureFresh,
    applyLocalUpdate,
  }), [profile, ensureFresh, applyLocalUpdate]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
