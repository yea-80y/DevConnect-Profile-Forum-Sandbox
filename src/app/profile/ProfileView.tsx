"use client";

/**
 * ProfileView (render-now, fetch-later)
 * ------------------------------------
 * Purpose
 *   Show the user's address (subject) immediately. When the platform feed owner
 *   (feedOwner) becomes available, fetch the user's name & avatar from per-user
 *   feeds written by the platform signer.
 *
 * Model recap
 *   - Feeds are OWNED by the platform signer (feedOwner).
 *   - Topics are KEYED by the user account (subject) so each user has:
 *       {FEED_NS}/name/{subjectNo0x}
 *       {FEED_NS}/avatar/{subjectNo0x}
 *   - Payloads we write:
 *       Name   → { v, owner, subject, name }
 *       Avatar → { v, owner, subject, imageRef }  // 64-hex bzz reference
 *
 * Read rule (critical)
 *   Reader must use:
 *     - topic derived from SUBJECT
 *     - owner = FEED OWNER (platform signer)
 *   This must match the server writes exactly.
 */

import { useEffect, useMemo, useState } from "react";
import { Bee, Topic } from "@ethersphere/bee-js";
import Image from "next/image";
import { BEE_URL } from "@/config/swarm";           // Bee base URL
import { FEED_NS } from "@/lib/swarm-core/topics"; // deterministic namespace, e.g. "devconnect/profile"

// Local helper types for clarity (keeps TS strict and self-documented)
type Hex0x = `0x${string}`;
type NameDoc   = { v?: number; owner?: Hex0x; subject?: Hex0x; name?: string };
type AvatarDoc = { v?: number; owner?: Hex0x; subject?: Hex0x; imageRef?: string };

export default function ProfileView(props: {
  /**
   * subject (required)
   * The user's account address we are displaying.
   * We can render this immediately (even without network calls).
   */
  subject: Hex0x;

  /**
   * feedOwner (optional)
   * The platform signer address that owns the feeds. When this arrives,
   * we will fetch the name & avatar from Bee using (topic(subject), owner(feedOwner)).
   * While undefined, we show placeholders (no network calls).
   */
  feedOwner?: Hex0x | null;
}) {
  const { subject, feedOwner } = props;

  // Bee client (lightweight) – created once
  const bee = useMemo(() => new Bee(BEE_URL), []);

  // UI state for profile data from feeds
  const [name, setName] = useState<string | null>(null);
  const [avatarRef, setAvatarRef] = useState<string | null>(null);

  useEffect(() => {
    // We can always render the subject (address) immediately.
    if (!subject) return;

    // If we don't yet know the feed owner, skip network calls and
    // keep placeholders (circle avatar + "(no name yet)").
    if (!feedOwner) {
      setName(null);
      setAvatarRef(null);
      return;
    }

    // --------------------------------------------
    // Build topics from the SUBJECT (per-user keys)
    // --------------------------------------------
    const subjectNo0x = subject.slice(2).toLowerCase();
    const nameTopic   = Topic.fromString(`${FEED_NS}/name/${subjectNo0x}`);
    const avatarTopic = Topic.fromString(`${FEED_NS}/avatar/${subjectNo0x}`);

    // Debug: show the exact GET URLs we’re about to read
    console.log("[profile/read]", {
      nameFeedGET:   `${BEE_URL}/feeds/${feedOwner}/${nameTopic.toString()}`,
      avatarFeedGET: `${BEE_URL}/feeds/${feedOwner}/${avatarTopic.toString()}`,
    });

    // Fetch name + avatar (best-effort; tolerant to empty feeds)
    (async () => {
      try {
        // ------- NAME feed -------
        const nameUpdate = await bee
          .makeFeedReader(nameTopic, feedOwner)
          .downloadPayload()
          .catch(() => null);

        if (nameUpdate?.payload) {
          const text = nameUpdate.payload.toUtf8();
          try {
            const doc = JSON.parse(text) as NameDoc;
            setName(doc?.name ?? null);
          } catch {
            // Back-compat: if a raw string was ever written
            setName(text || null);
          }
        } else {
          setName(null);
        }

        // ------- AVATAR feed -------
        const avatarUpdate = await bee
          .makeFeedReader(avatarTopic, feedOwner)
          .downloadPayload()
          .catch(() => null);

        if (avatarUpdate?.payload) {
          const text = avatarUpdate.payload.toUtf8();
          try {
            const doc = JSON.parse(text) as AvatarDoc;
            setAvatarRef(doc?.imageRef ?? null);
          } catch {
            // Back-compat: if a bare 64-hex was ever written as raw text
            setAvatarRef(/^[0-9a-f]{64}$/i.test(text) ? text : null);
          }
        } else {
          setAvatarRef(null);
        }
      } catch (e) {
        console.error("[profile/read:error]", e);
      }
    })();
  }, [subject, feedOwner, bee]);

  return (
    <div className="flex items-center gap-4">
      {/* Avatar
         - While we don't yet have imageRef, show a round gray placeholder.
         - When imageRef loads, render the immutable /bzz resource. */}
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
        {/* Name from the name feed; falls back to a friendly placeholder */}
        <div className="text-lg font-semibold">{name ?? "(no name yet)"}</div>

        {/* Always show the subject (user address) immediately */}
        <div className="text-xs text-gray-500 break-all">{subject}</div>
      </div>
    </div>
  );
}
