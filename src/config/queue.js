const { Queue, QueueEvents } = require('bullmq');
const { getRedisClient } = require('./redis');
const logger = require('../utils/logger');

const QUEUE_NAME = 'payment-processing';

let paymentQueue;
let paymentQueueEvents;
let fallbackProcessor;
let inlineModeReason = null;

const getQueueConnection = () => getRedisClient();

const isCompatibilityError = (error) => {
  const message = error?.message || '';
  return (
    message.includes('Redis version needs to be greater or equal') ||
    message.includes('unknown command') ||
    message.includes('Unknown Redis command called from Lua script') ||
    message.includes('xread')
  );
};

const enableInlineMode = (reason) => {
  if (!inlineModeReason) {
    inlineModeReason = reason;
    logger.warn('Queue compatibility fallback enabled', { reason });
  }
};

const getPaymentQueue = () => {
  if (inlineModeReason) {
    return null;
  }

  if (!paymentQueue) {
    paymentQueue = new Queue(QUEUE_NAME, {
      connection: getQueueConnection(),
      skipVersionCheck: true
    });
  }

  return paymentQueue;
};

const getPaymentQueueEvents = () => {
  if (inlineModeReason) {
    return null;
  }

  if (!paymentQueueEvents) {
    paymentQueueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getQueueConnection(),
      skipVersionCheck: true
    });
  }

  return paymentQueueEvents;
};

const enqueuePaymentJob = async ({ paymentId, lockValue }) => {
  if (inlineModeReason) {
    return enqueueInlineJob({ paymentId, lockValue });
  }

  try {
    return await getPaymentQueue().add(
      'process-payment',
      { paymentId, lockValue },
      {
        attempts: 1,
        timeout: 60000,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 }
      }
    );
  } catch (error) {
    if (isCompatibilityError(error) && fallbackProcessor) {
      enableInlineMode(error.message);
      return enqueueInlineJob({ paymentId, lockValue });
    }
    throw error;
  }
};

const closeQueueResources = async () => {
  const tasks = [];
  if (paymentQueueEvents) {
    tasks.push(paymentQueueEvents.close());
    paymentQueueEvents = null;
  }
  if (paymentQueue) {
    tasks.push(paymentQueue.close());
    paymentQueue = null;
  }
  await Promise.all(tasks);
};

const registerFallbackProcessor = (processor) => {
  fallbackProcessor = processor;
};

const enqueueInlineJob = async ({ paymentId, lockValue }) => {
  if (!fallbackProcessor) {
    throw new Error('Inline queue processor is not registered');
  }

  const jobId = `inline-${Date.now()}-${paymentId}`;
  setImmediate(async () => {
    try {
      await fallbackProcessor({ paymentId, lockValue, jobId });
    } catch (error) {
      logger.error('Inline queue job failed', {
        jobId,
        paymentId,
        error: error.message
      });
    }
  });

  return { id: jobId, name: 'process-payment', data: { paymentId, lockValue } };
};

const getInlineModeReason = () => inlineModeReason;

module.exports = {
  QUEUE_NAME,
  getPaymentQueue,
  getPaymentQueueEvents,
  enqueuePaymentJob,
  closeQueueResources,
  getQueueConnection,
  registerFallbackProcessor,
  enableInlineMode,
  getInlineModeReason
};
