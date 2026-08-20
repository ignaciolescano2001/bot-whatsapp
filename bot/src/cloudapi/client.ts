const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN;
const TEMPLATE_OWNER_NOTIFICATION =
  process.env.WHATSAPP_TEMPLATE_OWNER_NOTIFICATION || "notificacion_dueno";
const TEMPLATE_LANGUAGE = "es_AR";

const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Meta devuelve este código cuando pasaron más de 24hs desde el último
// mensaje del usuario: hace falta una plantilla aprobada en vez de texto libre.
const WINDOW_EXPIRED_CODE = 131047;

export class CloudApiError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

async function graphPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    throw new CloudApiError(
      data.error?.message || `Graph API error (HTTP ${res.status})`,
      data.error?.code,
    );
  }
  return data;
}

export async function sendText(to: string, body: string): Promise<void> {
  await graphPost(`${PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

export async function sendTemplate(
  to: string,
  name: string,
  params: string[],
): Promise<void> {
  await graphPost(`${PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: TEMPLATE_LANGUAGE },
      components: params.length
        ? [
            {
              type: "body",
              parameters: params.map((text) => ({ type: "text", text })),
            },
          ]
        : undefined,
    },
  });
}

// Intenta texto libre primero; si la ventana de 24hs ya cerró, cae a la
// plantilla aprobada por Meta para no perder la notificación.
export async function sendOwnerNotification(
  to: string,
  text: string,
): Promise<void> {
  try {
    await sendText(to, text);
  } catch (err) {
    if (err instanceof CloudApiError && err.code === WINDOW_EXPIRED_CODE) {
      await sendTemplate(to, TEMPLATE_OWNER_NOTIFICATION, [text]);
      return;
    }
    throw err;
  }
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!metaRes.ok) {
    throw new CloudApiError(
      `no se pudo resolver la URL del media ${mediaId} (HTTP ${metaRes.status})`,
    );
  }
  const meta = (await metaRes.json()) as { url: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!fileRes.ok) {
    throw new CloudApiError(
      `no se pudo descargar el media ${mediaId} (HTTP ${fileRes.status})`,
    );
  }
  return Buffer.from(await fileRes.arrayBuffer());
}
