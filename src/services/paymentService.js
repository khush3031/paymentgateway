const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const IdempotencyKey = require('../models/IdempotencyKey');
const {
  AppError,
  NotFoundError,
  ConflictError,
  ConcurrentProcessingError,
  AlreadyProcessedError
} = require('../utils/AppError');
const logger = require('../utils/logger');
const { getRedisClient } = require('../config/redis');
const { enqueuePaymentJob } = require('../config/queue');
const { gatewaySimulator } = require('./gatewaySimulator');
const { retryService } = require('./retryService');
const { paymentCircuitBreaker } = require('./circuitBreaker');

const LOCK_TTL_MS = 30000;
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

class PaymentService {
  constructor({
    paymentModel = Payment,
    idempotencyModel = IdempotencyKey,
    redis = getRedisClient(),
    queueProducer = enqueuePaymentJob,
    gateway = gatewaySimulator,
    retryExecutor = retryService,
    circuitBreaker = paymentCircuitBreaker
  } = {}) {
    this.paymentModel = paymentModel;
    this.idempotencyModel = idempotencyModel;
    this.redis = redis;
    this.queueProducer = queueProducer;
    this.gateway = gateway;
    this.retryExecutor = retryExecutor;
    this.circuitBreaker = circuitBreaker;
  }

  async initiatePayment(data, idempotencyKey) {
    if (idempotencyKey) {
      const cachedRecord = await this.idempotencyModel.findOne({ key: idempotencyKey }).lean();
      if (cachedRecord?.response) {
        return cachedRecord.response;
      }
    }

    let payment;
    try {
      payment = await this.paymentModel.create({
        ...data,
        idempotencyKey
      });
    } catch (error) {
      if (error?.code === 11000 && idempotencyKey) {
        const existingPayment = await this.paymentModel.findOne({ idempotencyKey }).lean();
        if (existingPayment) {
          return {
            paymentId: existingPayment.paymentId,
            status: existingPayment.status,
            message:
              existingPayment.status === 'FAILED'
                ? 'Payment already processed'
                : 'Payment queued for processing'
          };
        }
      }
      throw error;
    }

    logger.info('PAYMENT_INITIATED', {
      paymentId: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      userId: payment.userId
    });

    const lockValue = await this.acquireLock(payment.paymentId);
    try {
      await this.queueProducer({
        paymentId: payment.paymentId,
        lockValue
      });
    } catch (error) {
      await this.releaseLock(payment.paymentId, lockValue);
      throw error;
    }

    return {
      paymentId: payment.paymentId,
      status: 'PENDING',
      message: 'Payment queued for processing'
    };
  }

  async processPayment(paymentId, lockValue) {
    const payment = await this.paymentModel.findOne({ paymentId });
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.status !== 'PENDING') {
      throw new AlreadyProcessedError(`Payment is already ${payment.status}`);
    }

    const processingPayment = await this.paymentModel.findOneAndUpdate(
      {
        paymentId,
        status: 'PENDING',
        version: payment.version
      },
      {
        $set: {
          status: 'PROCESSING',
          failureReason: null
        },
        $inc: {
          version: 1
        }
      },
      {
        new: true
      }
    );

    if (!processingPayment) {
      throw new ConcurrentProcessingError('Payment version conflict while starting processing');
    }

    logger.info('PAYMENT_PROCESSING', {
      paymentId,
      retryCount: processingPayment.retryCount
    });

