const Payment = require('../../src/models/Payment');
const { RetryService } = require('../../src/services/retryService');
const { GatewayTimeoutError, GatewayUnavailableError } = require('../../src/utils/AppError');
const {
  connectTestDatabase,
  clearTestDatabase,
  disconnectTestDatabase
} = require('../helpers/testDb');

describe('RetryService', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  const createPayment = () =>
    Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'retry-user',
      status: 'PENDING'
    });

  test('Succeeds on first attempt with no retries', async () => {
    const payment = await createPayment();
    const retryService = new RetryService({
      paymentModel: Payment,
      sleep: jest.fn().mockResolvedValue(),
      random: () => 0
    });
    const fn = jest.fn().mockResolvedValue({
      success: true,
      gatewayReference: 'gw_success',
      processingTime: 10
    });

    const result = await retryService.executeWithRetry(payment.paymentId, fn);
    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();

    expect(result.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(updated.retryCount).toBe(0);
  });

  test('Retries on TIMEOUT errors up to MAX_RETRY_ATTEMPTS', async () => {
    const payment = await createPayment();
    const retryService = new RetryService({
      paymentModel: Payment,
      maxRetryAttempts: 3,
      baseDelayMs: 1,
      sleep: jest.fn().mockResolvedValue(),
      random: () => 0
    });

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new GatewayTimeoutError('Timeout'))
      .mockRejectedValueOnce(new GatewayTimeoutError('Timeout'))
      .mockRejectedValueOnce(new GatewayTimeoutError('Timeout'))
      .mockResolvedValue({
        success: true,
        gatewayReference: 'gw_after_retry',
        processingTime: 5
      });

    const result = await retryService.executeWithRetry(payment.paymentId, fn);
    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();

    expect(result.gatewayReference).toBe('gw_after_retry');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(updated.retryCount).toBe(3);
  });

  test('Does NOT retry on DECLINED (non-retryable)', async () => {
    const payment = await createPayment();
    const retryService = new RetryService({
      paymentModel: Payment,
      sleep: jest.fn().mockResolvedValue(),
      random: () => 0
    });

    const fn = jest.fn().mockResolvedValue({
      success: false,
      reason: 'DECLINED',
      processingTime: 3
    });

    await expect(retryService.executeWithRetry(payment.paymentId, fn)).rejects.toMatchObject({
      errorCode: 'DECLINED'
    });

    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(updated.status).toBe('FAILED');
    expect(updated.failureReason).toBe('DECLINED');
  });

  test('Applies exponential backoff between retries', async () => {
    const payment = await createPayment();
    const delays = [];
    const retryService = new RetryService({
      paymentModel: Payment,
      maxRetryAttempts: 2,
      baseDelayMs: 100,
      sleep: async (ms) => delays.push(ms),
      random: () => 250
    });

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new GatewayTimeoutError('Timeout'))
      .mockRejectedValueOnce(new GatewayTimeoutError('Timeout'))
      .mockResolvedValue({
        success: true,
        gatewayReference: 'gw_backoff',
        processingTime: 2
      });

    await retryService.executeWithRetry(payment.paymentId, fn);

    expect(delays).toEqual([450, 650]);
  });

  test('Fails after all attempts exhausted', async () => {
    const payment = await createPayment();
    const retryService = new RetryService({
      paymentModel: Payment,
      maxRetryAttempts: 2,
      baseDelayMs: 1,
      sleep: jest.fn().mockResolvedValue(),
      random: () => 0
    });

    const fn = jest.fn().mockRejectedValue(new GatewayUnavailableError('Down'));

    await expect(retryService.executeWithRetry(payment.paymentId, fn)).rejects.toBeInstanceOf(
      GatewayUnavailableError
    );

    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(updated.status).toBe('FAILED');
    expect(updated.failureReason).toBe('GATEWAY_UNAVAILABLE');
  });

  test('Updates retryCount in DB between attempts', async () => {
    const payment = await createPayment();
    const retryService = new RetryService({
      paymentModel: Payment,
      maxRetryAttempts: 1,
      baseDelayMs: 1,
      sleep: jest.fn().mockResolvedValue(),
      random: () => 0
    });

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new GatewayTimeoutError('Timeout'))
      .mockResolvedValue({
        success: true,
        gatewayReference: 'gw_once',
        processingTime: 4
      });

    await retryService.executeWithRetry(payment.paymentId, fn);

    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(updated.retryCount).toBe(1);
    expect(updated.lastRetryAt).toBeTruthy();
  });
});
