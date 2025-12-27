"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "@/config/api";

interface WalletWarningBannerProps {
  onReconnect: () => Promise<boolean>;
}

/**
 * Warning banner shown when wallet is disconnected
 * Provides options to reconnect or logout
 */
export default function WalletWarningBanner({ onReconnect }: WalletWarningBannerProps) {
  const router = useRouter();
  const [reconnecting, setReconnecting] = useState(false);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const success = await onReconnect();
      if (!success) {
        // User cancelled or wallet not available
        console.warn('[wallet] Reconnection failed or cancelled');
      }
    } finally {
      setReconnecting(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Clear local session
      localStorage.removeItem("woco.active_pk");
      localStorage.removeItem("demo_user_pk");
      localStorage.removeItem("woco.subject0x");
      localStorage.removeItem("woco.owner0x");

      // Notify server (optional, don't block on error)
      try {
        await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
      } catch {}

      // Dispatch events to notify other components
      window.dispatchEvent(new Event("admin:changed"));
      window.dispatchEvent(new Event("profile:updated"));

      // Redirect to login (use base path for Swarm deployment)
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      router.push(basePath ? `${basePath}/` : "/");
    } catch (error) {
      console.error('[wallet] Logout failed:', error);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Wallet Disconnected
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
            Your wallet is not connected. You can browse but cannot post or update your profile until you reconnect.
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 dark:bg-amber-700 text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {reconnecting ? "Connecting..." : "Reconnect Wallet"}
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-amber-600 dark:border-amber-500 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
