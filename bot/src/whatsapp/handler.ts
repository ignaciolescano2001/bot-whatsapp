import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
  setMode,
} from "../db.js";
import { generateReply } from "../openai.js";
import { transcribeAudio } from "../transcribe.js";
import {
  downloadMedia,
  sendText,
  sendOwnerNotification,
} from "../twilio/client.js";
import type { InboxItem } from "../redis.js";

const NOTIFY_WHATSAPP_JID = process.env.NOTIFY_WHATSAPP_JID;

export async function handleInboxMessage(msg: InboxItem): Promise<void> {
  const phone = msg.from;
  let text = msg.type === "text" ? msg.text?.body : undefined;

  if (!text && msg.type === "audio" && msg.audio) {
    console.log(`[bot] ← audio de ${phone}`);

    try {
      const buffer = await downloadMedia(msg.audio.id);
      text = (await transcribeAudio(buffer, msg.audio.mime_type)) ?? undefined;
    } catch (err) {
      console.error(
        `[bot] error descargando/transcribiendo audio de ${phone}:`,
        err,
      );
    }

    if (!text) {
      await sendText(
        phone,
        "No pude entender el audio 🙏 ¿Me lo escribís por texto así te ayudo?",
      );
      return;
    }

    console.log(`[bot] audio de ${phone} transcripto: ${text}`);
  }

  if (!text) {
    console.log(
      `[bot] mensaje de ${phone} sin texto reconocido, tipo: ${msg.type}`,
    );
    return;
  }

  console.log(`[bot] ← mensaje de ${phone}: ${text}`);

  const convo = await getOrCreateConversation(phone, msg.contactName);
  await insertMessage(convo.id, "user", text);

  const fresh = await getConversationById(convo.id);
  if (!fresh || fresh.mode !== "AI") {
    console.log(
      `[bot] conversación ${convo.id} en modo ${fresh?.mode ?? "desconocido"}, no responde el bot`,
    );
    return;
  }

  const history = await getRecentHistory(convo.id, 20);
  console.log(`[bot] llamando LLM con ${history.length} mensajes`);

  const start = Date.now();
  const { reply, switchToHuman, notify } = await generateReply(history, phone);
  console.log(`[bot] LLM respondió en ${Date.now() - start}ms`);

  if (reply) {
    await insertMessage(convo.id, "assistant", reply);
    await sendText(phone, reply);
    console.log(`[bot] → enviado a ${phone}`);
  }

  if (notify) {
    if (NOTIFY_WHATSAPP_JID) {
      try {
        await sendOwnerNotification(NOTIFY_WHATSAPP_JID, notify);
      } catch (err) {
        console.error("[bot] no se pudo enviar la notificación:", err);
      }
    } else {
      console.warn(
        "[bot] NOTIFY_WHATSAPP_JID no configurado, notificación no enviada:",
        notify,
      );
    }
  }

  if (switchToHuman) {
    await setMode(convo.id, "HUMAN");
    console.log(`[bot] conversación ${convo.id} pasada a modo HUMAN`);
  }
}
