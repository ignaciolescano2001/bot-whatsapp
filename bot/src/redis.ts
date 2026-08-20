import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

export interface OutboxItem {
  conversationId: number;
  phone: string;
  content: string;
}

export interface InboxItem {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  contactName?: string;
}

const INBOX_KEY = "inbox";
const OUTBOX_KEY = "outbox";

export interface BrpopResult {
  key: string;
  value: string;
}

export async function waitForNext(timeoutSec = 5): Promise<BrpopResult | null> {
  const res = await redis.brpop(INBOX_KEY, OUTBOX_KEY, timeoutSec);
  if (!res) return null;
  return { key: res[0], value: res[1] };
}

export async function requeueOutboxItem(item: OutboxItem): Promise<void> {
  await redis.lpush(OUTBOX_KEY, JSON.stringify(item));
}

export { INBOX_KEY, OUTBOX_KEY };
