/**
 * ZupassLinkButton
 * Post-login feature to link Zupass account and verify Devcon ticket
 *
 * This is NOT a login method - user must already be logged in with Ethereum wallet
 * Zupass provides optional credential verification (Devcon ticket POD) for access control
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import usePostingIdentity from "@/lib/auth/usePostingIdentity";
import { connectZupass } from "@/lib/zupass/connection";
import { verifyDevconTicket, hasDevconAccess } from "@/lib/zupass/verification";
import type { POD } from "@pcd/pod";

interface ZupassLinkButtonProps {
  variant?: "default" | "secondary";
  showStatus?: boolean;
}

export default function ZupassLinkButton({
  variant = "secondary",
  showStatus = true,
}: ZupassLinkButtonProps) {
  const id = usePostingIdentity();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has already verified Devcon ticket
  const hasAccess = id.parent ? hasDevconAccess(id.parent) : false;

  const handleConnect = async () => {
    if (!id.parent) {
      setError("Please log in first");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Step 1: Connect to Zupass
      const connection = await connectZupass();

      if (!connection.connected) {
        setError("Failed to connect to Zupass");
        return;
      }

      // Step 2: Request Devcon ticket POD
      // TODO: Implement when Zupass API is ready
      // For now, show placeholder message
      setError("Zupass integration coming soon - API setup pending");

      // Future implementation:
      // const ticketPOD = await requestPodFromZupass("devcon-ticket");
      // if (!ticketPOD) {
      //   setError("No Devcon ticket found in your Zupass");
      //   return;
      // }

      // Step 3: User signs challenge to bind ticket to Ethereum address
      // const challengeMessage = createBindingMessage(ticketId, id.parent);
      // const signature = await id.signPost(challengeMessage);

      // Step 4: Verify ticket and bind to address
      // const result = await verifyDevconTicket(ticketPOD, id.parent, signature);
      // if (!result.valid) {
      //   setError(result.error || "Verification failed");
      //   return;
      // }

      // Success!
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  // Not logged in - don't show
  if (!id.parent) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        onClick={handleConnect}
        disabled={isConnecting || hasAccess}
      >
        {isConnecting
          ? "Connecting to Zupass..."
          : hasAccess
          ? "✓ Devcon Ticket Verified"
          : "Link Zupass Account"}
      </Button>

      {showStatus && hasAccess && (
        <div className="text-xs text-green-600 dark:text-green-400">
          Access granted - Devcon attendee verified
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {showStatus && !hasAccess && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Optional: Link your Zupass to verify Devcon ticket ownership
        </div>
      )}
    </div>
  );
}
