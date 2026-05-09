class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', metadata = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.metadata = metadata;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', metadata = {}) {
    super(message, 400, 'VALIDATION_ERROR', metadata);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', metadata = {}) {
    super(message, 404, 'NOT_FOUND', metadata);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', metadata = {}) {
    super(message, 409, 'CONFLICT', metadata);
  }
}

class ConcurrentProcessingError extends AppError {
  constructor(message = 'Payment is already being processed', metadata = {}) {
    super(message, 409, 'CONCURRENT_PROCESSING', metadata);
  }
}

class AlreadyProcessedError extends AppError {
  constructor(message = 'Payment has already been processed', metadata = {}) {
    super(message, 409, 'ALREADY_PROCESSED', metadata);
  }
}

class GatewayTimeoutError extends AppError {
  constructor(message = 'Gateway request timed out', metadata = {}) {
    super(message, 504, 'GATEWAY_TIMEOUT', metadata);
  }
}

class GatewayUnavailableError extends AppError {
  constructor(message = 'Gateway is unavailable', metadata = {}) {
    super(message, 503, 'GATEWAY_UNAVAILABLE', metadata);
  }
}

class CircuitOpenError extends AppError {
  constructor(message = 'Circuit breaker is open', metadata = {}) {
    super(message, 503, 'CIRCUIT_OPEN', metadata);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ConcurrentProcessingError,
  AlreadyProcessedError,
  GatewayTimeoutError,
  GatewayUnavailableError,
  CircuitOpenError
};
