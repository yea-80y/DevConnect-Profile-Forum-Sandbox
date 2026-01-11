"use client";

/**
 * POD Identity Setup Prompt
 * Shows before requesting POD identity signature (for creating/claiming PODs)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface PodIdentityPromptProps {
  isOpen: boolean;
  action: "create" | "claim"; // Different wording for create vs claim
  onSetup: () => Promise<void>;
  onCancel: () => void;
}

export function PodIdentityPrompt({
  isOpen,
  action,
  onSetup,
  onCancel,
}: PodIdentityPromptProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSetup = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await onSetup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setIsLoading(false);
    }
  };

  const title = action === "create" ? "Create POD Collectibles" : "Claim POD Collectible";
  const description = action === "create"
    ? "Set up your POD identity to create collectibles"
    : "Set up your POD identity to claim this collectible";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={isLoading ? undefined : onCancel}
      />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              POD Identity Setup
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          </div>
          {!isLoading && (
            <button
              onClick={onCancel}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {action === "create"
              ? "To create POD collectibles, you need to generate your unique POD identity."
              : "To claim POD collectibles, you need your unique POD identity."}
          </p>

          <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              What happens next:
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold mt-0.5">1.</span>
                <span>Your wallet will ask you to sign a message (EIP-712)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold mt-0.5">2.</span>
                <span>We'll generate your deterministic POD signing key</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold mt-0.5">3.</span>
                <span>{action === "create" ? "You can create PODs" : "You can claim this POD"}</span>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <div className="font-medium text-blue-900 dark:text-blue-300 mb-0.5">Your POD identity is portable</div>
                <div>Same wallet = same POD key across all devices. No wallet access required.</div>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30 p-3 rounded-lg">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>One-time setup. Cryptographically secure. Deterministic from your wallet.</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onCancel}
            variant="secondary"
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSetup}
            className="flex-1"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Waiting for signature...
              </span>
            ) : (
              "Generate POD Identity"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
