// components/auth/LoginScreen.tsx
"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/config/api";
import ThemeToggle from "@/components/ThemeToggle";

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
    fetch(apiUrl("/api/profile?warm=1"), { cache: "no-store" })
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
  const router = useRouter();

  // (Optional) disable buttons while a sign flow is in progress
  const [isBusy, setIsBusy] = useState(false);
  // NEW: track which flow is in progress (web3 only; local remains as-is)
  const [authing, setAuthing] = useState<"none" | "web3">("none");

  // Auto-navigate when auth state is ready (waits for React state to propagate)
  // ⚠️ MUST be before early return to satisfy Rules of Hooks
  useEffect(() => {
    // Web3: wait for parent-bound state to confirm parent address is set
    if (id.ready && id.kind === "web3" && id.postAuth === "parent-bound" && authing === "web3") {
      router.push("/dashboard/");
      return;
    }
    // Local: navigate as soon as kind is set
    if (id.ready && id.kind === "local" && isBusy) {
      router.push("/dashboard/");
      return;
    }
  }, [id.ready, id.kind, id.postAuth, authing, isBusy, router]);

  // Keep the UI quiet while rehydrating
  if (!id.ready) {
    return <div className="rounded border p-4 bg-white/90">Loading…</div>;
  }

  // Hide buttons when we're about to navigate anyway
  const showButtons = !(
    id.kind === "local" || (id.kind === "web3" && id.postAuth === "parent-bound")
  );

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Dark mode toggle - top right */}
      <div className="flex justify-end mb-4">
        <ThemeToggle />
      </div>

      {/* Hero Section with Logo */}
      <div className="text-center space-y-4">
        <div className="flex justify-center mb-6">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.png`}
            unoptimized
            alt="WoCo Logo"
            width={200}
            height={200}
            priority
            className="rounded-lg"
          />
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
          Welcome to WoCo — The World Computer
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-300 font-medium">
          Privacy-First, Peer-to-Peer Infrastructure for the Open Web
        </p>

        {/* Recent Updates Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            📢 Recent Updates (Dec 25)
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
            POD collectibles now live - create & claim limited editions • Dark mode with preference saving • Enhanced Swarm verification
          </p>
        </div>

        <div className="text-left bg-white/90 dark:bg-gray-800/90 rounded-xl border dark:border-gray-700 p-6 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Connect with your Web3 wallet (MetaMask, Trust Wallet, etc.) or create a new account
            to experience the future of decentralized social platforms.
          </p>

          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Once connected, you can:</p>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside ml-2">
            <li>Create your profile with a custom avatar and display name</li>
            <li>Post and reply to messages on our decentralised forum</li>
            <li>Your data is stored on the Swarm Network—no centralised servers</li>
            <li>Experience true digital ownership with POD based collectibles</li>
          </ul>
        </div>
      </div>

      {/* Login Buttons Section */}
      <div className="rounded-xl border dark:border-gray-700 p-6 bg-white/90 dark:bg-gray-800/90 space-y-4">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sign in</div>

        {/* Web3-only progress banner */}
        {authing === "web3" && id.postAuth !== "parent-bound" && (
          <div className="rounded border dark:border-amber-700 p-3 bg-amber-50/70 dark:bg-amber-900/30 text-sm dark:text-amber-100" aria-live="polite">
            Authorizing… please confirm in your wallet.
          </div>
        )}

        {showButtons && (
          <div className="flex flex-wrap gap-2">
            {/* WEB3 Button */}
            <Button
              disabled={isBusy}
              onClick={async () => {
                if (isBusy) return;
                setIsBusy(true);
                setAuthing("web3");

                try {
                  // Let the "Authorizing…" banner actually paint
                  await new Promise(res => setTimeout(res, 50));
                  await warmHandshake();

                  // Now run the 712 flow
                  const ok = await id.startWeb3Login();
                  if (!ok) {
                    // user canceled / failed verification → allow another attempt
                    setIsBusy(false);
                    setAuthing("none");
                  }
                  // ✅ Success: useEffect will handle navigation when state propagates
                } catch {
                  setIsBusy(false);
                  setAuthing("none");
                }
              }}
            >
              {isBusy && authing === "web3" ? "Waiting for signature…" : "Continue with Web3 (MetaMask / Wallet)"}
            </Button>

            {/* LOCAL Button */}
            <Button
              variant="secondary"
              disabled={isBusy}
              onClick={async () => {
                if (isBusy) return;
                setIsBusy(true);
                try {
                  const ok = await id.startLocalLogin();
                  if (!ok) {
                    setIsBusy(false);
                  }
                  // ✅ Success: useEffect will handle navigation when state propagates
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
          <div className="text-xs text-gray-700 dark:text-gray-400">
            Posting key ready at <code>{id.safe.slice(0, 6)}…{id.safe.slice(-4)}</code>
            {id.kind === "web3" && id.postAuth === "parent-bound" ? " (parent-bound)" : ""}
          </div>
        )}
      </div>

      {/* Technology & Vision Section */}
      <div className="bg-white/90 dark:bg-gray-800/90 rounded-xl border dark:border-gray-700 p-6 space-y-6 text-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">🦾 Built on Decentralized Infrastructure</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            WoCo harnesses Swarm Network for distributed storage and Ethereum standards (EIP-712/EIP-191)
            for secure, cryptographic authentication. Every post, profile, and piece of content lives on a
            peer-to-peer network—not corporate servers.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            This prototype demonstrates how privacy-focused, censorship-resistant platforms can be built
            on Web3 infrastructure, putting users in control of their data and identity. The goal isn&apos;t
            just decentralization for its own sake—it&apos;s about building tools that shift ownership and
            value back to communities, disrupting extractive centralized marketplaces.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">🎯 Our Mission</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            WoCo aims to prove that peer-to-peer and zero-knowledge technologies can fundamentally change
            how people interact online. We&apos;re building open-source tools—not empires—governed by the
            principle of &quot;by the community, for the community.&quot;
          </p>

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">🚀 Next Steps</p>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>Enhance forum with improved loading, caching, and rendering performance.</li>
              <li>Expand POD capabilities: event tickets, loyalty points, and achievement badges.</li>
              <li>Enable simple Web2 access through an email login option.</li>
              <li>Support additional authentication options for Web3 users.</li>
            </ul>
          </div>

          <div className="pt-4 border-t dark:border-gray-700 space-y-2">
            <a
              href="https://github.com/yea-80y/DevConnect-Profile-Forum-Sandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline block"
            >
              📚 Learn more on GitHub
            </a>

            <a
              href="https://discord.gg/tPxAK5WHcb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 underline"
            >
              <Image
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/discord-icon.svg`}
                unoptimized
                alt="Discord"
                width={43}
                height={43}
                className="inline-block"
              />
              <span>🐛 Please report bugs on our Discord</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
