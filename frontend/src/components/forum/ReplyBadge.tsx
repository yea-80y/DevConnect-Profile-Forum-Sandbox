"use client";

/**
 * ReplyBadge
 * - Shows a tiny "N replies" badge for a thread.
 * - Skips fetch while the threadRef is a local optimistic key (e.g. "local:...").
 * - Uses limit=1 to avoid server edge cases with limit=0.
 * - Silences errors to keep the console clean in dev.
 */

import { useEffect, useState } from "react";
import { apiUrl } from "@/config/api";

function is64Hex(s: string): boolean {
  const x = s?.startsWith("0x") ? s.slice(2) : s;
  return /^[0-9a-fA-F]{64}$/.test(x);
}

export default function ReplyBadge({
  boardId,
  threadRef,
}: {
  boardId: string;
  threadRef: string;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // Guard: skip while optimistic (e.g. "local:...") or invalid ref
    if (!threadRef || !is64Hex(threadRef)) {
      setCount(0);
      return;
    }

    const ac = new AbortController();

    (async () => {
      try {
        const url = apiUrl(`/api/forum/thread?boardId=${encodeURIComponent(
          boardId
        )}&threadRef=${encodeURIComponent(threadRef)}&summary=1&limit=1`);
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) {
          // Keep UI calm for dev; fallback to 0
          setCount(0);
          return;
        }
        const j = await res.json().catch(() => ({}));
        // Be flexible about the shape returned by your API
        const n =
          (typeof j.total === "number" && j.total) ||
          (typeof j.count === "number" && j.count) ||
          (Array.isArray(j.posts) && j.posts.length) ||
          0;
        setCount(n);
      } catch {
        // fetch aborted or network error → default to 0
        setCount(0);
      }
    })();

    return () => ac.abort();
  }, [boardId, threadRef]);

  // Hide if zero; show only when there are replies
  if (!count) return null;

  return (
    <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-gray-100 border text-gray-900">
      {count} {count === 1 ? "reply" : "replies"}
    </span>
  );
}
