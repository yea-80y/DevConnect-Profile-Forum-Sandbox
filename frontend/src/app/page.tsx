// app/page.tsx
"use client";

import { useEffect, useRef } from "react";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import LoginScreen from "@/components/auth/LoginScreen";

export default function RootGate() {
  const id = usePostingIdentity();
  const redirected = useRef(false);

  useEffect(() => {
    if (!id.ready || redirected.current) return;

    // New logic: allow web3 users immediately after login (lazy signature loading)
    const canEnter = id.kind === "local" || id.kind === "web3";

    if (canEnter) {
      redirected.current = true;
      // Use full page navigation instead of router.replace() to avoid RSC fetch issues
      // on static export (eth.limo/Swarm). RSC navigation tries to fetch /dashboard/index.txt
      // which doesn't work correctly on static hosting.
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      window.location.href = basePath ? `${basePath}/dashboard/` : "/dashboard/";
    }
  }, [id.ready, id.kind]);

  if (!id.ready) {
    return (
      <div className="min-h-dvh bg-neutral-50 dark:bg-gray-900 transition-colors flex items-center justify-center">
        <div className="rounded border dark:border-gray-700 p-4 bg-white/90 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100">
          Loading…
        </div>
      </div>
    );
  }

  // New logic: allow web3 users immediately after login (lazy signature loading)
  const canEnter = id.kind === "local" || id.kind === "web3";

  // If signed-in, we're about to redirect → render nothing to avoid flicker.
  // If not signed-in, show the login screen.
  return canEnter ? null : (
    <main className="min-h-dvh bg-neutral-50 dark:bg-gray-900 transition-colors">
      <div className="mx-auto max-w-xl p-4">
        <LoginScreen />
      </div>
    </main>
  );
}
