import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

export class TwilioApiError extends Error {}

let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    throw new TwilioApiError(
      "Faltan TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN en las variables de entorno",
    );
  }
  if (!client) client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  return client;
}

function toWhatsAppAddress(phone: string): string {
  const withPlus = phone.startsWith("+") ? phone : `+${phone}`;
  return `whatsapp:${withPlus}`;
}

export async function sendText(to: string, body: string): Promise<void> {
  if (!WHATSAPP_NUMBER) {
    throw new TwilioApiError(
      "Falta TWILIO_WHATSAPP_NUMBER en las variables de entorno",
    );
  }
  await getClient().messages.create({
    from: toWhatsAppAddress(WHATSAPP_NUMBER),
    to: toWhatsAppAddress(to),
    body,
  });
}

// Twilio no distingue plantilla aprobada vs. texto libre en la Sandbox;
// se manda como mensaje normal.
export async function sendOwnerNotification(
  to: string,
  text: string,
): Promise<void> {
  await sendText(to, text);
}

export async function downloadMedia(_mediaId: string): Promise<Buffer> {
  throw new TwilioApiError(
    "downloadMedia no está implementado para Twilio todavía (los audios de Twilio llegan por MediaUrl, no por mediaId)",
  );
}
