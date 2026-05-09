const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const {
  QUEUE_NAME,
  getQueueConnection,
  getPaymentQueueEvents,
  registerFallbackProcessor,
  enableInlineMode,
  getInlineModeReason
} = require('../config/queue');
const { paymentService } = require('../services/paymentService');

let paymentWorker;
let queueEvents;

const processJob = async ({ paymentId, lockValue, jobId = 'inline-job' }) => {
  logger.info('Payment worker job started', {
    jobId,
    paymentId
  });

  try {
    await paymentService.processPayment(paymentId, lockValue);
    logger.info('Payment worker job completed', {
      jobId,
      paymentId
    });
  } catch (error) {
    await paymentService.markPaymentFailedIfProcessing(paymentId, error.errorCode || error.message);
    logger.error('Payment worker job failed', {
      jobId,
      paymentId,
      error: error.message
    });
    throw error;
  }
};

const detectLegacyRedis = async () => {
  const info = await getQueueConnection().info('server');
  const match = info.match(/redis_version:(\d+)\.(\d+)\.(\d+)/i);
  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  return major < 5;
};

const startPaymentWorker = async () => {
  if (paymentWorker) {
    return paymentWorker;
  }

  registerFallbackProcessor(processJob);

  try {
    if (await detectLegacyRedis()) {
      enableInlineMode('Redis server version is below 5.0.0; using inline queue fallback');
      return { mode: 'inline', reason: getInlineModeReason() };
    }
  } catch (error) {
    logger.warn('Unable to detect Redis compatibility ahead of worker startup', {
      error: error.message
    });
  }

  paymentWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processJob({
        paymentId: job.data.paymentId,
        lockValue: job.data.lockValue,
        jobId: job.id
      });
    },
    {
      connection: getQueueConnection(),
      concurrency: 5,
      skipVersionCheck: true
    }
  );

  paymentWorker.on('error', (error) => {
    logger.error('Payment worker error', { error: error.message });
  });

  queueEvents = getPaymentQueueEvents();
  if (queueEvents) {
    queueEvents.on('completed', ({ jobId }) => {
      logger.info('Queue job completed', { jobId });
    });
    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.warn('Queue job failed', { jobId, reason: failedReason });
    });
  }

  return paymentWorker;
};

const stopPaymentWorker = async () => {
  const tasks = [];
  if (queueEvents) {
    tasks.push(queueEvents.close());
    queueEvents = null;
  }
  if (paymentWorker) {
    tasks.push(paymentWorker.close());
    paymentWorker = null;
  }
  await Promise.all(tasks);
};

module.exports = {
  startPaymentWorker,
  stopPaymentWorker
};
