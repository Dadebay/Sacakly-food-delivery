import type { Message } from "firebase-admin/messaging";
import type { PushPayload } from "./push.gateway";

export const PUBLIC_BROADCAST_TOPIC = "a7-tagam";
export const TOPIC_MESSAGE_MAX_BYTES = 2048;

export function topicMessage(payload: PushPayload): Message {
  return {
    topic: PUBLIC_BROADCAST_TOPIC,
    notification: { title: payload.title, body: payload.body },
    data: {
      campaignId: payload.campaignId,
      ...(payload.deepLink ? { deepLink: payload.deepLink } : {}),
    },
    android: { priority: "high", notification: { sound: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  };
}

export function topicMessageFits(payload: PushPayload) {
  // Conservatively include the entire UTF-8 JSON envelope in the topic limit.
  return (
    Buffer.byteLength(JSON.stringify(topicMessage(payload)), "utf8") <=
    TOPIC_MESSAGE_MAX_BYTES
  );
}
