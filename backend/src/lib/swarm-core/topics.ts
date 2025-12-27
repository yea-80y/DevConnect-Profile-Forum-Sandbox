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

/**
 * POD namespace and topic helpers.
 * IMPORTANT: Keep these words stable - changing them changes the topic bytes.
 */
export const POD_NS = "woco/pod" as const;

/**
 * Global directory for discovering all POD collectibles
 * Topic: woco/pod/directory
 */
export const topicPodDirectory = () =>
  Topic.fromString(`${POD_NS}/directory`);

/**
 * Individual POD series feed (tracks editions and claims)
 * Topic: woco/pod/series/{seriesId}
 * @param seriesId - UUID of the series
 */
export const topicPodSeries = (seriesId: string) =>
  Topic.fromString(`${POD_NS}/series/${seriesId}`);

/**
 * Creator's collection index (lists all series by a creator)
 * Topic: woco/pod/creator/{creatorPodKey}
 * @param creatorPodKey - Creator's ed25519 public key (hex, no 0x)
 */
export const topicPodCreator = (creatorPodKey: string) =>
  Topic.fromString(`${POD_NS}/creator/${creatorPodKey}`);
