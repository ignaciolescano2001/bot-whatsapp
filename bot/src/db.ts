import pg from "pg";

const { Pool } = pg;

export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  created_at: string;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DDL = `
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  mode TEXT NOT NULL DEFAULT 'AI' CHECK (mode IN ('AI','HUMAN')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','human')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- connection_state guarda el último dato conocido del webhook de la
-- WhatsApp Cloud API (el panel lo escribe al recibir cada POST de Meta).
-- El estado de salud en sí (token válido, webhook activo) se calcula al
-- vuelo en el panel combinando esto con un chequeo del token contra Graph.
CREATE TABLE IF NOT EXISTS connection_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phone TEXT,
  last_webhook_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE connection_state DROP COLUMN IF EXISTS qr_string;
ALTER TABLE connection_state DROP COLUMN IF EXISTS status;
ALTER TABLE connection_state DROP COLUMN IF EXISTS logout_requested_at;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

INSERT INTO connection_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
`;

export async function initSchema(): Promise<void> {
  await pool.query(DDL);
  console.log("[db] schema listo");
}

export async function getOrCreateConversation(
  phone: string,
  name?: string | null,
): Promise<Conversation> {
  const existing = await pool.query<Conversation>(
    `SELECT * FROM conversations WHERE phone = $1`,
    [phone],
  );
  if (existing.rows.length > 0) {
    if (name && !existing.rows[0].name) {
      const updated = await pool.query<Conversation>(
        `UPDATE conversations SET name = $2 WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, name],
      );
      return updated.rows[0];
    }
    return existing.rows[0];
  }

  const inserted = await pool.query<Conversation>(
    `INSERT INTO conversations (phone, name) VALUES ($1, $2) RETURNING *`,
    [phone, name ?? null],
  );
  return inserted.rows[0];
}

export async function getConversationById(
  id: number,
): Promise<Conversation | null> {
  const res = await pool.query<Conversation>(
    `SELECT * FROM conversations WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function setMode(
  id: number,
  mode: ConversationMode,
): Promise<void> {
  await pool.query(`UPDATE conversations SET mode = $2 WHERE id = $1`, [
    id,
    mode,
  ]);
}

export async function insertMessage(
  conversationId: number,
  role: MessageRole,
  content: string,
): Promise<Message> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<Message>(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [conversationId, role, content],
    );
    await client.query(
      `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
      [conversationId],
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Después de 8hs sin mensajes se considera que arranca una charla nueva:
// no se le manda al LLM el historial de antes de ese corte, para que no
// arrastre contexto viejo de un trámite ya cerrado.
const HISTORY_MAX_AGE = "8 hours";

export async function getRecentHistory(
  conversationId: number,
  limit = 20,
): Promise<Message[]> {
  const res = await pool.query<Message>(
    `SELECT * FROM messages WHERE conversation_id = $1
     AND created_at > now() - interval '${HISTORY_MAX_AGE}'
     ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit],
  );
  return res.rows.reverse();
}
