const { Redis } = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

async function enqueueInbox(message) {
  await redis.lpush("inbox", JSON.stringify(message));
}

module.exports = { enqueueInbox };
