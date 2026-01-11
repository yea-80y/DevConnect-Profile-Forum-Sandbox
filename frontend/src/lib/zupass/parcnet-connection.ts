/**
 * Zupass/Parcnet Connection
 * Connect to user's Zupass account via Parcnet protocol
 *
 * Uses @parcnet-js/app-connector to:
 * 1. Authenticate with Zupass
 * 2. Request POD permissions
 * 3. Fetch user's PODs (including Devcon tickets)
 * 4. Understand POD ownership model
 */

import { connect, Zapp, ParcnetAPI } from "@parcnet-js/app-connector";
import { POD } from "@pcd/pod";
import { pod as createPodSpec, PODData } from "@parcnet-js/podspec";

// Re-export PODData for external use
export type { PODData };

/* ============================
 * Zapp Configuration
 * ============================ */

/**
 * WoCo Zapp configuration
 * This identifies our app to Zupass
 *
 * Permissions use:
 * - { collections: [] } = all collections
 * - { collections: ["name"] } = specific collections only
 */
export const WOCO_ZAPP: Zapp = {
  name: "WoCo",
  permissions: {
    REQUEST_PROOF: { collections: [] },              // Request POD proofs (all collections)
    READ_POD: { collections: [] },                   // Read user's PODs (all collections)
    INSERT_POD: { collections: [] },                 // Import PODs to Zupass
    DELETE_POD: { collections: [] },                 // Remove PODs from Zupass
    READ_PUBLIC_IDENTIFIERS: { collections: [] },    // Read user's public identity
  },
};

/**
 * Zupass URLs
 */
export const ZUPASS_CONFIG = {
  clientUrl: "https://zupass.org",
  // Zupass embed URL for Zapp connections
  embedUrl: "https://zupass.org/#/embedded",
  // API endpoint
  apiUrl: "https://api.zupass.org",
};

/* ============================
 * Connection State
 * ============================ */

let parcnetAPI: ParcnetAPI | null = null;

/**
 * Get current Parcnet API instance
 */
export function getParcnetAPI(): ParcnetAPI | null {
  return parcnetAPI;
}

/**
 * Check if connected to Zupass
 */
export function isConnected(): boolean {
  return parcnetAPI !== null;
}

/* ============================
 * Connection Flow
 * ============================ */

/**
 * Connect to Zupass account
 * Opens iframe for user to authenticate with Zupass
 *
 * @param containerElement - HTML element to attach the Zupass iframe to
 * @returns Connection result
 */
