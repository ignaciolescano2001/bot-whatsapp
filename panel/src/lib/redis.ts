import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

export interface InboxMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  contactName?: string;
}

export async function enqueueOutbox(
  conversationId: number,
  phone: string,
  content: string,
): Promise<void> {
  await redis.lpush(
    "outbox",
    JSON.stringify({ conversationId, phone, content }),
  );
}

export async function enqueueInbox(message: InboxMessage): Promise<void> {
  await redis.lpush("inbox", JSON.stringify(message));
}
