const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function markWebhookReceived(phone) {
  await pool.query(
    `UPDATE connection_state SET phone = $1, last_webhook_at = now(), updated_at = now() WHERE id = 1`,
    [phone],
  );
}

module.exports = { markWebhookReceived };
