const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');

const createRateLimiter = () => {
  if (process.env.NODE_ENV === 'test') {
    return rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
      max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
      keyGenerator: (req) => req.headers['x-user-id'] || req.ip
    });
  }

  const redisClient = getRedisClient();

  return rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args)
    })
  });
};

module.exports = createRateLimiter;
