// app/page.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import LoginScreen from "@/components/auth/LoginScreen";

export default function RootGate() {
  const id = usePostingIdentity();
  const router = useRouter();
  const redirected = useRef(false);

  useEffect(() => {
    if (!id.ready || redirected.current) return;

    const canEnter =
      id.kind === "local" || (id.kind === "web3" && id.postAuth === "parent-bound");

    if (canEnter) {
      redirected.current = true;
      // soft SPA redirect is fine here; no need for ?fresh=1
      router.replace("/dashboard");
    }
  }, [id.ready, id.kind, id.postAuth, router]);

  if (!id.ready) {
    return <div className="rounded border p-4 bg-white/90">Loading…</div>;
  }

  const canEnter =
    id.kind === "local" || (id.kind === "web3" && id.postAuth === "parent-bound");

  // If signed-in, we’re about to redirect → render nothing to avoid flicker.
  // If not signed-in, show the login screen.
  return canEnter ? null : (
    <main className="mx-auto max-w-xl p-4">
      <LoginScreen />
    </main>
  );
}
