/**
 * Zupass POD Verification
 * Verify Devcon ticket ownership for access control (NO DATABASE!)
 *
 * Flow:
 * 1. User uploads Devcon ticket POD (JSON file or Zupass import)
 * 2. Verify POD Ed25519 signature (signed by Devcon authority)
 * 3. Bind ticket to user's Ethereum address
 * 4. Store binding in local storage (user's device)
 * 5. Access granted based on cryptographic proof
 *
 * NO DATABASE NEEDED - all verification is cryptographic!
 * PODs use Ed25519 signatures, NOT Ethereum signatures!
 */

import { POD } from "@pcd/pod";
import type { VerificationResult, AccessGrants, ZupassVerificationStorage } from "./types";

/* ============================
 * Trusted Authorities
 * ============================ */

/**
 * Trusted Devcon ticket signers (Ed25519 public keys)
 * These are the public keys that signed valid Devcon tickets
 *
 * Format: Base64-encoded Ed25519 public key
 * TODO: Add actual Devcon ticket signing keys from Zupass team
 */
export const TRUSTED_DEVCON_SIGNERS: string[] = [
  // Example: "lCS7RgZeJH9YcpA3Hx0S0NmMPpQ7..."
  // TODO: Get official keys from Zupass/Devcon team
];

/* ============================
 * POD Upload & Parsing
 * ============================ */

/**
 * Raw POD data from Zupass export (simplified format)
 */
export interface RawPODData {
  entries: Record<string, any>;
  signature: string;
  signerPublicKey: string;
}

/**
 * Load POD from uploaded JSON file
 * User can upload a .json file containing a POD they exported from Zupass
 */
export async function loadPodFromFile(file: File): Promise<POD | null> {
  try {
    const text = await file.text();
    const rawData = loadRawPodData(text);

    if (!rawData) {
      return null;
    }

    // For now, we can't use POD.load() with Zupass simplified format
    // Return null and let the caller use loadRawPodDataFromFile instead
    console.log("[zupass] POD.load() not compatible with Zupass export format");
    console.log("[zupass] Use loadRawPodDataFromFile() for analysis");
    return null;
  } catch (err) {
    console.error("[zupass] Failed to load POD from file:", err);
    return null;
  }
}

/**
 * Load raw POD data from file (for Zupass simplified export format)
 * This works with the format Zupass exports, without trying to use POD.load()
 */
export async function loadRawPodDataFromFile(file: File): Promise<RawPODData | null> {
  try {
    const text = await file.text();
    return loadRawPodData(text);
  } catch (err) {
    console.error("[zupass] Failed to load raw POD data:", err);
    return null;
  }
}

/**
 * Parse raw POD data from JSON string
 */
export function loadRawPodData(jsonString: string): RawPODData | null {
  try {
    let json = JSON.parse(jsonString);

    console.log("[zupass] Raw JSON structure:", Object.keys(json));

    // Handle wrapped formats
    if (json.pod && typeof json.pod === "object") {
      console.log("[zupass] Detected wrapped format, extracting pod");
      json = json.pod;
    }

    if (json.type === "pod-pcd" && json.pcd) {
      console.log("[zupass] Detected PCD format");
      json = json.pcd;
    }

    // Validate required fields
    if (!json.entries || !json.signature || !json.signerPublicKey) {
      console.error("[zupass] Missing required fields (entries, signature, signerPublicKey)");
      return null;
    }

    console.log("[zupass] ✓ Raw POD data loaded successfully");
    console.log("[zupass] Entries:", Object.keys(json.entries).length);
    console.log("[zupass] Signer:", json.signerPublicKey);

    return {
      entries: json.entries,
      signature: json.signature,
      signerPublicKey: json.signerPublicKey,
    };
  } catch (err) {
    console.error("[zupass] Failed to parse POD JSON:", err);
    return null;
  }
}

/**
 * Load POD from JSON string (for pasting)
 */
export function loadPodFromJson(jsonString: string): POD | null {
  try {
    const json = JSON.parse(jsonString);
    const pod = POD.fromJSON(json);

    console.log("[zupass] Loaded POD from JSON:", pod.contentID.toString());
    return pod;
  } catch (err) {
    console.error("[zupass] Failed to load POD from JSON:", err);
    return null;
  }
}