export async function connectToZupass(
  containerElement: HTMLElement
): Promise<{
  success: boolean;
  api?: ParcnetAPI;
  error?: string;
}> {
  try {
    console.log("[parcnet] Connecting to Zupass...");
    console.log("[parcnet] Container element:", containerElement.tagName, containerElement.className);
    console.log("[parcnet] Zupass URL:", ZUPASS_CONFIG.clientUrl);
    console.log("[parcnet] Zapp config:", WOCO_ZAPP);

    // Create a promise that races between connection and timeout
    const connectionPromise = connect(
      WOCO_ZAPP,
      containerElement,
      ZUPASS_CONFIG.clientUrl
    );

    // After a short delay, force show any dialog that was created
    setTimeout(() => {
      const dialogs = document.querySelectorAll("dialog.parcnet-dialog");
      dialogs.forEach((dialog) => {
        const htmlDialog = dialog as HTMLDialogElement;
        if (!htmlDialog.open) {
          console.log("[parcnet] Force-showing dialog");
          try {
            htmlDialog.showModal();
          } catch (e) {
            console.log("[parcnet] showModal failed, trying show()");
            try { htmlDialog.show(); } catch { /* ignore */ }
          }
        }
      });
    }, 500);

    // Wait for connection
    const api = await connectionPromise;

    // Store API instance
    parcnetAPI = api;

    console.log("[parcnet] Connected to Zupass!");
    console.log("[parcnet] API ready:", !!api);
    console.log("[parcnet] API methods:", Object.keys(api));

    return {
      success: true,
      api,
    };
  } catch (err) {
    console.error("[parcnet] Connection failed:", err);
    console.error("[parcnet] Error details:", err instanceof Error ? err.stack : err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/**
 * Disconnect from Zupass
 */
export function disconnectFromZupass(): void {
  parcnetAPI = null;
  console.log("[parcnet] Disconnected from Zupass");
}

/* ============================
 * POD Operations
 * ============================ */

/**
 * Fetch all PODs from user's Zupass account
 * This shows us the structure of Devcon tickets and ownership model
 *
 * @returns Array of PODs with metadata
 */
export async function fetchUserPods(): Promise<{
  success: boolean;
  pods?: PODData[];
  error?: string;
}> {
  try {
    if (!parcnetAPI) {
      return {
        success: false,
        error: "Not connected to Zupass - call connectToZupass() first",
      };
    }

    console.log("[parcnet] Fetching user's PODs from Zupass...");

    // Query all PODs from all collections
    // Use empty collection ID and minimal spec to match any POD
    const anyPodSpec = createPodSpec({ entries: {} });
    const allPODs = await parcnetAPI.pod.collection("").query(anyPodSpec);

    console.log(`[parcnet] Found ${allPODs.length} PODs`);

    // Log POD details for debugging
    allPODs.forEach((podData, idx) => {
      console.log(`[parcnet] POD ${idx + 1}:`, {
        id: (podData as any).id,
        type: (podData as any).type,
        pod: !!(podData as any).pod,
      });
    });

    return {
      success: true,
      pods: allPODs,
    };
  } catch (err) {
    console.error("[parcnet] Failed to fetch PODs:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch PODs",
    };
  }
}

/**
 * Fetch Devcon ticket PODs specifically
 *
 * @returns Devcon ticket PODs
 */
export async function fetchDevconTickets(): Promise<{
  success: boolean;
  tickets?: PODData[];
  error?: string;
}> {
  try {
    const result = await fetchUserPods();
    if (!result.success || !result.pods) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Filter for Devcon tickets
    // TODO: Update filter based on actual POD structure we discover
    const tickets = result.pods.filter(podData => {
      const data = podData as any;
      // Check if POD type or entries indicate Devcon ticket
      if (data.type?.includes("devcon") || data.type?.includes("ticket")) {
        return true;
      }

      // Check POD entries for Devcon-related fields
      if (data.pod) {
        const entries = data.pod.content.asEntries();
        return !!(
          entries.ticket_id ||
          entries.ticketId ||
          entries.event_id?.value?.toString().includes("devcon")
        );
      }

      return false;
    });

    console.log(`[parcnet] Found ${tickets.length} Devcon tickets`);

    return {
      success: true,
      tickets,
    };
  } catch (err) {
    console.error("[parcnet] Failed to fetch Devcon tickets:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch tickets",
    };
  }
}

/**
 * Request proof of POD ownership
 * This is how we'll verify user owns a specific POD
 *
 * @param podId - ID of POD to prove ownership of
 * @returns Proof of ownership
 */
export async function requestPodProof(podId: string): Promise<{
  success: boolean;
  proof?: any; // TODO: Type this based on Parcnet proof structure
  error?: string;
}> {
  try {
    if (!parcnetAPI) {
      return {
        success: false,
        error: "Not connected to Zupass",
      };
    }

    console.log(`[parcnet] Requesting proof for POD ${podId}...`);

    // TODO: Implement proof request using Parcnet protocol
    // This will return a cryptographic proof that user owns the POD

    return {
      success: false,
      error: "Proof request not yet implemented",
    };
  } catch (err) {
    console.error("[parcnet] Proof request failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Proof request failed",
    };
  }
}

/**
 * Insert POD into user's Zupass (import to Zupass)
 * This allows WoCo-created PODs to be added to user's Zupass collection
 *
 * @param pod - POD to insert
 * @param collectionId - Collection ID to insert into (default: "" for default collection)
 * @returns Success status
 */
export async function insertPodToZupass(pod: POD, collectionId: string = ""): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (!parcnetAPI) {
      return {
        success: false,
        error: "Not connected to Zupass",
      };
    }

    console.log("[parcnet] Inserting POD to Zupass...");

    // Convert POD to PODData and insert into collection
    const podData = pod as unknown as PODData;
    await parcnetAPI.pod.collection(collectionId).insert(podData);

    console.log("[parcnet] POD inserted successfully");

    return {
      success: true,
    };
  } catch (err) {
    console.error("[parcnet] Failed to insert POD:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to insert POD",
    };
  }
}

/* ============================
 * Utility Functions
 * ============================ */

/**
 * Get user's public identity from Zupass
 */
export async function getUserIdentity(): Promise<string | undefined> {
  if (!parcnetAPI) return undefined;
  try {
    const identity = await parcnetAPI.identity.getSemaphoreV4Commitment();
    return identity.toString();
  } catch {
    return undefined;
  }
}

/**
 * Analyze POD structure to understand ownership model
 * This helps us understand how Zupass handles POD ownership
 *
 * @param podData - POD to analyze
 * @returns Analysis of ownership model
 */
export function analyzePodOwnership(podData: PODData): {
  hasIssuerSignature: boolean;
  hasOwnerSignature: boolean;
  issuerPublicKey?: string;
  ownerPublicKey?: string;
  ownershipFields: string[];
  analysis: string;
} {
  const pod = (podData as any).pod;
  if (!pod) {
    return {
      hasIssuerSignature: false,
      hasOwnerSignature: false,
      ownershipFields: [],
      analysis: "No POD data available",
    };
  }

  const entries = pod.content.asEntries();
  const issuerPubKey = pod.signerPublicKey;

  // Look for ownership-related fields
  const ownershipFields: string[] = [];
  const potentialOwnerFields = [
    "owner",
    "owner_pubkey",
    "attendee_pubkey",
    "holder_pubkey",
    "user_pubkey",
    "attendee_email",
    "attendee_name",
  ];

  for (const field of potentialOwnerFields) {
    if (entries[field]) {
      ownershipFields.push(field);
    }
  }

  // Analyze signature structure
  // PODs typically have one signature (issuer)
  // Need to check if there's a secondary signature for owner
  const hasIssuerSignature = !!issuerPubKey;
  const hasOwnerSignature = ownershipFields.some(f => f.includes("pubkey"));

  let analysis = "";
  if (hasIssuerSignature && !hasOwnerSignature) {
    analysis = "POD has issuer signature only. Ownership likely proven via Zupass account authentication.";
  } else if (hasIssuerSignature && hasOwnerSignature) {
    analysis = "POD has both issuer and owner signatures. Owner field cryptographically proves ownership.";
  } else {
    analysis = "Unclear ownership model - needs further investigation.";
  }

  return {
    hasIssuerSignature,
    hasOwnerSignature,
    issuerPublicKey: issuerPubKey,
    ownerPublicKey: ownershipFields.find(f => f.includes("pubkey"))
      ? String(entries[ownershipFields.find(f => f.includes("pubkey"))!]?.value)
      : undefined,
    ownershipFields,
    analysis,
  };
}
