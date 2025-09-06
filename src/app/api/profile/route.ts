export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// app/api/profile/route.ts
import { NextResponse } from "next/server";
import { Bee, PrivateKey } from "@ethersphere/bee-js"; // <-- modern API
// shared deterministic topics + shared types
import { topicName, topicAvatar, topicVerify } from "@/lib/swarm-core/topics";
import type { NamePayload, AvatarPayload, ApiOk, Hex0x } from "@/lib/swarm-core/types";
import { BEE_URL, POSTAGE_BATCH_ID, FEED_PRIVATE_KEY, normalizePk } from "@/config/swarm"


/**
 * NOTE on owner formatting:
 * - bee-js gives us the address WITHOUT the 0x prefix (e.g., "5751fc76...")
 * - Feeds/topics in this app use that NO-0x form inside the topic string.
 * - BUT all API responses should return the owner WITH 0x so the UI can display it and
 *   pass it back into bee-js readers/writers safely.
 */
type Kind = "name" | "avatar" | "verify";


export async function POST(req: Request) {
  try {
    if (!BEE_URL || !POSTAGE_BATCH_ID || !FEED_PRIVATE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Server env missing (BEE_URL, POSTAGE_BATCH_ID, FEED_PRIVATE_KEY)" },
        { status: 500 }
      );
    }

    const { kind, payload } = (await req.json()) as {
      kind: Kind;
      payload: Record<string, unknown>;
    };

    if (!kind || !payload) {
      return NextResponse.json({ ok: false, error: "Missing kind/payload" }, { status: 400 });
    }

    // --- Construct bee + platform signer (platform/private feed owner) ---
    const bee = new Bee(BEE_URL);
    const signer = new PrivateKey(normalizePk(FEED_PRIVATE_KEY));

    // IMPORTANT: get BOTH forms of the address for consistent usage
    const ownerNo0x = signer.publicKey().address().toHex().toLowerCase(); // hex, NO 0x (lowercased for topics)
    const owner0x   = `0x${ownerNo0x}` as Hex0x;           // hex, WITH 0x (for returning to UI)


    // NAME (topic = userNo0x; feed owner = platform signer) - Deleted
    // ---------------------------
    // ---------------------------
    // NAME (topic = subjectNo0x; feed owner = platform signer)
    // ---------------------------
    if (kind === "name") {
    const p = payload as NamePayload;

    // Validate inputs
    const name = String(p?.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Empty name" }, { status: 400 });

    const subject = String(p?.subject ?? "").toLowerCase() as `0x${string}`;
    if (!/^0x[0-9a-f]{40}$/i.test(subject)) {
        return NextResponse.json({ ok: false, error: "Invalid subject address" }, { status: 400 });
    }

    // Per-user topic (derived from SUBJECT, not the feed owner)
    const t = topicName(subject.slice(2).toLowerCase());

    // Writer = platform signer (owner), topic = per-user
    const w = bee.makeFeedWriter(t, signer);
    await w.uploadPayload(
        POSTAGE_BATCH_ID,
        JSON.stringify({ v: 1, owner: owner0x, subject, name })
    );

    // Return the platform owner (useful for preview) and echo subject
    return NextResponse.json({ ok: true, owner: owner0x, subject } as ApiOk);
    }


    // AVATAR (topic = userNo0x; feed owner = platform signer) - Deleted
    // ---------------------------
    // ---------------------------
    // AVATAR (topic = subjectNo0x; feed owner = platform signer)
    // ---------------------------
    if (kind === "avatar") {
    const p = payload as AvatarPayload;

    // Validate inputs
    const imageRef = String(p?.imageRef ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/i.test(imageRef)) {
        return NextResponse.json({ ok: false, error: "Invalid imageRef (expect 64-hex)" }, { status: 400 });
    }

    const subject = String(p?.subject ?? "").toLowerCase() as `0x${string}`;
    if (!/^0x[0-9a-f]{40}$/i.test(subject)) {
        return NextResponse.json({ ok: false, error: "Invalid subject address" }, { status: 400 });
    }

    // Per-user topic (derived from SUBJECT)
    const t = topicAvatar(subject.slice(2).toLowerCase());

    // Writer = platform signer (owner), topic = per-user
    const w = bee.makeFeedWriter(t, signer);
    await w.uploadPayload(
        POSTAGE_BATCH_ID,
        JSON.stringify({ v: 1, owner: owner0x, subject, imageRef })
    );

    return NextResponse.json({ ok: true, owner: owner0x, subject } as ApiOk);
    }


    if (kind === "verify") {
      /**
       * Third element: user signs a payload (EIP-712). You verify and store it.
       * Expect:
       *  payload = {
       *    subject: "0xUserWallet",   // who signed
       *    typedData: { domain, types, message }, // what they signed
       *    sig: "0x..."               // signature
       *  }
       */
      const subject = String(payload?.subject || "").toLowerCase() as `0x${string}`;
      const sig     = String(payload?.sig || "");
      const typed   = payload?.typedData;

      if (!subject || !sig || !typed) {
        return NextResponse.json({ ok: false, error: "Missing subject/sig/typedData" }, { status: 400 });
      }
      // quick guards to avoid bad payloads
      if (!subject.startsWith("0x") || !sig.startsWith("0x")) {
        return NextResponse.json({ ok: false, error: "subject/sig must be hex strings" }, { status: 400 });
      }

      // TODO: VERIFY the signature with ethers.verifyTypedData(domain, types, message, sig)
      // and ensure the recovered address matches `subject`. If mismatch => 400.

      // If valid, store a verification record under a dedicated feed:
      const t = topicVerify(ownerNo0x);
      const writer = bee.makeFeedWriter(t, signer);
      const doc = {
        v: 1,
        owner: owner0x,   // platform feed owner (WITH 0x for clarity in stored doc)
        subject,          // the user wallet that signed
        sig,
        typedData: typed, // you may optionally store just a hash of this
        ts: Date.now(),
      };
      await writer.uploadPayload(POSTAGE_BATCH_ID, JSON.stringify(doc));

      return NextResponse.json({ ok: true, owner: owner0x } as ApiOk);
    }

    return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/profile]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET returns the platform owner (0x...) and, if available, the "generated user" address
// by reading the latest verify feed entry: devconnect/profile/verify/{ownerNo0x}
export async function GET() {
  if (!FEED_PRIVATE_KEY) {
    return NextResponse.json({ ok: false, error: "Missing FEED_PRIVATE_KEY" }, { status: 500 });
  }
  if (!BEE_URL) {
    return NextResponse.json({ ok: false, error: "Missing BEE_URL" }, { status: 500 });
  }

  // Construct Bee client and platform signer (feed owner)
  const bee = new Bee(BEE_URL);
  const signer = new PrivateKey(normalizePk(FEED_PRIVATE_KEY));
  const ownerAddr  = signer.publicKey().address();         // EthAddress object
  const ownerNo0x  = ownerAddr.toHex().toLowerCase();      // hex w/o 0x for topic strings
  const owner0x    = `0x${ownerNo0x}` as `0x${string}`;     // hex with 0x for UI/API

  // Try to derive the generated user from the latest verify feed payload
  let user: `0x${string}` | undefined;
  try {
    const t        = topicVerify(ownerNo0x);
    const reader   = bee.makeFeedReader(t, ownerAddr);
    const latest   = await reader.downloadPayload();             // payload written by POST "verify"

    if (latest?.payload) {
      // Decode payload → JSON → { subject?: string }
      const text = latest.payload.toUtf8();
      const doc   = JSON.parse(text) as { subject?: Hex0x };

      if (doc.subject && /^0x[0-9a-fA-F]{40}$/.test(doc.subject)) {
        user = doc.subject;
      }
    }
  } catch {
    // No verify feed yet or unreadable — fine; Home will fall back to owner
  }

  return NextResponse.json({ ok: true, owner: owner0x, user });
}
