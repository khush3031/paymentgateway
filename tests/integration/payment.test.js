jest.mock('ioredis', () => require('ioredis-mock'));

const mockEnqueuePaymentJob = jest.fn().mockResolvedValue({ id: 'job-1' });

jest.mock('../../src/config/queue', () => ({
  QUEUE_NAME: 'payment-processing',
  enqueuePaymentJob: mockEnqueuePaymentJob,
  closeQueueResources: jest.fn(),
  getQueueConnection: jest.fn(),
  getPaymentQueueEvents: jest.fn()
}));

const request = require('supertest');
const Payment = require('../../src/models/Payment');
const {
  connectTestDatabase,
  clearTestDatabase,
  disconnectTestDatabase
} = require('../helpers/testDb');
const { app } = require('../../src/app');

describe('Payment API', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  beforeEach(async () => {
    mockEnqueuePaymentJob.mockClear();
    mockEnqueuePaymentJob.mockResolvedValue({ id: 'job-1' });
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  test('POST /payments → 202 with paymentId and PENDING status', async () => {
    const response = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', 'idem-create-1')
      .send({
        amount: 500,
        currency: 'USD',
        userId: 'user-1'
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      paymentId: expect.any(String),
      status: 'PENDING'
    });

    const payment = await Payment.findOne({ paymentId: response.body.paymentId }).lean();
    expect(payment).toBeTruthy();
    expect(mockEnqueuePaymentJob).toHaveBeenCalledTimes(1);
  });

  test('Missing Idempotency-Key → 400', async () => {
    const response = await request(app).post('/api/v1/payments').send({
      amount: 500,
      currency: 'USD',
      userId: 'user-1'
    });

    expect(response.status).toBe(400);
  });

  test('Invalid amount (negative) → 400', async () => {
    const response = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', 'idem-invalid-amount')
      .send({
        amount: -10,
        currency: 'USD',
        userId: 'user-1'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  test('Invalid currency → 400', async () => {
    const response = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', 'idem-invalid-currency')
      .send({
        amount: 10,
        currency: 'AUD',
        userId: 'user-1'
      });

    expect(response.status).toBe(400);
  });

  test('Same Idempotency-Key twice → returns same response, no duplicate payment', async () => {
    const payload = {
      amount: 99,
      currency: 'USD',
      userId: 'user-2'
    };

    const firstResponse = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', 'idem-same-key')
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', 'idem-same-key')
      .send(payload);

    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(202);
    expect(secondResponse.body.paymentId).toBe(firstResponse.body.paymentId);

    const count = await Payment.countDocuments({ idempotencyKey: 'idem-same-key' });
    expect(count).toBe(1);
  });

  test('GET /payments/:paymentId → 200 with correct data', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'user-3'
    });

    const response = await request(app).get(`/api/v1/payments/${payment.paymentId}`);

    expect(response.status).toBe(200);
    expect(response.body.paymentId).toBe(payment.paymentId);
  });

  test('GET /payments/:paymentId (not found) → 404', async () => {
    const response = await request(app).get('/api/v1/payments/unknown-payment');

    expect(response.status).toBe(404);
  });

  test('GET /payments with filters (status, userId) → paginated results', async () => {
    await Payment.insertMany([
      { amount: 10, currency: 'USD', userId: 'filter-user', status: 'SUCCESS' },
      { amount: 20, currency: 'USD', userId: 'filter-user', status: 'SUCCESS' },
      { amount: 30, currency: 'USD', userId: 'other-user', status: 'FAILED' }
    ]);

    const response = await request(app).get(
      '/api/v1/payments?status=SUCCESS&userId=filter-user&page=1&limit=1'
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.payments).toHaveLength(1);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(1);
  });

  test('Concurrent requests with same paymentId → one succeeds, one gets 409', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'retry-user',
      status: 'FAILED',
      failureReason: 'DECLINED'
    });

    const [first, second] = await Promise.all([
      request(app).post(`/api/v1/payments/${payment.paymentId}/retry`),
      request(app).post(`/api/v1/payments/${payment.paymentId}/retry`)
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([202, 409]);
    expect(mockEnqueuePaymentJob).toHaveBeenCalledTimes(1);
  });

  test('POST /payments/:paymentId/retry on FAILED payment → 202', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'retry-user',
      status: 'FAILED',
      failureReason: 'DECLINED'
    });

    const response = await request(app).post(`/api/v1/payments/${payment.paymentId}/retry`);

    expect(response.status).toBe(202);
    expect(response.body.paymentId).toBe(payment.paymentId);
  });

  test('POST /payments/:paymentId/retry on SUCCESS payment → 409', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'retry-user',
      status: 'SUCCESS',
      gatewayReference: 'gw_success'
    });

    const response = await request(app).post(`/api/v1/payments/${payment.paymentId}/retry`);

    expect(response.status).toBe(409);
  });
});
