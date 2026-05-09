const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;
let subscriberClient;

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
    redisClient.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
    });
  }

  return redisClient;
};

const getRedisSubscriber = () => {
  if (!subscriberClient) {
    subscriberClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
    subscriberClient.on('error', (error) => {
      logger.error('Redis subscriber error', { error: error.message });
    });
  }

  return subscriberClient;
};

const closeRedisConnections = async () => {
  const tasks = [];
  if (redisClient) {
    tasks.push(redisClient.quit().catch(() => redisClient.disconnect()));
    redisClient = null;
  }
  if (subscriberClient) {
    tasks.push(subscriberClient.quit().catch(() => subscriberClient.disconnect()));
    subscriberClient = null;
  }
  await Promise.all(tasks);
};

module.exports = {
  getRedisClient,
  getRedisSubscriber,
  closeRedisConnections
};
