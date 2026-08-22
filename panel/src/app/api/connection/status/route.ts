import { NextResponse } from "next/server";
import { getConnectionState, type ConnectionStatus } from "@/lib/db";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";
const TOKEN_CHECK_TTL_MS = 30_000;

let cachedTokenOk: { ok: boolean; checkedAt: number } | null = null;

// El panel hace polling cada pocos segundos: cachear evita golpear Graph API
// (o la API de Twilio) en cada request y toparse con rate limits.
async function isMetaTokenValid(): Promise<boolean> {
  if (
    cachedTokenOk &&
    Date.now() - cachedTokenOk.checkedAt < TOKEN_CHECK_TTL_MS
  ) {
    return cachedTokenOk.ok;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  let ok = false;

  if (phoneNumberId && token) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=id`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      ok = res.ok;
    } catch {
      ok = false;
    }
  }

  cachedTokenOk = { ok, checkedAt: Date.now() };
  return ok;
}

async function isTwilioTokenValid(): Promise<boolean> {
  if (
    cachedTokenOk &&
    Date.now() - cachedTokenOk.checkedAt < TOKEN_CHECK_TTL_MS
  ) {
    return cachedTokenOk.ok;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let ok = false;

  if (accountSid && authToken) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          },
        },
      );
      ok = res.ok;
    } catch {
      ok = false;
    }
  }

  cachedTokenOk = { ok, checkedAt: Date.now() };
  return ok;
}

export async function GET() {
  const state = await getConnectionState();
  const usingTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
  );
  const tokenOk = usingTwilio
    ? await isTwilioTokenValid()
    : await isMetaTokenValid();

  let status: ConnectionStatus;
  if (!tokenOk) {
    status = "token_invalid";
  } else if (!state.last_webhook_at) {
    status = "no_webhook";
  } else {
    status = "ok";
  }

  return NextResponse.json({
    status,
    provider: usingTwilio ? "twilio" : "meta",
    phone: state.phone ?? (usingTwilio ? process.env.TWILIO_WHATSAPP_NUMBER : null),
    lastWebhookAt: state.last_webhook_at,
    updatedAt: state.updated_at,
  });
}
