// components/auth/LoginScreen.tsx
"use client"

import { useState, useEffect } from "react";
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
 * LoginScreen (Modular Auth with Lazy Signature Loading)
 * - Web3: instant login (no signatures upfront!) - signatures requested later when needed
 * - Local: creates a local posting key (no wallet).
 *
 * IMPORTANT: we navigate immediately after login (instant access):
 *   - Web3: kind === "web3" (posting capability requested later when user posts)
 *   - Local: kind === "local"
 */
export default function LoginScreen() {
  const id = usePostingIdentity();

  // (Optional) disable buttons while login is in progress
  const [isBusy, setIsBusy] = useState(false);
  const [readyToNavigate, setReadyToNavigate] = useState(false);

  // Listen for profile load completion before navigating
  useEffect(() => {
    const handleProfileLoadStarted = () => {
      console.log("[LoginScreen] Profile load started, ready to navigate");
      setReadyToNavigate(true);
    };

    window.addEventListener("profile:load-started", handleProfileLoadStarted);
    return () => window.removeEventListener("profile:load-started", handleProfileLoadStarted);
  }, []);

  // Auto-navigate when auth state is ready AND profile load has started
  // ⚠️ MUST be before early return to satisfy Rules of Hooks
  useEffect(() => {
    // Use full page navigation to avoid RSC fetch issues on static export (eth.limo/Swarm)
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const dashboardUrl = basePath ? `${basePath}/dashboard/` : "/dashboard/";

    // Web3 & Local: navigate after profile load starts (or immediately for local)
    if (id.ready && id.kind === "local" && isBusy) {
      window.location.href = dashboardUrl;
      return;
    }

    // Web3: wait for profile load to start
    if (id.ready && id.kind === "web3" && isBusy && readyToNavigate) {
      console.log("[LoginScreen] Navigating to dashboard");
      window.location.href = dashboardUrl;
      return;
    }
  }, [id.ready, id.kind, isBusy, readyToNavigate]);

  // Keep the UI quiet while rehydrating
  if (!id.ready) {
    return <div className="rounded border p-4 bg-white/90">Loading…</div>;
  }

  // Hide buttons when we're about to navigate anyway (instant login!)
  const showButtons = !(id.kind === "local" || id.kind === "web3");

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
            📢 Recent Updates (Jan 26)
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
            Streamlined Web3 wallet connection • Zupass explorer with POD ticket upload • POD collectibles now live—create & claim limited editions
          </p>
        </div>

        <div className="text-left bg-white/90 dark:bg-gray-800/90 rounded-xl border dark:border-gray-700 p-6 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Connect with your Web3 wallet (MetaMask, Trust Wallet, etc.) or create a local account
            to experience the future of decentralised social platforms.
          </p>

          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Once connected, you can:</p>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside ml-2">
            <li>Create your profile with a custom avatar and display name</li>
            <li>Post and reply to messages on our decentralised forum</li>
            <li>Your data is stored on the Swarm Network—no centralised servers</li>
            <li>Experience true digital ownership with POD-based collectibles</li>
            <li>Your cryptographic identity is stored locally and restored automatically on return</li>
          </ul>
        </div>
      </div>

      {/* Login Buttons Section */}
      <div className="rounded-xl border dark:border-gray-700 p-6 bg-white/90 dark:bg-gray-800/90 space-y-4">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sign in</div>

        {showButtons && (
          <div className="flex flex-wrap gap-2">
            {/* WEB3 Button - Instant login (no signatures!) */}
            <Button
              disabled={isBusy}
              onClick={async () => {
                if (isBusy) return;
                setIsBusy(true);

                try {
                  await warmHandshake();

                  // Instant login - no signatures!
                  const ok = await id.startWeb3Login();
                  if (!ok) {
                    // user canceled / failed → allow another attempt
                    setIsBusy(false);
                  }
                  // ✅ Success: useEffect will handle navigation when state propagates
                } catch {
                  setIsBusy(false);
                }
              }}
            >
              {isBusy ? "Connecting…" : "Continue with Web3 (MetaMask / Wallet)"}
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

        {/* Status hint - show auth state */}
        {id.parent && (
          <div className="text-xs text-gray-700 dark:text-gray-400">
            Connected: <code>{id.parent.slice(0, 6)}…{id.parent.slice(-4)}</code>
            {id.safe && (
              <> • Safe: <code>{id.safe.slice(0, 6)}…{id.safe.slice(-4)}</code></>
            )}
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
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">🚀 Roadmap</p>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>Optimise forum performance with improved loading and caching</li>
              <li>Expand POD capabilities: event tickets, loyalty points, and achievement badges</li>
              <li>Enable Web2 access via email login for broader accessibility</li>
              <li>Add alternative authentication methods for Web3 users</li>
              <li>Launch as a Progressive Web App (PWA) for mobile installation</li>
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
