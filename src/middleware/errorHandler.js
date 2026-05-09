const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

const errorHandler = (error, req, res, next) => {
  const normalizedError =
    error instanceof AppError
      ? error
      : new AppError(error.message || 'Internal server error', 500, 'INTERNAL_ERROR');

  const logPayload = {
    path: req.originalUrl,
    method: req.method,
    error: normalizedError.errorCode,
    message: normalizedError.message
  };

  if (normalizedError.statusCode >= 500) {
    logger.error('Unhandled application error', logPayload);
  } else {
    logger.warn('Handled application error', logPayload);
  }

  const body = {
    error: normalizedError.errorCode,
    message: normalizedError.message
  };

  if (process.env.NODE_ENV !== 'production' && normalizedError.stack) {
    body.stack = normalizedError.stack;
  }

  res.status(normalizedError.statusCode).json(body);
};

module.exports = errorHandler;
