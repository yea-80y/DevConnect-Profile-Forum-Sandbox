"use client";

/**
 * Warning banner shown when PODs are saved to localStorage
 * and need to be uploaded to Swarm
 */

import { useState } from "react";
import { Button } from "../ui/button";
import { retryUpload, clearLocalPod, type LocalPodMetadata } from "@/lib/pod/api";

interface UploadWarningBannerProps {
  seriesId: string;
  metadata?: LocalPodMetadata | null;
  onSuccess?: () => void;
  onClear?: () => void;
}

export default function UploadWarningBanner({
  seriesId,
  metadata,
  onSuccess,
  onClear,
}: UploadWarningBannerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRetry = async () => {
    setIsUploading(true);
    setError("");

    try {
      const result = await retryUpload(seriesId);

      if (result.ok && result.storageStatus === "swarm") {
        onSuccess?.();
      } else {
        setError(result.error || "Upload failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    clearLocalPod(seriesId);
    onClear?.();
  };

  return (
    <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-2xl">⚠️</div>
        <div className="flex-1 space-y-2">
          <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
            Saved Locally Only
          </h3>
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            This POD collectible is currently only saved in your browser. Upload it to Swarm to make
            it permanent and accessible to others.
          </p>

          {metadata?.uploadError && (
            <p className="text-xs text-yellow-700 dark:text-yellow-300 font-mono">
              Last error: {metadata.uploadError}
            </p>
          )}

          {metadata?.retryCount && metadata.retryCount > 0 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Failed upload attempts: {metadata.retryCount}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          {!showConfirm ? (
            <div className="flex gap-2">
              <Button
                onClick={handleRetry}
                disabled={isUploading}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {isUploading ? "Uploading..." : "Upload to Swarm"}
              </Button>
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={isUploading}
                variant="secondary"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
              >
                Clear Local Data
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                ⚠️ Are you sure? This will permanently delete this POD from your browser. It cannot be recovered unless you upload it to Swarm first.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleClear}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Delete Permanently
                </Button>
                <Button
                  onClick={() => setShowConfirm(false)}
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!showConfirm && (
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              💡 Tip: Make sure your Swarm gateway is running and accessible
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
