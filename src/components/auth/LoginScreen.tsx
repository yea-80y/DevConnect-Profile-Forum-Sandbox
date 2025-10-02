// components/auth/LoginScreen.tsx
"use client"

import { useEffect, useRef, useState } from "react";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

/**
 * LoginScreen
 * - Web3: clicking the button triggers the EIP-712 capability flow.
 * - Local: creates a local posting key (no wallet).
 *
 * IMPORTANT: we only navigate once the hook reports auth is usable:
 *   - Web3: postAuth === "parent-bound"
 *   - Local: kind === "local"
 */
export default function LoginScreen() {
  const id = usePostingIdentity();
  const router = useRouter();

  // Prevent double navigation in React 18 StrictMode (dev)
  const navigatedRef = useRef(false);

  // (Optional) disable buttons while a sign flow is in progress
  const [isBusy, setIsBusy] = useState(false);

  // ✅ Navigate only after auth is actually ready & usable
  useEffect(() => {
    if (!id.ready) return;

    const canEnter =
      id.kind === "local" || (id.kind === "web3" && id.postAuth === "parent-bound");

    if (canEnter && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace("/dashboard");
    }
  }, [id.ready, id.kind, id.postAuth, router]);

  // (Optional) Prefetch for snappier transition
  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  // Keep the UI quiet while rehydrating
  if (!id.ready) {
    return <div className="rounded border p-4 bg-white/90">Loading…</div>;
  }

  // Hide buttons when we’re about to navigate anyway
  const showButtons = !(
    id.kind === "local" || (id.kind === "web3" && id.postAuth === "parent-bound")
  );

  return (
    <div className="rounded border p-4 bg-white/90 space-y-4">
      <div className="text-sm font-semibold">Sign in</div>

      {showButtons && (
        <div className="flex flex-wrap gap-2">
          {/* WEB3: do NOT navigate here; let the effect handle it */}
          <Button
            disabled={isBusy}
            onClick={async () => {
              if (isBusy) return;
              setIsBusy(true);
              try {
                await id.startWeb3Login(); // triggers EIP-712 flow
                // ❌ no router.replace here
              } catch {
                // user cancelled or error
              } finally {
                setIsBusy(false);
              }
            }}
          >
            {isBusy ? "Waiting for signature…" : "Continue with Web3 (MetaMask / Wallet)"}
          </Button>

          {/* LOCAL: same rule—let the effect navigate after hook flips to 'local' */}
          <Button
            variant="secondary"
            disabled={isBusy}
            onClick={async () => {
              if (isBusy) return;
              setIsBusy(true);
              try {
                await id.startLocalLogin();
                // ❌ no router.replace here
              } catch {
                // unexpected error
              } finally {
                setIsBusy(false);
              }
            }}
          >
            Continue without a wallet
          </Button>
        </div>
      )}

      {/* Tiny status hint (optional) */}
      {id.safe && (
        <div className="text-xs text-muted-foreground">
          Posting key ready at <code>{id.safe.slice(0, 6)}…{id.safe.slice(-4)}</code>
          {id.kind === "web3" && id.postAuth === "parent-bound" ? " (parent-bound)" : ""}
        </div>
      )}
    </div>
  );
}
