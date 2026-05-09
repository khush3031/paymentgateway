jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../../src/config/queue', () => ({
  QUEUE_NAME: 'payment-processing',
  enqueuePaymentJob: jest.fn(),
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

describe('Webhook API', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  test('Valid webhook SUCCESS → 200, payment status updated', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'webhook-user',
      status: 'PROCESSING',
      gatewayReference: 'gw-webhook-success'
    });

    const response = await request(app).post('/api/v1/webhooks/payment').send({
      gatewayReference: payment.gatewayReference,
      status: 'SUCCESS',
      payload: { source: 'gateway' }
    });

    expect(response.status).toBe(200);
    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(updated.status).toBe('SUCCESS');
    expect(updated.webhookReceivedAt).toBeTruthy();
  });

  test('Valid webhook FAILED → 200, payment status updated', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'webhook-user',
      status: 'PENDING',
      gatewayReference: 'gw-webhook-failed'
    });

    const response = await request(app).post('/api/v1/webhooks/payment').send({
      gatewayReference: payment.gatewayReference,
      status: 'FAILED',
      payload: { reason: 'DECLINED' }
    });

    expect(response.status).toBe(200);
    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(updated.status).toBe('FAILED');
  });

  test('Duplicate webhook (same gatewayRef + status) → 200, no state change', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'webhook-user',
      status: 'SUCCESS',
      gatewayReference: 'gw-webhook-duplicate',
      webhookReceivedAt: new Date()
    });

    const response = await request(app).post('/api/v1/webhooks/payment').send({
      gatewayReference: payment.gatewayReference,
      status: 'SUCCESS',
      payload: { source: 'gateway' }
    });

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
  });

  test('Unknown gatewayReference → 200 (graceful ignore)', async () => {
    const response = await request(app).post('/api/v1/webhooks/payment').send({
      gatewayReference: 'gw-unknown',
      status: 'SUCCESS',
      payload: {}
    });

    expect(response.status).toBe(200);
    expect(response.body.ignored).toBe(true);
  });

  test('Conflicting webhook (SUCCESS→FAILED) → 200, ignored, conflict logged', async () => {
    const payment = await Payment.create({
      amount: 100,
      currency: 'USD',
      userId: 'webhook-user',
      status: 'SUCCESS',
      gatewayReference: 'gw-webhook-conflict'
    });

    const response = await request(app).post('/api/v1/webhooks/payment').send({
      gatewayReference: payment.gatewayReference,
      status: 'FAILED',
      payload: { reason: 'REVERSAL' }
    });

    expect(response.status).toBe(200);
    const updated = await Payment.findOne({ paymentId: payment.paymentId }).lean();
    expect(updated.status).toBe('SUCCESS');
    expect(response.body.ignored).toBe(true);
  });

  test('Invalid webhook payload → 400', async () => {
    const response = await request(app).post('/api/v1/webhooks/payment').send({
      gatewayReference: '',
      status: 'UNKNOWN'
    });

    expect(response.status).toBe(400);
  });
});
