/**
 * ZuAuth - Zupass Ticket Authentication
 * Authenticate users by proving they own a Devcon ticket
 *
 * Uses @pcd/zuauth for popup-based proof generation
 */

import { zuAuthPopup, type ZuAuthArgs } from "@pcd/zuauth";

/**
 * Devcon 7 ticket configuration
 * These values identify valid Devcon tickets
 *
 * The EdDSA public key format is [string, string] - two hex strings
 * representing the x and y coordinates of the public key point.
 *
 * TODO: Get official Devcon 7 public keys from Zupass team
 * The base64 key "YwahfUdUYehkGMaWh0+q3F8itx2h8mybjPmt8CmTJSs" needs to be
 * converted to the EdDSA format or obtained directly from Zupass/Devcon team.
 */
export const DEVCON_TICKET_CONFIG = {
  pcdType: "eddsa-ticket-pcd" as const,
  // TODO: Replace with actual Devcon 7 public keys (EdDSA format)
  // These are placeholder values - need real keys from Zupass team
  publicKey: [
    "05e0c4e8517758f65ad76e3e066a4bc4e083e9707f8adcf3bfc0ee0e0b7dc612",
    "0a7f3c3e1e4e9c1b0e5d6c7b8a9e0f1d2c3b4a5e6f7d8c9b0a1e2f3d4c5b6a7e"
  ] as [string, string],
  eventId: "5074edf5-f079-4099-b036-22223c0c6995",
  eventName: "Devcon 7",
  productName: "Devcon Ticket",
};

/**
 * Result of ZuAuth authentication
 */
export interface ZuAuthResult {
  success: boolean;
  // The PCD proof string (if successful)
  pcdStr?: string;
  // Revealed ticket data
  ticketData?: {
    attendeeEmail?: string;
    attendeeName?: string;
    eventId?: string;
    productId?: string;
    ticketId?: string;
  };
  // Error message (if failed)
  error?: string;
  // Error type
  errorType?: "popupClosed" | "popupBlocked" | "proofFailed" | "unknown";
}

/**
 * Storage key for ZuAuth session
 */
const ZUAUTH_SESSION_KEY = "woco:zuauth:session";

/**
 * Stored ZuAuth session
 */
export interface ZuAuthSession {
  // The proof that was generated
  pcdStr: string;
  // Revealed ticket data
  ticketData: {
    attendeeEmail?: string;
    attendeeName?: string;
    eventId?: string;
  };
  // Timestamp when authenticated
  authenticatedAt: string;
  // Watermark used (for verification)
  watermark: string;
}

/**
 * Get stored ZuAuth session
 */
