const Payment = require('../models/Payment');
const logger = require('../utils/logger');

const allowedTransitions = {
  PROCESSING: new Set(['SUCCESS', 'FAILED']),
  PENDING: new Set(['FAILED'])
};

class WebhookService {
  constructor({
    paymentModel = Payment
  } = {}) {
    this.paymentModel = paymentModel;
  }

  async handleWebhook(gatewayReference, status, payload = {}) {
    try {
      logger.info('WEBHOOK_RECEIVED', {
        gatewayReference,
        status
      });

      const payment = await this.paymentModel.findOne({ gatewayReference });

      if (!payment) {
        logger.warn('Webhook received for unknown gateway reference', { gatewayReference, status });
        return { received: true, ignored: true, reason: 'UNKNOWN_REFERENCE' };
      }

      if (payment.webhookReceivedAt && payment.status === status) {
        logger.info('WEBHOOK_DUPLICATE', { gatewayReference });
        return { received: true, duplicate: true };
      }

      const validTargets = allowedTransitions[payment.status];
      if (!validTargets || !validTargets.has(status)) {
        if (payment.status !== status) {
          logger.warn('WEBHOOK_CONFLICT', {
            gatewayReference,
            dbStatus: payment.status,
            webhookStatus: status
          });
          return { received: true, ignored: true, reason: 'CONFLICT' };
        }

        return { received: true, ignored: true, reason: 'NO_STATE_CHANGE' };
      }

      const update = {
        status,
        webhookPayload: payload,
        webhookReceivedAt: new Date()
      };

      if (status === 'SUCCESS' && !payment.processedAt) {
        update.processedAt = new Date();
      }

      if (status === 'FAILED') {
        update.failureReason = payload.reason || 'WEBHOOK_FAILED';
      } else {
        update.failureReason = null;
      }

      await this.paymentModel.findOneAndUpdate(
        { paymentId: payment.paymentId },
        {
          $set: update,
          $inc: {
            version: 1
          }
        }
      );

      return { received: true, updated: true };
    } catch (error) {
      logger.error('Webhook processing failed', {
        gatewayReference,
        status,
        error: error.message
      });
      return { received: true, ignored: true, reason: 'INTERNAL_ERROR' };
    }
  }
}

module.exports = {
  WebhookService,
  webhookService: new WebhookService()
};
