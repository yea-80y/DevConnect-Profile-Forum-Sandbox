"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { Button } from "@/components/ui/button";
import {
  connectToZupass,
  disconnectFromZupass,
  fetchUserPods,
  fetchDevconTickets,
  isConnected,
  getUserIdentity,
  analyzePodOwnership,
  type PODData,
} from "@/lib/zupass/parcnet-connection";
import {
  authenticateWithDevconTicket,
  authenticateWithExampleTicket,
  getZuAuthSession,
  clearZuAuthSession,
  hasZuAuthSession,
  type ZuAuthSession,
} from "@/lib/zupass/zuauth";
import type { ParcnetAPI } from "@parcnet-js/app-connector";

/**
 * Zupass POD Explorer
 * Connect to Zupass and explore POD structure to understand ownership model
 */
export default function ZupassExplorerPage() {
  const router = useRouter();
  const id = usePostingIdentity();

  const [connected, setConnected] = useState(false);
  const [parcnetAPI, setParcnetAPI] = useState<ParcnetAPI | null>(null);
  const [pods, setPods] = useState<PODData[]>([]);
  const [selectedPod, setSelectedPod] = useState<PODData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userIdentity, setUserIdentity] = useState<string | null>(null);

  // ZuAuth state
  const [zuAuthSession, setZuAuthSession] = useState<ZuAuthSession | null>(null);
  const [zuAuthLoading, setZuAuthLoading] = useState(false);

  const ethAddress = id.kind === "web3" ? id.parent : id.safe;

  // Container ref - we'll create the actual container outside React's control
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zupassContainerRef = useRef<HTMLDivElement | null>(null);

  // Create a container outside React's control for the Parcnet SDK
  useEffect(() => {
    // Create container element outside React's virtual DOM
    const container = document.createElement("div");
    container.id = "zupass-sdk-container";
    container.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; pointer-events: none;";
    document.body.appendChild(container);
    zupassContainerRef.current = container;

    console.log("[zupass-explorer] Created external container for Parcnet SDK");

    return () => {
      // Clean up on unmount
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      zupassContainerRef.current = null;
    };
  }, []);

  // Load existing ZuAuth session on mount
  useEffect(() => {
    const session = getZuAuthSession();
    if (session) {
      setZuAuthSession(session);
      console.log("[zupass-explorer] Loaded existing ZuAuth session:", session);
    }
  }, []);

  // Debug: Watch for dialog elements - only log once initially
  useEffect(() => {
    if (!loading) return;

    // Check once after a short delay
    const timeoutId = setTimeout(() => {
      const dialogs = document.querySelectorAll("dialog");
      const iframes = document.querySelectorAll("iframe");
      console.log("[zupass-explorer] DOM state - dialogs:", dialogs.length, "iframes:", iframes.length);

      dialogs.forEach((dialog, i) => {
        if (!dialog.open) {
          console.log("[zupass-explorer] Opening closed dialog");
          try {
            dialog.showModal();
          } catch {
            try { dialog.show(); } catch { /* ignore */ }
          }
        }
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [loading]);

  if (!id.ready) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded border p-4 bg-white dark:bg-gray-800">
          Loading...
        </div>
      </div>
    );
  }

  if (!ethAddress) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded border p-4 bg-white dark:bg-gray-800">
          <p className="text-red-600 dark:text-red-400">Please log in first</p>
          <Button onClick={() => router.push("/")} className="mt-4">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  const handleConnect = async () => {
    if (!zupassContainerRef.current) {
      setError("Container element not ready - please refresh the page");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Enable pointer events on container during connection
      zupassContainerRef.current.style.pointerEvents = "auto";

      console.log("[zupass-explorer] Starting Zupass connection...");
      console.log("[zupass-explorer] Container:", zupassContainerRef.current);

      const result = await connectToZupass(zupassContainerRef.current);

      console.log("[zupass-explorer] Connection result:", result);

      if (!result.success) {
        setError(result.error || "Failed to connect");
        return;
      }

      setConnected(true);
      setParcnetAPI(result.api || null);
      console.log("[zupass-explorer] Connected successfully!");

      // Get user identity
      if (result.api) {
        const identity = await getUserIdentity();
        setUserIdentity(identity || null);
        console.log("[zupass-explorer] User identity:", identity);
      }
    } catch (err) {
      console.error("[zupass-explorer] Connection error:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
      // Disable pointer events when done
      if (zupassContainerRef.current) {
        zupassContainerRef.current.style.pointerEvents = "none";
      }
    }
  };

  const handleDisconnect = () => {
    disconnectFromZupass();
    setConnected(false);
    setParcnetAPI(null);
    setPods([]);
    setSelectedPod(null);
    setUserIdentity(null);

    // Clean up any remaining dialogs/iframes in the container
    if (zupassContainerRef.current) {
      zupassContainerRef.current.innerHTML = "";
    }

    // Also close any open dialogs
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      (dialog as HTMLDialogElement).close();
    });
  };

  const handleFetchAllPods = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await fetchUserPods();

      if (!result.success) {
        setError(result.error || "Failed to fetch PODs");
        return;
      }

      setPods(result.pods || []);
      console.log(`[zupass-explorer] Loaded ${result.pods?.length || 0} PODs`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PODs");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchDevconTickets = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await fetchDevconTickets();

      if (!result.success) {
        setError(result.error || "Failed to fetch tickets");
        return;
      }

      setPods(result.tickets || []);
      console.log(`[zupass-explorer] Loaded ${result.tickets?.length || 0} Devcon tickets`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tickets");
    } finally {
      setLoading(false);
    }
  };

  // ZuAuth handlers
  const handleZuAuthDevcon = async () => {
    try {
      setZuAuthLoading(true);
      setError(null);

      console.log("[zupass-explorer] Starting ZuAuth Devcon authentication...");
      const result = await authenticateWithDevconTicket();

      if (result.success) {
        setZuAuthSession(getZuAuthSession());
        console.log("[zupass-explorer] ZuAuth successful:", result.ticketData);
      } else {
        setError(result.error || "ZuAuth failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZuAuth failed");
    } finally {
      setZuAuthLoading(false);
    }
  };

  const handleZuAuthExample = async () => {
    try {
      setZuAuthLoading(true);
      setError(null);

      console.log("[zupass-explorer] Starting ZuAuth with example ticket...");
      const result = await authenticateWithExampleTicket();

      if (result.success) {
        setZuAuthSession(getZuAuthSession());
        console.log("[zupass-explorer] ZuAuth successful:", result.ticketData);
      } else {
        setError(result.error || "ZuAuth failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZuAuth failed");
    } finally {
      setZuAuthLoading(false);
    }
  };

  const handleZuAuthLogout = () => {
    clearZuAuthSession();
    setZuAuthSession(null);
    console.log("[zupass-explorer] ZuAuth session cleared");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Button onClick={() => router.push("/dashboard")} variant="secondary" className="mb-4">
          ← Back to Dashboard
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Zupass POD Explorer
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Connect to your Zupass account to explore POD structure and ownership model.
        </p>
      </div>

      {/* Connection Section */}
      <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Zupass Connection
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect to your Zupass account to access your PODs.
          </p>
        </div>

        {/* Loading indicator - Zupass uses a dialog modal */}
        {loading && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-600"></div>
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                Waiting for Zupass authentication...
              </p>
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">In the Zupass dialog:</p>
              <ol className="list-decimal list-inside ml-2 space-y-0.5">
                <li>Log in to your Zupass account (if not already)</li>
                <li><strong>Look for WoCo permission request</strong></li>
                <li>Click "Connect" or "Approve" to grant access</li>
                <li>Dialog will close automatically after approval</li>
              </ol>
              <p className="mt-2 pt-2 border-t border-amber-300 dark:border-amber-600">
                If you navigated away from the permission screen, close and try again.
              </p>
            </div>
            <Button
              onClick={() => {
                // Close dialog and cancel connection
                document.querySelectorAll("dialog[open]").forEach((dialog) => {
                  (dialog as HTMLDialogElement).close();
                });
                if (zupassContainerRef.current) {
                  zupassContainerRef.current.innerHTML = "";
                }
                setLoading(false);
                setError("Connection cancelled. Click 'Connect to Zupass' to try again.");
              }}
              variant="secondary"
              className="mt-3 w-full"
            >
              Close Zupass Dialog
            </Button>
          </div>
        )}

        {/* Status indicator */}
        {!loading && !connected && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border dark:border-gray-600 rounded-lg text-center text-gray-500 dark:text-gray-400 text-sm">
            Click "Connect to Zupass" to begin authentication
          </div>
        )}

        {!connected ? (
          <Button onClick={handleConnect} disabled={loading} className="w-full">
            {loading ? "Connecting... (check for Zupass popup)" : "Connect to Zupass"}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4">
              <p className="text-green-900 dark:text-green-100 font-semibold mb-2">
                ✓ Connected to Zupass
              </p>
              {userIdentity && (
                <p className="text-xs font-mono text-green-800 dark:text-green-200">
                  Identity: {userIdentity.slice(0, 16)}...
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleFetchAllPods} disabled={loading} className="flex-1">
                {loading ? "Loading..." : "Fetch All PODs"}
              </Button>
              <Button onClick={handleFetchDevconTickets} disabled={loading} className="flex-1">
                {loading ? "Loading..." : "Fetch Devcon Tickets"}
              </Button>
              <Button onClick={handleDisconnect} variant="secondary">
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ZuAuth Section - Popup-based authentication */}
      <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            ZuAuth - Ticket Authentication
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Authenticate by proving you own a ticket (uses popup, more reliable than Parcnet SDK).
          </p>
        </div>

        {zuAuthSession ? (
          <div className="space-y-4">
            <div className="rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4">
              <p className="text-green-900 dark:text-green-100 font-semibold mb-2">
                Authenticated with Zupass
              </p>
              <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
                {zuAuthSession.ticketData.attendeeName && (
                  <p>Name: {zuAuthSession.ticketData.attendeeName}</p>
                )}
                {zuAuthSession.ticketData.attendeeEmail && (
                  <p>Email: {zuAuthSession.ticketData.attendeeEmail}</p>
                )}
                {zuAuthSession.ticketData.eventId && (
                  <p className="font-mono text-xs">Event: {zuAuthSession.ticketData.eventId}</p>
                )}
                <p className="text-xs mt-2 pt-2 border-t border-green-200 dark:border-green-700">
                  Authenticated: {new Date(zuAuthSession.authenticatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <Button onClick={handleZuAuthLogout} variant="secondary" className="w-full">
              Clear ZuAuth Session
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handleZuAuthExample}
              disabled={zuAuthLoading}
              className="w-full"
            >
              {zuAuthLoading ? "Opening Zupass..." : "Authenticate with Example Ticket"}
            </Button>
            <Button
              onClick={handleZuAuthDevcon}
              disabled={zuAuthLoading}
              variant="secondary"
              className="w-full"
            >
              {zuAuthLoading ? "Opening Zupass..." : "Authenticate with Devcon Ticket"}
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Opens a popup where you prove ticket ownership via ZK proof
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              For Example Ticket: Subscribe to the feed in Zupass first<br/>
              <a
                href="https://api.zupass.org/generic-issuance/api/feed/e5c41360-3a46-458e-9e12-41c807f9e77e/0"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Click to subscribe to Example Ticket feed
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* PODs List */}
      {pods.length > 0 && (
        <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            PODs ({pods.length})
          </h2>

          <div className="space-y-2">
            {pods.map((podData, idx) => {
              const data = podData as any;
              const pod = data.pod;
              const entries = pod ? Object.entries(pod.content.asEntries()) : [];

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedPod(podData)}
                  className={`w-full text-left p-4 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${
                    selectedPod === podData ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600" : ""
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      POD {idx + 1}
                    </p>
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-500">
                      {data.id?.slice(0, 8)}...
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Type: {data.type || "unknown"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {entries.length} entries
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected POD Details */}
      {selectedPod && (selectedPod as any).pod && (() => {
        const podData = selectedPod as any;
        const pod = podData.pod;
        return (
          <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              POD Details
            </h2>

            {/* Ownership Analysis */}
            <div className="rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Ownership Analysis
              </h3>
              {(() => {
                const analysis = analyzePodOwnership(selectedPod);
                return (
                  <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                    <p>
                      <span className="font-medium">Issuer signature:</span>{" "}
                      {analysis.hasIssuerSignature ? "✓ Yes" : "✗ No"}
                    </p>
                    <p>
                      <span className="font-medium">Owner signature:</span>{" "}
                      {analysis.hasOwnerSignature ? "✓ Yes" : "✗ No"}
                    </p>
                    {analysis.issuerPublicKey && (
                      <p className="font-mono text-xs break-all">
                        Issuer: {analysis.issuerPublicKey.slice(0, 32)}...
                      </p>
                    )}
                    {analysis.ownerPublicKey && (
                      <p className="font-mono text-xs break-all">
                        Owner: {analysis.ownerPublicKey.slice(0, 32)}...
                      </p>
                    )}
                    {analysis.ownershipFields.length > 0 && (
                      <p>
                        <span className="font-medium">Ownership fields:</span>{" "}
                        {analysis.ownershipFields.join(", ")}
                      </p>
                    )}
                    <p className="pt-2 border-t border-blue-200 dark:border-blue-700">
                      {analysis.analysis}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* POD Metadata */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Content ID:</span>
                <span className="font-mono text-xs">
                  {pod.contentID.toString().slice(0, 16)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Signer:</span>
                <span className="font-mono text-xs">
                  {pod.signerPublicKey.slice(0, 16)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Type:</span>
                <span>{podData.type || "unknown"}</span>
              </div>
            </div>

            {/* POD Entries */}
            <div className="border-t dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Entries ({Object.keys(pod.content.asEntries()).length})
              </h3>
              <div className="space-y-1 text-sm font-mono max-h-96 overflow-y-auto">
                {Object.entries(pod.content.asEntries()).map(([key, entry]) => (
                  <div key={key} className="text-gray-700 dark:text-gray-300 break-all">
                    <span className="text-blue-600 dark:text-blue-400">{key}</span>:{" "}
                    <span className="text-green-600 dark:text-green-400">
                      {String((entry as any).value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw POD JSON */}
            <div className="border-t dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Raw POD (JSON)
              </h3>
              <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded overflow-auto max-h-96 font-mono">
                {JSON.stringify(pod.toJSON(), null, 2)}
              </pre>
            </div>
          </div>
        );
      })()}

      {/* Instructions */}
      <div className="rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-6 text-sm text-gray-600 dark:text-gray-400">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          What we're looking for:
        </h3>
        <ul className="list-disc list-inside space-y-1">
          <li>How are Devcon tickets signed? (Issuer only or also attendee?)</li>
          <li>What fields indicate ownership? (email, pubkey, etc.)</li>
          <li>Can we prove ownership without importing to WoCo?</li>
          <li>Do we need to sign PODs with WoCo's Ed25519 key?</li>
        </ul>
      </div>
    </div>
  );
}