export function getZuAuthSession(): ZuAuthSession | null {
  try {
    const stored = localStorage.getItem(ZUAUTH_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Store ZuAuth session
 */
function storeZuAuthSession(session: ZuAuthSession): void {
  localStorage.setItem(ZUAUTH_SESSION_KEY, JSON.stringify(session));
}

/**
 * Clear ZuAuth session
 */
export function clearZuAuthSession(): void {
  localStorage.removeItem(ZUAUTH_SESSION_KEY);
}

/**
 * Check if user has active ZuAuth session
 */
export function hasZuAuthSession(): boolean {
  return getZuAuthSession() !== null;
}

/**
 * Generate a watermark for the authentication
 * This is included in the proof and can be verified later
 */
function generateWatermark(): bigint {
  // Use timestamp + random value for uniqueness
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return BigInt(`${timestamp}${random}`);
}

/**
 * Authenticate with Zupass using a Devcon ticket
 * Opens a popup where user proves they own a valid Devcon ticket
 */
export async function authenticateWithDevconTicket(): Promise<ZuAuthResult> {
  try {
    const watermark = generateWatermark();

    console.log("[zuauth] Starting Devcon ticket authentication...");
    console.log("[zuauth] Watermark:", watermark.toString());

    // Configure what fields to reveal from the ticket
    const args: ZuAuthArgs = {
      fieldsToReveal: {
        revealAttendeeEmail: true,
        revealAttendeeName: true,
        revealEventId: true,
        revealProductId: true,
      },
      watermark,
      config: [DEVCON_TICKET_CONFIG],
    };

    // Open popup for user to generate proof
    const result = await zuAuthPopup(args);

    console.log("[zuauth] Popup result type:", result.type);

    if (result.type === "pcd") {
      // Success! User proved they have a valid ticket
      console.log("[zuauth] Proof received successfully");

      // Parse the PCD to get ticket data
      // Note: Full verification should happen on server side
      let ticketData: ZuAuthSession["ticketData"] = {};

      try {
        // The pcdStr contains the serialized proof
        // We can extract revealed fields from it
        const pcdJson = JSON.parse(result.pcdStr);
        if (pcdJson.claim?.partialTicket) {
          ticketData = {
            attendeeEmail: pcdJson.claim.partialTicket.attendeeEmail,
            attendeeName: pcdJson.claim.partialTicket.attendeeName,
            eventId: pcdJson.claim.partialTicket.eventId,
          };
        }
      } catch (parseErr) {
        console.log("[zuauth] Could not parse PCD for ticket data:", parseErr);
      }

      // Store session
      const session: ZuAuthSession = {
        pcdStr: result.pcdStr,
        ticketData,
        authenticatedAt: new Date().toISOString(),
        watermark: watermark.toString(),
      };
      storeZuAuthSession(session);

      return {
        success: true,
        pcdStr: result.pcdStr,
        ticketData,
      };
    } else if (result.type === "popupClosed") {
      console.log("[zuauth] User closed popup without completing");
      return {
        success: false,
        error: "Authentication cancelled - popup was closed",
        errorType: "popupClosed",
      };
    } else if (result.type === "popupBlocked") {
      console.log("[zuauth] Popup was blocked by browser");
      return {
        success: false,
        error: "Popup was blocked. Please allow popups for this site.",
        errorType: "popupBlocked",
      };
    } else {
      console.log("[zuauth] Unknown result type:", result);
      return {
        success: false,
        error: "Unknown authentication result",
        errorType: "unknown",
      };
    }
  } catch (err) {
    console.error("[zuauth] Authentication failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Authentication failed",
      errorType: "proofFailed",
    };
  }
}

/**
 * Known event configurations from Zupass
 * These are sample configs - add more as needed
 *
 * Source: https://github.com/proofcarryingdata/zupass/tree/main/examples/zuauth
 */
export const KNOWN_EVENT_CONFIGS = {
  // Example ticket config (for testing - subscribe to this feed in Zupass)
  example: {
    pcdType: "eddsa-ticket-pcd" as const,
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204"
    ] as [string, string],
    productId: "f4cbd4c9-819e-55eb-8c68-90a660bacf49",
    eventId: "3cf75131-6631-5096-b2e8-03c25d00f4de",
    eventName: "Example Ticket",
    productName: "EdDSA",
  },
};

/**
 * Authenticate with Example ticket (for testing)
 * To use this, subscribe to the Example Ticket feed in Zupass:
 * https://api.zupass.org/generic-issuance/api/feed/e5c41360-3a46-458e-9e12-41c807f9e77e/0
 */
export async function authenticateWithExampleTicket(): Promise<ZuAuthResult> {
  try {
    const watermark = generateWatermark();

    console.log("[zuauth] Starting Example ticket authentication...");

    const args: ZuAuthArgs = {
      fieldsToReveal: {
        revealAttendeeEmail: true,
        revealAttendeeName: true,
        revealEventId: true,
      },
      watermark,
      config: [KNOWN_EVENT_CONFIGS.example],
    };

    const result = await zuAuthPopup(args);

    if (result.type === "pcd") {
      console.log("[zuauth] Proof received");

      let ticketData: ZuAuthSession["ticketData"] = {};
      try {
        const pcdJson = JSON.parse(result.pcdStr);
        if (pcdJson.claim?.partialTicket) {
          ticketData = {
            attendeeEmail: pcdJson.claim.partialTicket.attendeeEmail,
            attendeeName: pcdJson.claim.partialTicket.attendeeName,
            eventId: pcdJson.claim.partialTicket.eventId,
          };
        }
      } catch {
        console.log("[zuauth] Could not parse PCD");
      }

      const session: ZuAuthSession = {
        pcdStr: result.pcdStr,
        ticketData,
        authenticatedAt: new Date().toISOString(),
        watermark: watermark.toString(),
      };
      storeZuAuthSession(session);

      return {
        success: true,
        pcdStr: result.pcdStr,
        ticketData,
      };
    } else if (result.type === "popupClosed") {
      return {
        success: false,
        error: "Authentication cancelled",
        errorType: "popupClosed",
      };
    } else if (result.type === "popupBlocked") {
      return {
        success: false,
        error: "Popup blocked - please allow popups",
        errorType: "popupBlocked",
      };
    }

    return {
      success: false,
      error: "Unknown result",
      errorType: "unknown",
    };
  } catch (err) {
    console.error("[zuauth] Authentication failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Authentication failed",
      errorType: "proofFailed",
    };
  }
}