    try {
      const result = await this.circuitBreaker.execute(() =>
        this.retryExecutor.executeWithRetry(paymentId, () =>
          this.gateway.processPayment(
            processingPayment.paymentId,
            processingPayment.amount,
            processingPayment.currency,
            processingPayment.metadata?.gatewaySimulation || {}
          )
        )
      );

      const completedPayment = await this.paymentModel.findOneAndUpdate(
        { paymentId },
        {
          $set: {
            status: 'SUCCESS',
            gatewayReference: result.gatewayReference,
            processedAt: new Date(),
            failureReason: null
          },
          $inc: {
            version: 1
          }
        },
        { new: true }
      );

      logger.info('PAYMENT_SUCCESS', {
        paymentId,
        gatewayReference: completedPayment.gatewayReference,
        processedAt: completedPayment.processedAt
      });
      return completedPayment;
    } catch (error) {
      await this.paymentModel.findOneAndUpdate(
        { paymentId, status: { $in: ['PENDING', 'PROCESSING'] } },
        {
          $set: {
            status: 'FAILED',
            failureReason: error.errorCode || error.reason || error.message
          },
          $inc: {
            version: 1
          }
        }
      );

      logger.warn('PAYMENT_FAILED', {
        paymentId,
        reason: error.errorCode || error.reason || error.message,
        retryCount: processingPayment.retryCount
      });
      throw error;
    } finally {
      if (lockValue) {
        await this.releaseLock(paymentId, lockValue);
      }
    }
  }

  async getPaymentStatus(paymentId) {
    const payment = await this.paymentModel.findOne({ paymentId }).lean();
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    return payment;
  }

  async getAllPayments(filters = {}, pagination = {}) {
    const query = {};
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.userId) {
      query.userId = filters.userId;
    }

    const page = Math.max(Number(pagination.page) || 1, 1);
    const limit = Math.max(Number(pagination.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.paymentModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.paymentModel.countDocuments(query)
    ]);

    return {
      payments,
      total,
      page,
      limit
    };
  }

  async retryPayment(paymentId) {
    const payment = await this.paymentModel.findOne({ paymentId });
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.status !== 'FAILED') {
      throw new ConflictError(`Only FAILED payments can be retried. Current status: ${payment.status}`);
    }

    const updatedPayment = await this.paymentModel.findOneAndUpdate(
      {
        paymentId,
        status: 'FAILED',
        version: payment.version
      },
      {
        $set: {
          status: 'PENDING',
          failureReason: null,
          gatewayReference: null,
          processedAt: null,
          webhookPayload: null,
          webhookReceivedAt: null,
          retryCount: 0,
          lastRetryAt: null
        },
        $inc: {
          version: 1
        }
      },
      {
        new: true
      }
    );

    if (!updatedPayment) {
      throw new ConcurrentProcessingError('Payment version conflict while scheduling retry');
    }

    const lockValue = await this.acquireLock(paymentId);
    try {
      await this.queueProducer({
        paymentId,
        lockValue
      });
    } catch (error) {
      await this.releaseLock(paymentId, lockValue);
      throw error;
    }

    return {
      paymentId,
      status: updatedPayment.status,
      message: 'Payment queued for retry'
    };
  }

  async markPaymentFailedIfProcessing(paymentId, reason) {
    await this.paymentModel.findOneAndUpdate(
      {
        paymentId,
        status: 'PROCESSING'
      },
      {
        $set: {
          status: 'FAILED',
          failureReason: reason
        },
        $inc: {
          version: 1
        }
      }
    );
  }

  async acquireLock(paymentId) {
    const lockKey = this.getLockKey(paymentId);
    const lockValue = `${paymentId}:${uuidv4()}`;
    const result = await this.redis.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');
    if (result !== 'OK') {
      logger.warn('LOCK_FAILED', { paymentId });
      throw new ConcurrentProcessingError('Payment is already locked for processing');
    }
    logger.info('LOCK_ACQUIRED', { paymentId });
    return lockValue;
  }

  async releaseLock(paymentId, lockValue) {
    const lockKey = this.getLockKey(paymentId);
    await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
    logger.info('LOCK_RELEASED', { paymentId });
  }

  getLockKey(paymentId) {
    return `payment_lock:${paymentId}`;
  }
}

module.exports = {
  PaymentService,
  paymentService: new PaymentService()
};
