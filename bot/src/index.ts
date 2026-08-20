import { initSchema } from "./db.js";
import { sendText } from "./cloudapi/client.js";
import { handleInboxMessage } from "./whatsapp/handler.js";
import {
  requeueOutboxItem,
  waitForNext,
  type InboxItem,
  type OutboxItem,
} from "./redis.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOutboxItem(item: OutboxItem): Promise<void> {
  try {
    await sendText(item.phone, item.content);
    console.log(`[bot] → (humano) enviado a ${item.phone}`);
  } catch (err) {
    console.error("[bot] error enviando mensaje saliente, reencolando:", err);
    await requeueOutboxItem(item);
    await sleep(2000);
  }
}

async function mainLoop(): Promise<void> {
  for (;;) {
    let result;
    try {
      result = await waitForNext(5);
    } catch (err) {
      console.error("[bot] error leyendo de Redis:", err);
      await sleep(3000);
      continue;
    }
    if (!result) continue;

    if (result.key === "inbox") {
      let item: InboxItem;
      try {
        item = JSON.parse(result.value);
      } catch (err) {
        console.error("[bot] mensaje de inbox inválido, descartado:", err);
        continue;
      }
      try {
        await handleInboxMessage(item);
      } catch (err) {
        console.error("[bot] error procesando mensaje entrante:", err);
      }
      continue;
    }

    if (result.key === "outbox") {
      let item: OutboxItem;
      try {
        item = JSON.parse(result.value);
      } catch (err) {
        console.error("[bot] mensaje de outbox inválido, descartado:", err);
        continue;
      }
      await sendOutboxItem(item);
    }
  }
}

async function main(): Promise<void> {
  await initSchema();
  console.log("[bot] arrancado, esperando mensajes...");
  await mainLoop();
}

main().catch((err) => {
  console.error("[bot] error fatal:", err);
  process.exit(1);
});
