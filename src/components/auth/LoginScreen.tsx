// components/auth/LoginScreen.tsx
"use client"

import { useState } from "react";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { Button } from "@/components/ui/button";

// Minimal EIP-1193 type so we don't use `any`
interface EIP1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>;
}

// Safe getter for window.ethereum
function getEthereum(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { ethereum?: EIP1193Provider };
  return w.ethereum;
}

// Warm up server route + wallet bridge so first-run doesn't fail
async function warmHandshake(): Promise<void> {
  const pings: Promise<void>[] = [
    // ping the serverless route you'll use right after login
    fetch("/api/profile?warm=1", { cache: "no-store" })
      .then(() => undefined)
      .catch(() => undefined),
  ];

  // Nudge the EIP-1193 provider without prompting the user
  const eth = getEthereum();
  if (eth?.request) {
    pings.push(
      eth.request({ method: "eth_chainId" })
        .then(() => undefined)
        .catch(() => undefined)
    );
    pings.push(
      eth.request({ method: "eth_accounts" })
        .then(() => undefined)
        .catch(() => undefined)
    );
  }

  // Don't block too long: race with a short timeout
  await Promise.race([
    Promise.all(pings),
    new Promise<void>(res => setTimeout(res, 250)),
  ]);
}


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


  // (Optional) disable buttons while a sign flow is in progress
  const [isBusy, setIsBusy] = useState(false);
  // NEW: track which flow is in progress (web3 only; local remains as-is)
  const [authing, setAuthing] = useState<"none" | "web3">("none");


  // (Optional) Prefetch for snappier transition

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
      
      {/* 🔸 ADD THIS BLOCK:
          Web3-only progress banner while the wallet prompt/verify runs.
          It shows after you click the Web3 button and remains visible until
          (a) the user cancels (we clear isBusy/authing), or
          (b) the hook flips postAuth → "parent-bound" and the effect navigates.
      */}
      {authing === "web3" && id.postAuth !== "parent-bound" && (
        <div className="rounded border p-3 bg-amber-50/70 text-sm" aria-live="polite">
          Authorizing… please confirm in your wallet.
        </div>
      )}

      {showButtons && (
        <div className="flex flex-wrap gap-2">
          {/* WEB3: do NOT navigate here; let the effect handle it */}
          <Button
            disabled={isBusy}
           onClick={async () => {
            if (isBusy) return;
            setIsBusy(true);
            setAuthing("web3");

            try {
                // Let the "Authorizing…" banner actually paint
                await new Promise(res => setTimeout(res, 50));

                 // 👇 bring this back
                await warmHandshake();


                // Now run the 712 flow
                const ok = await id.startWeb3Login();
               if (ok) {
                  location.replace("/dashboard?fresh=1");
                  return;
                }



                // user canceled / failed verification → allow another attempt
                setIsBusy(false);
                setAuthing("none");
            } catch {
                setIsBusy(false);
                setAuthing("none");
            }
            }}
          >
            {isBusy && authing === "web3" ? "Waiting for signature…" : "Continue with Web3 (MetaMask / Wallet)"}
          </Button>

          {/* LOCAL: same rule—let the effect navigate after hook flips to 'local' */}
          <Button
  variant="secondary"
  disabled={isBusy}
  onClick={async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const ok = await id.startLocalLogin();
      if (ok) {
        // do the same hard reload we do for web3
        location.replace("/dashboard?fresh=1");
        return;
      } else {
        setIsBusy(false);
      }
    } catch {
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
