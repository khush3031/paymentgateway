process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3001';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/payment_system_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.MAX_RETRY_ATTEMPTS = process.env.MAX_RETRY_ATTEMPTS || '3';
process.env.RETRY_BASE_DELAY_MS = process.env.RETRY_BASE_DELAY_MS || '10';
process.env.GATEWAY_TIMEOUT_MS = process.env.GATEWAY_TIMEOUT_MS || '50';
process.env.CIRCUIT_BREAKER_THRESHOLD = process.env.CIRCUIT_BREAKER_THRESHOLD || '5';
process.env.CIRCUIT_BREAKER_RESET_MS = process.env.CIRCUIT_BREAKER_RESET_MS || '100';
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || '1000';

jest.setTimeout(30000);
