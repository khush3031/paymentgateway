const Payment = require('../models/Payment');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

const NON_RETRYABLE_ERRORS = new Set(['DECLINED', 'INVALID_INPUT', 'DUPLICATE']);
const RETRYABLE_ERRORS = new Set(['TIMEOUT', 'GATEWAY_TIMEOUT', 'GATEWAY_UNAVAILABLE', 'NETWORK_ERROR']);

class RetryService {
  constructor({
    paymentModel = Payment,
    maxRetryAttempts = Number(process.env.MAX_RETRY_ATTEMPTS || 3),
    baseDelayMs = Number(process.env.RETRY_BASE_DELAY_MS || 1000),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = () => Math.floor(Math.random() * 1001)
  } = {}) {
    this.paymentModel = paymentModel;
    this.maxRetryAttempts = maxRetryAttempts;
    this.baseDelayMs = baseDelayMs;
    this.sleep = sleep;
    this.random = random;
  }

  async executeWithRetry(paymentId, fn) {
    let retryAttempt = 0;

    while (true) {
      try {
        logger.info('GATEWAY_REQUEST', {
          paymentId,
          attempt: retryAttempt + 1
        });

        const result = await fn(retryAttempt + 1);

        if (result && result.success === false) {
          throw new AppError('Payment declined', 402, result.reason || 'DECLINED');
        }

        logger.info('GATEWAY_RESPONSE', {
          paymentId,
          success: true,
          processingTime: result.processingTime,
          gatewayRef: result.gatewayReference
        });
        return result;
      } catch (error) {
        const errorCode = this.normalizeErrorCode(error);
        logger.warn('GATEWAY_RESPONSE', {
          paymentId,
          success: false,
          processingTime: error.metadata?.processingTime,
          gatewayRef: error.metadata?.gatewayReference,
          error: errorCode
        });

        if (NON_RETRYABLE_ERRORS.has(errorCode)) {
          await this.markPaymentFailed(paymentId, errorCode);
          throw error;
        }

        if (!RETRYABLE_ERRORS.has(errorCode)) {
          await this.markPaymentFailed(paymentId, errorCode);
          throw error;
        }

        if (retryAttempt >= this.maxRetryAttempts) {
          await this.markPaymentFailed(paymentId, errorCode);
          throw error;
        }

        retryAttempt += 1;
        const delay = this.baseDelayMs * (2 ** retryAttempt) + this.random();

        await this.paymentModel.findOneAndUpdate(
          { paymentId },
          {
            $set: {
              retryCount: retryAttempt,
              lastRetryAt: new Date()
            },
            $inc: {
              version: 1
            }
          }
        );

        logger.warn('RETRY_ATTEMPT', {
          paymentId,
          attempt: retryAttempt,
          delay,
          error: errorCode
        });

        await this.sleep(delay);
      }
    }
  }

  normalizeErrorCode(error) {
    if (!error) {
      return 'UNKNOWN_ERROR';
    }
    if (error.errorCode) {
      return error.errorCode;
    }
    if (error.reason) {
      return error.reason;
    }
    return 'UNKNOWN_ERROR';
  }

  async markPaymentFailed(paymentId, reason) {
    await this.paymentModel.findOneAndUpdate(
      { paymentId },
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
}

module.exports = {
  RetryService,
  retryService: new RetryService()
};