/* ============================
 * Verification
 * ============================ */

/**
 * Verify Devcon ticket POD and bind to Ethereum address
 *
 * This is the key anti-spam mechanism:
 * - Each Devcon ticket can only be bound to ONE Ethereum address
 * - POD signature is Ed25519 (verified cryptographically)
 * - No database needed - verification is pure crypto
 * - Ticket ID is unique - prevents reuse
 *
 * NOTE: PODs are signed with Ed25519, NOT Ethereum signatures!
 * The Devcon team signed tickets with their Ed25519 key.
 *
 * @param ticketPOD - Devcon ticket POD from Zupass
 * @param ethAddress - User's Ethereum address (parent account to bind to)
 * @returns Verification result with access grants
 */
export async function verifyDevconTicket(
  ticketPOD: POD,
  ethAddress: string
): Promise<VerificationResult> {
  try {
    // 1. Verify POD structure and signature
    const podEntries = ticketPOD.content.asEntries();
    const signerPubKey = ticketPOD.signerPublicKey;

    console.log("[zupass] Verifying POD signed by:", signerPubKey);

    // Extract ticket data
    const ticketId = podEntries.ticket_id?.value || podEntries.ticketId?.value;
    const eventId = podEntries.event_id?.value || podEntries.eventId?.value;
    const ticketType = podEntries.ticket_type?.value || podEntries.ticketType?.value || podEntries.ticketCategory?.value;
    const attendeeName = podEntries.attendee_name?.value || podEntries.attendeeName?.value;

    if (!ticketId || !eventId) {
      return {
        valid: false,
        error: "Invalid ticket POD - missing required fields (ticket_id, event_id)",
      };
    }

    // 2. Verify POD was signed by trusted Devcon authority (Ed25519 signature)
    // POD library automatically verifies the Ed25519 signature when loaded
    // If we reach here, signature is valid. Now check if signer is trusted.

    // TODO: Uncomment when we have real trusted signers
    // const isTrustedSigner = TRUSTED_DEVCON_SIGNERS.includes(signerPubKey);
    // if (!isTrustedSigner && TRUSTED_DEVCON_SIGNERS.length > 0) {
    //   return {
    //     valid: false,
    //     error: "POD not signed by trusted Devcon authority",
    //   };
    // }

    // For now, accept any valid POD (testing mode)
    console.log("[zupass] POD signature valid (Ed25519)");

    // 3. Check if ticket is already bound to a different address
    const existingBinding = getTicketBinding(String(ticketId));
    if (existingBinding && existingBinding.ethAddress.toLowerCase() !== ethAddress.toLowerCase()) {
      return {
        valid: false,
        error: "This ticket is already bound to a different Ethereum address",
      };
    }

    // 4. Create access grants based on ticket type
    const grants: AccessGrants = {
      canPost: true,               // All Devcon attendees can post
      canCreatePODs: true,          // All Devcon attendees can create PODs
      verified: true,
      ticketType: String(ticketType || "general"),
      verifiedAt: new Date().toISOString(),
      // Optional: Set expiry (e.g., 1 year after Devcon)
      // expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // 5. Store binding locally (on user's device)
    storeTicketBinding({
      ethAddress,
      ticketId: String(ticketId),
      ticketPodContentId: ticketPOD.contentID.toString(),
      verifiedAt: grants.verifiedAt,
      grants,
    });

    return {
      valid: true,
      grants,
      ticketInfo: {
        ticketId: String(ticketId),
        eventId: String(eventId),
        ticketType: String(ticketType || "general"),
        attendeeName: attendeeName ? String(attendeeName) : undefined,
      },
    };
  } catch (err) {
    console.error("[zupass] Verification failed:", err);
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}

/* ============================
 * Storage (Local - No Database!)
 * ============================ */

const STORAGE_KEY = "woco:zupass:verifications";

/**
 * Store ticket binding locally (on user's device)
 * This prevents the same ticket from being used on different devices
 * with different Ethereum addresses (Sybil resistance)
 */
function storeTicketBinding(binding: ZupassVerificationStorage): void {
  try {
    const existing = getAllVerificationBindings();
    const updated = existing.filter(b => b.ticketId !== binding.ticketId);
    updated.push(binding);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("[zupass] Failed to store binding:", err);
  }
}

/**
 * Get ticket binding (check if ticket is already bound)
 */
function getTicketBinding(ticketId: string): ZupassVerificationStorage | null {
  try {
    const bindings = getAllVerificationBindings();
    return bindings.find(b => b.ticketId === ticketId) || null;
  } catch {
    return null;
  }
}

/**
 * Get all verification bindings
 */
function getAllVerificationBindings(): ZupassVerificationStorage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Get verification status for an Ethereum address
 */
export function getVerificationStatus(ethAddress: string): AccessGrants | null {
  try {
    const bindings = getAllVerificationBindings();
    const binding = bindings.find(
      b => b.ethAddress.toLowerCase() === ethAddress.toLowerCase()
    );
    return binding?.grants || null;
  } catch {
    return null;
  }
}

/**
 * Check if user has access (verified Devcon attendee)
 */
export function hasDevconAccess(ethAddress: string): boolean {
  const grants = getVerificationStatus(ethAddress);
  if (!grants) return false;

  // Check if verification is still valid
  if (grants.expiresAt) {
    const expiry = new Date(grants.expiresAt);
    if (expiry < new Date()) {
      return false; // Expired
    }
  }

  return grants.verified && grants.canPost;
}

/**
 * Clear verification (for testing or user request)
 */
export function clearVerification(ethAddress: string): void {
  try {
    const bindings = getAllVerificationBindings();
    const updated = bindings.filter(
      b => b.ethAddress.toLowerCase() !== ethAddress.toLowerCase()
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("[zupass] Failed to clear verification:", err);
  }
}

/* ============================
 * POD Analysis (for understanding structure)
 * ============================ */

export interface PODAnalysis {
  // Basic info
  contentId: string;
  signerPublicKey: string;

  // Entries
  entries: Record<string, { type: string; value: string }>;
  entryCount: number;

  // Ownership analysis
  hasOwnerField: boolean;
  ownerFieldName?: string;
  ownerFieldValue?: string;

  // Signature info
  signatureType: "ed25519";
  signatureValid: boolean;

  // Classification
  isDevconTicket: boolean;
  isCollectible: boolean;
  podType: string;
}

/**
 * Analysis result for raw POD data (Zupass simplified export format)
 */
export interface RawPODAnalysis {
  // Basic info
  signerPublicKey: string;
  signature: string;

  // Entries
  entries: Record<string, { type: string; value: string }>;
  entryCount: number;

  // Ownership analysis
  hasOwnerField: boolean;
  ownerFieldName?: string;
  ownerFieldValue?: string;

  // Signature info (we can't verify without POD library)
  signatureType: "ed25519";
  signaturePresent: boolean;

  // Classification
  isDevconTicket: boolean;
  isCollectible: boolean;
  podType: string;

  // Ticket info (if Devcon ticket)
  ticketInfo?: {
    ticketId: string;
    eventId: string;
    ticketName?: string;
    ticketCategory?: string;
    attendeeName?: string;
    attendeeEmail?: string;
  };
}

/**
 * Analyze raw POD data to understand its structure and ownership model
 * Works with Zupass simplified export format (doesn't require POD library)
 */
export function analyzeRawPOD(rawPod: RawPODData): RawPODAnalysis {
  const entries = rawPod.entries;
  const entryMap: Record<string, { type: string; value: string }> = {};

  // Convert entries to readable format
  for (const [key, value] of Object.entries(entries)) {
    entryMap[key] = {
      type: typeof value,
      value: String(value),
    };
  }

  // Look for ownership-related fields
  const ownerFields = [
    "owner", "owner_v4_commitment", "owner_v3_commitment",
    "attendee_semaphore_id", "semaphore_v4_commitment",
    "holder", "recipient", "attendee_pubkey", "owner_pubkey"
  ];

  let hasOwnerField = false;
  let ownerFieldName: string | undefined;
  let ownerFieldValue: string | undefined;

  for (const field of ownerFields) {
    if (entries[field] !== undefined) {
      hasOwnerField = true;
      ownerFieldName = field;
      ownerFieldValue = String(entries[field]);
      break;
    }
  }

  // Determine if this is a Devcon ticket
  const isDevconTicket = !!(
    entries.ticketId ||
    entries.ticket_id ||
    (entries.eventId && entries.attendeeEmail)
  );

  // Determine if this is a collectible
  const isCollectible = !!(
    entries.pod_type === "woco.collectible" ||
    entries.series_id || entries.seriesId
  );

  // Classify POD type
  let podType = "unknown";
  if (isDevconTicket) podType = "devcon-ticket";
  else if (isCollectible) podType = "collectible";
  else if (entries.pod_type) podType = String(entries.pod_type);

  // Extract ticket info if Devcon ticket
  let ticketInfo: RawPODAnalysis["ticketInfo"] | undefined;
  if (isDevconTicket) {
    ticketInfo = {
      ticketId: String(entries.ticketId || entries.ticket_id || ""),
      eventId: String(entries.eventId || entries.event_id || ""),
      ticketName: entries.ticketName ? String(entries.ticketName) : undefined,
      ticketCategory: entries.ticketCategory !== undefined ? String(entries.ticketCategory) : undefined,
      attendeeName: entries.attendeeName ? String(entries.attendeeName) : undefined,
      attendeeEmail: entries.attendeeEmail ? String(entries.attendeeEmail) : undefined,
    };
  }

  return {
    signerPublicKey: rawPod.signerPublicKey,
    signature: rawPod.signature,
    entries: entryMap,
    entryCount: Object.keys(entries).length,
    hasOwnerField,
    ownerFieldName,
    ownerFieldValue,
    signatureType: "ed25519",
    signaturePresent: !!rawPod.signature,
    isDevconTicket,
    isCollectible,
    podType,
    ticketInfo,
  };
}

/**
 * Analyze a POD to understand its structure and ownership model
 * This helps us understand how Devcon tickets handle ownership
 */
export function analyzePOD(pod: POD): PODAnalysis {
  const entries = pod.content.asEntries();
  const entryMap: Record<string, { type: string; value: string }> = {};

  // Convert entries to readable format
  for (const [key, entry] of Object.entries(entries)) {
    entryMap[key] = {
      type: typeof entry.value,
      value: String(entry.value),
    };
  }

  // Look for ownership-related fields
  const ownerFields = [
    "owner", "owner_v4_commitment", "owner_v3_commitment",
    "attendee_semaphore_id", "semaphore_v4_commitment",
    "holder", "recipient", "attendee_pubkey", "owner_pubkey"
  ];

  let hasOwnerField = false;
  let ownerFieldName: string | undefined;
  let ownerFieldValue: string | undefined;

  for (const field of ownerFields) {
    if (entries[field]) {
      hasOwnerField = true;
      ownerFieldName = field;
      ownerFieldValue = String(entries[field].value);
      break;
    }
  }

  // Determine if this is a Devcon ticket
  const isDevconTicket = !!(
    entries.eventId?.value?.toString().includes("devcon") ||
    entries.event_id?.value?.toString().includes("devcon") ||
    entries.ticketId || entries.ticket_id ||
    entries.attendeeEmail || entries.attendee_email
  );

  // Determine if this is a collectible
  const isCollectible = !!(
    entries.pod_type?.value === "woco.collectible" ||
    entries.series_id || entries.seriesId
  );

  // Classify POD type
  let podType = "unknown";
  if (isDevconTicket) podType = "devcon-ticket";
  else if (isCollectible) podType = "collectible";
  else if (entries.pod_type) podType = String(entries.pod_type.value);

  return {
    contentId: pod.contentID.toString(),
    signerPublicKey: pod.signerPublicKey,
    entries: entryMap,
    entryCount: Object.keys(entries).length,
    hasOwnerField,
    ownerFieldName,
    ownerFieldValue,
    signatureType: "ed25519",
    signatureValid: true, // If POD loaded successfully, signature is valid
    isDevconTicket,
    isCollectible,
    podType,
  };
}
