import OpenAI, { toFile } from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

export async function transcribeAudio(
  buffer: Buffer,
  mimetype?: string,
): Promise<string | null> {
  try {
    const file = await toFile(buffer, "audio.ogg", {
      type: mimetype || "audio/ogg",
    });
    const transcription = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      language: "es",
    });
    const text = transcription.text?.trim();
    return text ? text : null;
  } catch (err) {
    console.error("[bot] error transcribiendo audio:", err);
    return null;
  }
}
