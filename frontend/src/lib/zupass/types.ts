/**
 * Zupass Integration Types
 * For POD verification and import (POST-LOGIN feature)
 */

import type { POD } from "@pcd/pod";

/* ============================
 * Zupass Connection
 * ============================ */

export interface ZupassConnection {
  connected: boolean;
  uuid?: string;
  email?: string;
  pods?: POD[];
}

/* ============================
 * POD Verification
 * ============================ */

export interface DevconTicketPOD {
  podType: "devcon-ticket";
  ticketId: string;
  attendeeEmail?: string;
  attendeeName?: string;
  eventId: string;        // "devcon-7-sea" etc.
  ticketType: string;     // "general", "speaker", "builder", etc.
  issuedAt: string;
  issuerPublicKey: string; // Public key that signed this POD
}

export interface VerificationResult {
  valid: boolean;
  grants?: AccessGrants;
  ticketInfo?: {
    ticketId: string;
    eventId: string;
    ticketType: string;
    attendeeName?: string;
  };
  error?: string;
}

export interface AccessGrants {
  canPost: boolean;          // Can post to forum
  canCreatePODs: boolean;    // Can create POD collectibles
  verified: boolean;         // Devcon attendee verified
  ticketType: string;        // Ticket type for display
  verifiedAt: string;        // When verification happened
  expiresAt?: string;        // Optional expiry
}

/* ============================
 * Storage
 * ============================ */

export interface ZupassVerificationStorage {
  ethAddress: string;        // User's Ethereum address (parent)
  ticketId: string;          // Unique ticket ID (prevents reuse)
  ticketPodContentId: string; // POD content ID (hash)
  verifiedAt: string;        // ISO timestamp
  grants: AccessGrants;
}
