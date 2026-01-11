"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { Button } from "@/components/ui/button";
import {
  loadRawPodDataFromFile,
  analyzeRawPOD,
  getVerificationStatus,
  type RawPODData,
  type RawPODAnalysis
} from "@/lib/zupass/verification";

/**
 * Devcon Ticket Verification Page
 * Allows users to upload and verify their Devcon ticket POD
 */
export default function VerifyTicketPage() {
  const router = useRouter();
  const id = usePostingIdentity();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawPod, setRawPod] = useState<RawPODData | null>(null);
  const [podAnalysis, setPodAnalysis] = useState<RawPODAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is already verified
  const ethAddress = id.kind === "web3" ? id.parent : id.safe;
  const existingVerification = ethAddress ? getVerificationStatus(ethAddress) : null;

  if (!id.ready) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded border p-4 bg-white dark:bg-gray-800">
          Loading...
        </div>
      </div>
    );
  }

  if (!ethAddress) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded border p-4 bg-white dark:bg-gray-800">
          <p className="text-red-600 dark:text-red-400">Please log in first</p>
          <Button onClick={() => router.push("/")} className="mt-4">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setRawPod(null);
    setPodAnalysis(null);

    try {
      setLoading(true);
      const loadedPod = await loadRawPodDataFromFile(file);

      if (!loadedPod) {
        setError("Failed to load POD from file. Make sure it's a valid Zupass export JSON.");
        return;
      }

      setRawPod(loadedPod);

      // Analyze the POD structure
      const analysis = analyzeRawPOD(loadedPod);
      setPodAnalysis(analysis);
      console.log("[verify-ticket] POD loaded and analyzed:", analysis);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load POD";
      console.error("[verify-ticket] Error loading POD:", err);
      setError(`${errorMsg}. Check console for details.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Button onClick={() => router.push("/dashboard")} variant="secondary" className="mb-4">
          ← Back to Dashboard
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Verify Devcon Ticket
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Upload your Devcon ticket POD to verify your attendance and unlock platform features.
        </p>
      </div>

      {/* Existing Verification Status */}
      {existingVerification && (
        <div className="rounded-lg border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-4">
          <h2 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
            ✓ Already Verified
          </h2>
          <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
            <p>Ticket Type: <span className="font-mono">{existingVerification.ticketType}</span></p>
            <p>Verified: {new Date(existingVerification.verifiedAt).toLocaleString()}</p>
            <div className="mt-2 space-y-1">
              <p>✓ Can post to forum</p>
              <p>✓ Can create POD collectibles</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Upload POD File
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select your Devcon ticket POD exported from Zupass (.json file)
          </p>
        </div>

        <div>
          <label htmlFor="pod-file-upload" className="block">
            <span className="sr-only">Choose file</span>
            <input
              id="pod-file-upload"
              name="pod-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              disabled={loading}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                dark:file:bg-blue-900/30 dark:file:text-blue-300
                hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
        </div>

        {selectedFile && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Selected: <span className="font-mono">{selectedFile.name}</span>
          </div>
        )}
      </div>

      {/* POD Analysis */}
      {rawPod && podAnalysis && (
        <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            POD Analysis
          </h2>

          {/* Ticket Info (if Devcon ticket) */}
          {podAnalysis.ticketInfo && (
            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700">
              <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-2">
                Devcon Ticket Details
              </h3>
              <div className="space-y-1 text-sm text-purple-800 dark:text-purple-200">
                {podAnalysis.ticketInfo.attendeeName && (
                  <p><span className="font-medium">Attendee:</span> {podAnalysis.ticketInfo.attendeeName}</p>
                )}
                {podAnalysis.ticketInfo.ticketName && (
                  <p><span className="font-medium">Ticket:</span> {podAnalysis.ticketInfo.ticketName}</p>
                )}
                <p><span className="font-medium">Ticket ID:</span> <span className="font-mono text-xs">{podAnalysis.ticketInfo.ticketId}</span></p>
                <p><span className="font-medium">Event ID:</span> <span className="font-mono text-xs">{podAnalysis.ticketInfo.eventId}</span></p>
              </div>
            </div>
          )}

          {/* Signature & Ownership Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Signature Info */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Signature (Ed25519)
              </h3>
              <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <p>
                  <span className="font-medium">Present:</span>{" "}
                  {podAnalysis.signaturePresent ? "✓ Yes" : "✗ No"}
                </p>
                <p>
                  <span className="font-medium">Type:</span> {podAnalysis.signatureType}
                </p>
                <p className="break-all">
                  <span className="font-medium">Signer:</span>{" "}
                  <span className="font-mono text-xs">{podAnalysis.signerPublicKey}</span>
                </p>
              </div>
            </div>

            {/* Ownership Info */}
            <div className={`p-4 rounded-lg border ${
              podAnalysis.hasOwnerField
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700"
            }`}>
              <h3 className={`font-semibold mb-2 ${
                podAnalysis.hasOwnerField
                  ? "text-green-900 dark:text-green-100"
                  : "text-yellow-900 dark:text-yellow-100"
              }`}>
                Ownership
              </h3>
              <div className={`space-y-1 text-sm ${
                podAnalysis.hasOwnerField
                  ? "text-green-800 dark:text-green-200"
                  : "text-yellow-800 dark:text-yellow-200"
              }`}>
                <p>
                  <span className="font-medium">Has owner field:</span>{" "}
                  {podAnalysis.hasOwnerField ? "✓ Yes" : "✗ No"}
                </p>
                {podAnalysis.ownerFieldName && (
                  <>
                    <p>
                      <span className="font-medium">Field name:</span>{" "}
                      {podAnalysis.ownerFieldName}
                    </p>
                    <p className="break-all">
                      <span className="font-medium">Value:</span>{" "}
                      <span className="font-mono text-xs">{podAnalysis.ownerFieldValue}</span>
                    </p>
                  </>
                )}
                {!podAnalysis.hasOwnerField && (
                  <p className="text-xs mt-1">
                    No cryptographic owner binding. You can bind this ticket to your account below.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Classification
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                podAnalysis.isDevconTicket
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {podAnalysis.isDevconTicket ? "✓ Devcon Ticket" : "Not a Devcon Ticket"}
              </span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                podAnalysis.isCollectible
                  ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {podAnalysis.isCollectible ? "✓ Collectible" : "Not a Collectible"}
              </span>
              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                Type: {podAnalysis.podType}
              </span>
            </div>
          </div>

          {/* Entry Count */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Entry Count:</span>
              <span>{podAnalysis.entryCount}</span>
            </div>
          </div>

          {/* All Entries */}
          <div className="border-t dark:border-gray-700 pt-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              All Entries ({podAnalysis.entryCount})
            </h3>
            <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
              {Object.entries(podAnalysis.entries).map(([key, entry]) => (
                <div key={key} className="text-gray-700 dark:text-gray-300 break-all">
                  <span className="text-blue-600 dark:text-blue-400">{key}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">({entry.type})</span>:{" "}
                  <span className="text-green-600 dark:text-green-400">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Next Steps */}
          {podAnalysis.isDevconTicket && !podAnalysis.hasOwnerField && (
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700">
              <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">
                Next: Bind Ticket to Your Account
              </h3>
              <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
                This ticket has no cryptographic owner binding. To use it for authentication,
                you need to sign a claim that binds this ticket to your account.
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300">
                Coming soon: Sign with your Ed25519 key to claim this ticket.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-6 text-sm text-gray-600 dark:text-gray-400">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How to get your Devcon ticket POD:
        </h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open Zupass (zupass.org)</li>
          <li>Find your Devcon ticket</li>
          <li>Export as POD (JSON format)</li>
          <li>Upload the JSON file here</li>
        </ol>
      </div>
    </div>
  );
}
