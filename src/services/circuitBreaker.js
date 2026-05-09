const logger = require('../utils/logger');
const { CircuitOpenError } = require('../utils/AppError');

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  constructor({
    failureThreshold = Number(process.env.CIRCUIT_BREAKER_THRESHOLD || 5),
    resetTimeout = Number(process.env.CIRCUIT_BREAKER_RESET_MS || 30000),
    now = () => Date.now()
  } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.now = now;
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureAt = null;
    this.nextAttemptAt = null;
    this.halfOpenInFlight = false;
  }

  async execute(fn) {
    this.advanceStateIfReady();

    if (this.state === STATES.OPEN) {
      throw new CircuitOpenError('Circuit breaker is open', this.getState());
    }

    if (this.state === STATES.HALF_OPEN && this.halfOpenInFlight) {
      throw new CircuitOpenError('Circuit breaker is testing recovery', this.getState());
    }

    const isHalfOpenProbe = this.state === STATES.HALF_OPEN;
    if (isHalfOpenProbe) {
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      if (isHalfOpenProbe) {
        this.transition(STATES.CLOSED, 'HALF_OPEN_TO_CLOSED', 'Probe request succeeded');
      } else {
        this.failureCount = 0;
        this.lastFailureAt = null;
        this.nextAttemptAt = null;
      }
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    } finally {
      if (isHalfOpenProbe) {
        this.halfOpenInFlight = false;
      }
    }
  }

  recordFailure(error) {
    this.failureCount += 1;
    this.lastFailureAt = this.now();

    if (this.state === STATES.HALF_OPEN) {
      this.openCircuit('HALF_OPEN_TO_OPEN', error.message);
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.openCircuit('CLOSED_TO_OPEN', error.message);
    }
  }

  openCircuit(transition, reason) {
    this.state = STATES.OPEN;
    this.nextAttemptAt = this.lastFailureAt + this.resetTimeout;
    logger.warn('CIRCUIT_BREAKER', {
      state: this.state,
      transition,
      reason
    });
  }

  advanceStateIfReady() {
    if (this.state === STATES.OPEN && this.nextAttemptAt && this.now() >= this.nextAttemptAt) {
      this.transition(STATES.HALF_OPEN, 'OPEN_TO_HALF_OPEN', 'Reset timeout elapsed');
    }
  }

  transition(nextState, transition, reason) {
    this.state = nextState;
    if (nextState === STATES.CLOSED) {
      this.failureCount = 0;
      this.lastFailureAt = null;
      this.nextAttemptAt = null;
    }
    if (nextState === STATES.HALF_OPEN) {
      this.nextAttemptAt = null;
    }
    logger.info('CIRCUIT_BREAKER', {
      state: this.state,
      transition,
      reason
    });
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureAt: this.lastFailureAt,
      nextAttemptAt: this.nextAttemptAt
    };
  }

  reset() {
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureAt = null;
    this.nextAttemptAt = null;
    this.halfOpenInFlight = false;
    logger.info('CIRCUIT_BREAKER', {
      state: this.state,
      transition: 'MANUAL_RESET',
      reason: 'Circuit breaker manually reset'
    });
  }
}

module.exports = {
  STATES,
  CircuitBreaker,
  paymentCircuitBreaker: new CircuitBreaker()
};
