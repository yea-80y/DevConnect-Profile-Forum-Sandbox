export const runtime = "nodejs";

// app/api/profile/route.ts
import { NextResponse } from "next/server";
import { Bee, Topic, PrivateKey } from "@ethersphere/bee-js"; // <-- modern API

/**
 * ENV (server-only)
 * -----------------
 * BEE_URL=http://bee.swarm.public.dappnode:1633
 * POSTAGE_BATCH_ID=0x...          // valid stamp
 * FEED_PRIVATE_KEY=0x...32bytes   // DO NOT commit
 */
const BEE_URL = process.env.BEE_URL!;
const POSTAGE_BATCH_ID = process.env.POSTAGE_BATCH_ID!;
const FEED_PRIVATE_KEY = process.env.FEED_PRIVATE_KEY!;


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
    const signer = new PrivateKey(FEED_PRIVATE_KEY);

    // IMPORTANT: get BOTH forms of the address for consistent usage
    const ownerNo0x = signer.publicKey().address().toHex();       // hex, NO 0x
    const owner0x   = `0x${ownerNo0x}` as `0x${string}`;           // hex, WITH 0x (for returning to UI)

    // Topics for the two profile elements (matches your viewer; topic uses NO-0x)
    const nameTopic   = Topic.fromString(`devconnect/profile/name/${ownerNo0x}`);
    const avatarTopic = Topic.fromString(`devconnect/profile/avatar/${ownerNo0x}`);

    if (kind === "name") {
      /**
       * NAME: we store JSON { v, owner, name } so the viewer can parse reliably.
       * We accept any string, trim it, and reject empty.
       */
      const name = String(payload?.name ?? "").trim();
      if (!name) return NextResponse.json({ ok: false, error: "Empty name" }, { status: 400 });

      const writer = bee.makeFeedWriter(nameTopic, signer);
      await writer.uploadPayload(
        POSTAGE_BATCH_ID,
        JSON.stringify({ v: 1, owner: owner0x, name })
      );

      // Return WITH 0x so UI can display and re-use it directly.
      return NextResponse.json({ ok: true, owner: owner0x });
    }

    if (kind === "avatar") {
      /**
       * AVATAR: we store JSON { v, owner, imageRef } where imageRef is the 64-hex BZZ reference.
       * Viewer will render it via `${BEE_URL}/bzz/${imageRef}`.
       */
      const imageRef = String(payload?.imageRef ?? "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/i.test(imageRef)) {
        return NextResponse.json({ ok: false, error: "Invalid imageRef (expect 64-hex)" }, { status: 400 });
      }

      const writer = bee.makeFeedWriter(avatarTopic, signer);
      await writer.uploadPayload(
        POSTAGE_BATCH_ID,
        JSON.stringify({ v: 1, owner: owner0x, imageRef })
      );

      // Return WITH 0x to keep POST and GET consistent.
      return NextResponse.json({ ok: true, owner: owner0x });
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
      const verifyTopic = Topic.fromString(`devconnect/profile/verify/${ownerNo0x}`);
      const writer = bee.makeFeedWriter(verifyTopic, signer);
      const doc = {
        v: 1,
        owner: owner0x,   // platform feed owner (WITH 0x for clarity in stored doc)
        subject,          // the user wallet that signed
        sig,
        typedData: typed, // you may optionally store just a hash of this
        ts: Date.now(),
      };
      await writer.uploadPayload(POSTAGE_BATCH_ID, JSON.stringify(doc));

      return NextResponse.json({ ok: true, owner: owner0x });
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
  const signer     = new PrivateKey(FEED_PRIVATE_KEY);
  const ownerAddr  = signer.publicKey().address();         // EthAddress object
  const ownerNo0x  = ownerAddr.toHex().toLowerCase();      // hex w/o 0x for topic strings
  const owner0x    = `0x${ownerNo0x}` as `0x${string}`;     // hex with 0x for UI/API

  // Try to derive the generated user from the latest verify feed payload
  let user: `0x${string}` | undefined;
  try {
    const verifyTopic = Topic.fromString(`devconnect/profile/verify/${ownerNo0x}`);
    const reader      = bee.makeFeedReader(verifyTopic, ownerAddr); // pass EthAddress for clarity
    const latest      = await reader.downloadPayload();             // payload written by POST "verify"

    if (latest?.payload) {
      // Decode payload → JSON → { subject?: string }
      const bytes = latest.payload as unknown as Uint8Array;
      const text  = new TextDecoder().decode(bytes);
      const doc   = JSON.parse(text) as { subject?: string };

      if (doc.subject && /^0x[0-9a-fA-F]{40}$/.test(doc.subject)) {
        user = doc.subject as `0x${string}`;
      }
    }
  } catch {
    // No verify feed yet or unreadable — fine; Home will fall back to owner
  }

  return NextResponse.json({ ok: true, owner: owner0x, user });
}
