import pg from "pg";

const { Pool } = pg;

export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";
// Estado calculado al vuelo (token válido + webhook activo), no persistido.
export type ConnectionStatus = "ok" | "token_invalid" | "no_webhook";

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  last_message_at: string | null;
  created_at: string;
}

export interface ConversationListItem {
  id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  last_message_at: string | null;
  created_at: string;
  last_message_preview: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface ConnectionState {
  id: number;
  phone: string | null;
  last_webhook_at: string | null;
  updated_at: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function listConversations(): Promise<ConversationListItem[]> {
  const res = await pool.query<ConversationListItem>(
    `SELECT c.id, c.phone, c.name, c.mode, c.last_message_at, c.created_at,
            m.content AS last_message_preview
     FROM conversations c
     LEFT JOIN LATERAL (
       SELECT content FROM messages
       WHERE conversation_id = c.id
       ORDER BY created_at DESC
       LIMIT 1
     ) m ON true
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
  );
  return res.rows;
}

export async function getMessages(
  conversationId: number,
  limit = 50,
): Promise<Message[]> {
  const res = await pool.query<Message>(
    `SELECT * FROM messages WHERE conversation_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit],
  );
  return res.rows.reverse();
}

export async function insertHumanMessage(
  conversationId: number,
  content: string,
): Promise<Message> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<Message>(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'human', $2) RETURNING *`,
      [conversationId, content],
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
  conversationId: number,
  mode: ConversationMode,
): Promise<void> {
  await pool.query(`UPDATE conversations SET mode = $2 WHERE id = $1`, [
    conversationId,
    mode,
  ]);
}

export async function getConnectionState(): Promise<ConnectionState> {
  const res = await pool.query<ConnectionState>(
    `SELECT * FROM connection_state WHERE id = 1`,
  );
  return res.rows[0];
}

export async function setConnectionState(patch: {
  phone?: string | null;
  last_webhook_at?: string | null;
}): Promise<void> {
  const columns = Object.keys(patch) as (keyof typeof patch)[];
  if (columns.length === 0) return;

  const setClauses = columns.map((col, i) => `${col} = $${i + 1}`);
  const values = columns.map((col) => patch[col]);

  await pool.query(
    `UPDATE connection_state SET ${setClauses.join(", ")}, updated_at = now() WHERE id = 1`,
    values,
  );
}

export async function deleteConversation(id: number): Promise<void> {
  await pool.query(`DELETE FROM conversations WHERE id = $1`, [id]);
}
