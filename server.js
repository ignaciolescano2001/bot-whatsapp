const crypto = require("crypto");
const express = require("express");
const { enqueueInbox } = require("./lib/redis");
const { markWebhookReceived } = require("./lib/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));

function toPlainPhone(whatsappAddress) {
  return whatsappAddress.replace(/^whatsapp:/, "").replace(/^\+/, "");
}

app.post("/webhook/whatsapp", async (req, res) => {
  const {
    Body: body,
    From: from,
    To: to,
    ProfileName: profileName,
    NumMedia: numMedia,
    MediaUrl0: mediaUrl,
    MediaContentType0: mediaType,
  } = req.body;

  const hasAudio =
    Number(numMedia) > 0 && !!mediaUrl && !!mediaType?.startsWith("audio/");

  if (!from || !to || (!body && !hasAudio)) {
    console.warn("[webhook] petición inválida, faltan From/To o Body/audio");
    res.status(400).send("Missing From, To, or Body/audio");
    return;
  }

  console.log(
    `[webhook] mensaje de ${from} (a ${to}): ${hasAudio ? `[audio ${mediaType}]` : body}`,
  );

  // Respondemos ya mismo a Twilio para no bloquear su timeout; el mensaje
  // se procesa (OpenAI/Supabase) y se responde de forma asíncrona vía bot/.
  res.set("Content-Type", "text/xml");
  res.status(200).send("<Response></Response>");

  try {
    await enqueueInbox(
      hasAudio
        ? {
            from: toPlainPhone(from),
            id: crypto.randomUUID(),
            type: "audio",
            // "id" guarda la MediaUrl de Twilio (no un mediaId como en la
            // API de Meta): downloadMedia la descarga autenticándose con
            // TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.
            audio: { id: mediaUrl, mime_type: mediaType },
            contactName: profileName || undefined,
          }
        : {
            from: toPlainPhone(from),
            id: crypto.randomUUID(),
            type: "text",
            text: { body },
            contactName: profileName || undefined,
          },
    );
  } catch (err) {
    console.error("[webhook] error encolando el mensaje:", err.message);
  }

  try {
    await markWebhookReceived(toPlainPhone(to));
  } catch (err) {
    console.error("[webhook] error actualizando connection_state:", err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[server] escuchando en http://localhost:${PORT}`);
});
