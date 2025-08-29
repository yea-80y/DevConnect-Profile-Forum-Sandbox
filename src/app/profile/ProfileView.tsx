"use client";

/**
 * ProfileView (per-user topics, platform-owned feeds)
 * ---------------------------------------------------
 * Architecture (what we're doing):
 * - The **platform signer** is the feed owner (does the actual writes/stamping).
 * - The **user account (subject)** is the identity whose profile we’re viewing/editing.
 * - We key the feed topics by **subject** so each user gets their own profile streams:
 *      devconnect/profile/name/{subjectNo0x}
 *      devconnect/profile/avatar/{subjectNo0x}
 * - The payloads are small JSON blobs, written via uploadPayload():
 *      { v, owner, subject, name }         // name feed
 *      { v, owner, subject, imageRef }     // avatar feed (imageRef is a 64-hex BZZ reference)
 *
 * Why name has no "hash":
 * - Name is mutable text, so it lives **inside the feed payload** (not /bzz).
 * - Avatar is immutable content → uploaded to /bzz → we store its 64-hex reference in the feed.
 */

import { useEffect, useMemo, useState } from "react";
import { Bee, Topic } from "@ethersphere/bee-js";
import Image from "next/image";
import { BEE_URL } from "@/config/swarm";

type NameDoc   = { v?: number; owner?: `0x${string}`; subject?: `0x${string}`; name?: string };
type AvatarDoc = { v?: number; owner?: `0x${string}`; subject?: `0x${string}`; imageRef?: string };

export default function ProfileView({
  /** feedOwner: platform signer address (0x…) – the owner of the feeds */
  feedOwner,
  /** subject: user address (0x…) – used to derive the per-user topic strings */
  subject,
}: {
  feedOwner: `0x${string}`;
  subject: `0x${string}`;
}) {
  const bee = useMemo(() => new Bee(BEE_URL), []);
  const [name, setName] = useState<string | null>(null);
  const [avatarRef, setAvatarRef] = useState<string | null>(null);

  useEffect(() => {
    if (!feedOwner || !subject) return;

    // Topics are keyed by the USER (subject), not the feed owner
    const subjectNo0x = subject.slice(2).toLowerCase();
    const nameTopic   = Topic.fromString(`devconnect/profile/name/${subjectNo0x}`);
    const avatarTopic = Topic.fromString(`devconnect/profile/avatar/${subjectNo0x}`);

    console.log("[profile] reading feeds", {
      nameFeed:   `${BEE_URL}/feeds/${feedOwner}/${nameTopic.toString()}`,
      avatarFeed: `${BEE_URL}/feeds/${feedOwner}/${avatarTopic.toString()}`,
    });

    (async () => {
      try {
        // -------------------------------
        // NAME feed (JSON in payload)
        // -------------------------------
        const nameReader = bee.makeFeedReader(nameTopic, feedOwner);
        const nameUpdate = await nameReader.downloadPayload().catch(() => null);

        if (nameUpdate?.payload) {
          // Bee Bytes -> UTF-8 string
          const text = nameUpdate.payload.toUtf8();
          try {
            const doc = JSON.parse(text) as NameDoc;
            setName(doc?.name ?? null);
          } catch {
            // Back-compat: if someone ever wrote plain text, render it
            setName(text || null);
          }
        } else {
          setName(null);
        }

        // -------------------------------
        // AVATAR feed (JSON in payload)
        // -------------------------------
        const avatarReader = bee.makeFeedReader(avatarTopic, feedOwner);
        const avatarUpdate = await avatarReader.downloadPayload().catch(() => null);

        if (avatarUpdate?.payload) {
          const text = avatarUpdate.payload.toUtf8();
          let ref: string | null = null;

          try {
            const doc = JSON.parse(text) as AvatarDoc;
            ref = doc?.imageRef ?? null;
          } catch {
            // Back-compat: accept a bare 64-hex image ref written as raw text
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
  }, [feedOwner, subject, bee]);

  return (
    <div className="flex items-center gap-4">
      {/* Avatar renders from /bzz/<imageRef>. When no ref yet, show a gray circle placeholder. */}
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
        {/* Name from name feed; null → placeholder */}
        <div className="text-lg font-semibold">{name ?? "(no name yet)"}</div>

        {/* Show the subject (user) under the name */}
        <div className="text-xs text-gray-500 break-all">{subject}</div>
      </div>
    </div>
  );
}
