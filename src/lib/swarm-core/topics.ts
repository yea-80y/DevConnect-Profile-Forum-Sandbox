// src/lib/swarm-core/topics.ts
import { Topic } from "@ethersphere/bee-js";

/**
 * Deterministic profile namespace and topic helpers.
 * Keep these words stable: changing them changes the topic bytes.
 */
export const FEED_NS = "devconnect/profile" as const;

export const topicName   = (addrNo0x: string) => Topic.fromString(`${FEED_NS}/name/${addrNo0x}`);
export const topicAvatar = (addrNo0x: string) => Topic.fromString(`${FEED_NS}/avatar/${addrNo0x}`);
export const topicVerify = (ownerNo0x: string) => Topic.fromString(`${FEED_NS}/verify/${ownerNo0x}`);
