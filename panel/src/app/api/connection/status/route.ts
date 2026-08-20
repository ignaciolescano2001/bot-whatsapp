import { NextResponse } from "next/server";
import { getConnectionState, type ConnectionStatus } from "@/lib/db";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";
const TOKEN_CHECK_TTL_MS = 30_000;

let cachedTokenOk: { ok: boolean; checkedAt: number } | null = null;

// El panel hace polling cada pocos segundos: cachear evita golpear Graph API
// en cada request y toparse con rate limits.
async function isTokenValid(): Promise<boolean> {
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

export async function GET() {
  const state = await getConnectionState();
  const tokenOk = await isTokenValid();

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
    phone: state.phone,
    lastWebhookAt: state.last_webhook_at,
    updatedAt: state.updated_at,
  });
}
