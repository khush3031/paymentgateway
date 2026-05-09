const { v4: uuidv4 } = require('uuid');
const {
  AppError,
  GatewayTimeoutError,
  GatewayUnavailableError
} = require('../utils/AppError');

class GatewaySimulator {
  constructor({
    timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS || 5000),
    random = Math.random,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    this.timeoutMs = timeoutMs;
    this.random = random;
    this.sleep = sleep;
  }

  async processPayment(paymentId, amount, currency, simulation = {}) {
    const startTime = Date.now();
    const outcome = simulation.forceOutcome || this.resolveOutcome();

    if (outcome === 'TIMEOUT') {
      await this.sleep(simulation.timeoutMs || this.timeoutMs);
      throw new GatewayTimeoutError('Gateway request timed out', {
        paymentId,
        amount,
        currency,
        processingTime: Date.now() - startTime
      });
    }

    if (outcome === 'UNAVAILABLE') {
      await this.sleep(simulation.processingDelayMs || 100);
      throw new GatewayUnavailableError('Gateway is unavailable', {
        paymentId,
        amount,
        currency,
        processingTime: Date.now() - startTime
      });
    }

    if (outcome === 'DECLINED') {
      await this.sleep(simulation.processingDelayMs || 150);
      return {
        success: false,
        reason: 'DECLINED',
        processingTime: Date.now() - startTime
      };
    }

    if (outcome === 'DELAYED_SUCCESS') {
      const delay = simulation.processingDelayMs || this.randomBetween(2000, 4000);
      await this.sleep(delay);
      return {
        success: true,
        gatewayReference: simulation.gatewayReference || this.createGatewayReference(paymentId),
        processingTime: Date.now() - startTime
      };
    }

    if (outcome === 'NETWORK_ERROR') {
      await this.sleep(simulation.processingDelayMs || 100);
      throw new AppError('Gateway network error', 503, 'NETWORK_ERROR', {
        paymentId,
        amount,
        currency,
        processingTime: Date.now() - startTime
      });
    }

    const delay = simulation.processingDelayMs || this.randomBetween(200, 800);
    await this.sleep(delay);
    return {
      success: true,
      gatewayReference: simulation.gatewayReference || this.createGatewayReference(paymentId),
      processingTime: Date.now() - startTime
    };
  }

  resolveOutcome() {
    const chance = this.random() * 100;
    if (chance < 2) {
      return 'TIMEOUT';
    }
    if (chance < 5) {
      return 'UNAVAILABLE';
    }
    if (chance < 15) {
      return 'DECLINED';
    }
    if (chance < 20) {
      return 'DELAYED_SUCCESS';
    }
    return 'SUCCESS';
  }

  randomBetween(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  createGatewayReference(paymentId) {
    return `gw_${paymentId}_${uuidv4()}`;
  }
}

module.exports = {
  GatewaySimulator,
  gatewaySimulator: new GatewaySimulator()
};
