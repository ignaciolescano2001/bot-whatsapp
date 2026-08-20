import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { setConnectionState } from "@/lib/db";
import { enqueueInbox, type InboxMessage } from "@/lib/redis";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// Meta llama a este handshake una sola vez al configurar la URL del webhook.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function isValidSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!APP_SECRET || !signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.replace("sha256=", "");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

interface CloudApiChangeValue {
  metadata?: { display_phone_number?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: Array<{
    from: string;
    id: string;
    type: string;
    text?: { body: string };
    audio?: { id: string; mime_type?: string };
  }>;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  let phone: string | undefined;
  const items: InboxMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value: CloudApiChangeValue = change.value ?? {};
      phone = value.metadata?.display_phone_number ?? phone;

      const messages = value.messages ?? [];
      if (messages.length === 0) continue;

      const nameByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]),
      );

      for (const message of messages) {
        items.push({
          from: message.from,
          id: message.id,
          type: message.type,
          text: message.text,
          audio: message.audio,
          contactName: nameByWaId.get(message.from) ?? undefined,
        });
      }
    }
  }

  await setConnectionState({
    last_webhook_at: new Date().toISOString(),
    ...(phone ? { phone } : {}),
  });

  for (const item of items) {
    await enqueueInbox(item);
  }

  return NextResponse.json({ ok: true });
}
