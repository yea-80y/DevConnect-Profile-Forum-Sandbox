"use client";

/**
 * Wallet Selection Modal
 * Choose between MetaMask/standard wallets or Para wallet (email-based)
 */

import { Button } from "@/components/ui/button";

interface WalletSelectorProps {
  isOpen: boolean;
  onSelectMetaMask: () => void;
  onSelectPara: () => void;
  onCancel: () => void;
}

export function WalletSelector({
  isOpen,
  onSelectMetaMask,
  onSelectPara,
  onCancel,
}: WalletSelectorProps) {
  if (!isOpen) return null;

  const hasMetaMask = typeof window !== "undefined" && !!(window as any).ethereum;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Connect Wallet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose how you'd like to sign in
          </p>
        </div>

        <div className="space-y-3">
          {/* MetaMask/Standard Wallet Option */}
          <button
            onClick={onSelectMetaMask}
            className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition group"
          >
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
              {/* MetaMask fox icon */}
              <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none">
                <path d="M36.5 4L22.5 14.5L25 9L36.5 4Z" fill="#E17726"/>
                <path d="M3.5 4L17.3 14.6L15 9L3.5 4Z" fill="#E27625"/>
                <path d="M31 27.5L27.5 33.5L35.5 35.5L37.5 27.6L31 27.5Z" fill="#E27625"/>
                <path d="M2.5 27.6L4.5 35.5L12.5 33.5L9 27.5L2.5 27.6Z" fill="#E27625"/>
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-gray-900 dark:text-white">
                {hasMetaMask ? "MetaMask" : "Browser Wallet"}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {hasMetaMask
                  ? "Connect with your MetaMask wallet"
                  : "Connect with your crypto wallet"}
              </div>
            </div>
            {!hasMetaMask && (
              <span className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded">
                Not detected
              </span>
            )}
          </button>

          {/* Para Wallet Option (Email-based) */}
          <button
            onClick={onSelectPara}
            className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition group"
          >
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                Para Wallet
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Create account with email (no wallet needed)
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={onCancel}
            variant="secondary"
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
