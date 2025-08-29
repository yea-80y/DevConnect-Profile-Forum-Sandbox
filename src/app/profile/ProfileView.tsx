"use client";

import { useEffect, useMemo, useState } from "react";
import { Bee, Topic } from "@ethersphere/bee-js";
import type { Bytes } from "@ethersphere/bee-js"; // Import the Bytes type so we can type the payload properly
import Image from "next/image";
import { BEE_URL } from "@/config/swarm";

/**
 * decodeJson
 * ----------
 * - bee-js feed entries give us a `payload` typed as `Bytes | undefined`.
 * - We normalise this into a Uint8Array (required by TextDecoder).
 * - Then we try to parse it as JSON.
 * - Returns the parsed object or null if it fails.
 */
/** Safely normalise bee-js `Bytes` into a Uint8Array */
/** --- Helpers to decode feed payloads --- */
function toUint8(bytes?: Bytes | null): Uint8Array | null {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  if (typeof bytes === "string") return new TextEncoder().encode(bytes);
  try {
    return Uint8Array.from(bytes as unknown as ArrayLike<number>);
  } catch {
    return null;
  }
}

function decodeText(bytes?: Bytes | null): string | null {
  const u8 = toUint8(bytes);
  if (!u8) return null;
  try {
    return new TextDecoder().decode(u8).trim() || null;
  } catch {
    return null;
  }
}

function decodeJson<T = unknown>(bytes?: Bytes | null): T | null {
  const text = decodeText(bytes);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * ProfileView
 * - Reads two feeds owned by `owner`:
 *   1) devconnect/profile/name/{ownerNo0x}
 *   2) devconnect/profile/avatar/{ownerNo0x}
 * - Accepts either JSON payloads ({name}, {imageRef}) or raw strings (name text, 64-hex ref).
 */
export default function ProfileView({ owner }: { owner: `0x${string}` }) {
  const bee = useMemo(() => new Bee(BEE_URL), []);
  const [name, setName] = useState<string | null>(null);
  const [avatarRef, setAvatarRef] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) return;

    const ownerNo0x = owner.slice(2).toLowerCase();
    const nameTopic = Topic.fromString(`devconnect/profile/name/${ownerNo0x}`);
    const avatarTopic = Topic.fromString(`devconnect/profile/avatar/${ownerNo0x}`);

    console.log("[profile] reading feeds", {
      nameFeed: `${BEE_URL}/feeds/${owner}/${nameTopic.toString()}`,
      avatarFeed: `${BEE_URL}/feeds/${owner}/${avatarTopic.toString()}`,
    });

    (async () => {
    try {
        // --- NAME (payload is JSON we wrote: { v, owner, name }) ---
        const nameReader = bee.makeFeedReader(nameTopic, owner);
        const nameUpdate = await nameReader.downloadPayload().catch(() => null);

        if (nameUpdate?.payload) {
        // Bee Bytes -> UTF-8 string
        const text = nameUpdate.payload.toUtf8();
        try {
            const obj = JSON.parse(text) as { v?: number; owner?: string; name?: string };
            setName(obj?.name ?? null);
        } catch {
            // If someone ever wrote a raw string instead of JSON, still show it
            setName(text || null);
        }
        } else {
        setName(null);
        }

        // --- AVATAR (payload is JSON we wrote: { v, owner, imageRef }) ---
        const avatarReader = bee.makeFeedReader(avatarTopic, owner);
        const avatarUpdate = await avatarReader.downloadPayload().catch(() => null);

        if (avatarUpdate?.payload) {
        const text = avatarUpdate.payload.toUtf8();
        let ref: string | null = null;

        try {
            const obj = JSON.parse(text) as { v?: number; owner?: string; imageRef?: string };
            ref = obj?.imageRef ?? null;
        } catch {
            // Back-compat: accept a bare 64-hex written as raw text
            if (/^[0-9a-f]{64}$/i.test(text)) ref = text;
        }

        setAvatarRef(ref);
        } else {
        setAvatarRef(null);
        }
    } catch (e) {
        console.error(e);
    }
    })();
  }, [owner, bee]);

  return (
    <div className="flex items-center gap-4">
      {avatarRef ? (
        <Image
          src={`${BEE_URL}/bzz/${avatarRef}`}
          alt="avatar"
          width={80}
          height={80}
          unoptimized
          className="w-20 h-20 rounded-full object-cover border"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-gray-200 border" />
      )}

      <div>
        <div className="text-lg font-semibold">{name ?? "(no name yet)"}</div>
        <div className="text-xs text-gray-500 break-all">{owner}</div>
      </div>
    </div>
  );
}