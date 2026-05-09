require('dotenv').config();

const mongoose = require('mongoose');
const Payment = require('./models/Payment');
const IdempotencyKey = require('./models/IdempotencyKey');

const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
const headers = {
  'Content-Type': 'application/json'
};

const results = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDb = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
};

const disconnectDb = async () => {
  await mongoose.disconnect();
};

const http = async (method, path, body, extraHeaders = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...extraHeaders
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let json = {};
  try {
    json = await response.json();
  } catch (error) {
    json = {};
  }

  return {
    status: response.status,
    body: json
  };
};

const record = (step, description, passed, details) => {
  results.push({
    step,
    description,
    result: passed ? 'PASS' : 'FAIL',
    details
  });
};

const pollPayment = async (paymentId, timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await http('GET', `/api/v1/payments/${paymentId}`);
    if (response.body.status === 'SUCCESS' || response.body.status === 'FAILED') {
      return response.body;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for payment ${paymentId}`);
};

const printSummary = () => {
  console.log('| Step | Description | Result | Details |');
  console.log('|------|-------------|--------|---------|');
  for (const row of results) {
    console.log(`| ${row.step} | ${row.description} | ${row.result} | ${row.details} |`);
  }
};

const main = async () => {
  try {
    await connectDb();
    await Payment.deleteMany({});
    await IdempotencyKey.deleteMany({});

    const happy = await http(
      'POST',
      '/api/v1/payments',
      {
        amount: 125,
        currency: 'USD',
        userId: 'selftest-happy',
        metadata: {
          gatewaySimulation: {
            forceOutcome: 'SUCCESS'
          }
        }
      },
      { 'Idempotency-Key': 'selftest-happy-path' }
    );
    const happyFinal = await pollPayment(happy.body.paymentId);
    record(
      1,
      'Happy path',
      happy.status === 202 && ['SUCCESS', 'FAILED'].includes(happyFinal.status),
      `paymentId=${happy.body.paymentId}, finalStatus=${happyFinal.status}`
    );

    const idemPayload = {
      amount: 200,
      currency: 'USD',
      userId: 'selftest-idem'
    };
    const idemFirst = await http('POST', '/api/v1/payments', idemPayload, {
      'Idempotency-Key': 'selftest-idem-key'
    });
    const idemSecond = await http('POST', '/api/v1/payments', idemPayload, {
      'Idempotency-Key': 'selftest-idem-key'
    });
    const idemCount = await Payment.countDocuments({ idempotencyKey: 'selftest-idem-key' });
    record(
      2,
      'Idempotency',
      idemFirst.body.paymentId === idemSecond.body.paymentId && idemCount === 1,
      `paymentId=${idemFirst.body.paymentId}, count=${idemCount}`
    );

    const retrySeed = await Payment.create({
      amount: 50,
      currency: 'USD',
      userId: 'selftest-concurrency',
      status: 'FAILED',
      failureReason: 'DECLINED'
    });
    const retryResponses = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        http('POST', `/api/v1/payments/${retrySeed.paymentId}/retry`)
      )
    );
    const successCount = retryResponses.filter((response) => response.status === 202).length;
    const conflictCount = retryResponses.filter((response) => response.status === 409).length;
    record(
      3,
      'Concurrency',
      successCount === 1 && conflictCount === 4,
      `accepted=${successCount}, conflicts=${conflictCount}`
    );

    const invalidNegative = await http(
      'POST',
      '/api/v1/payments',
      { amount: -1, currency: 'USD', userId: 'selftest-invalid' },
      { 'Idempotency-Key': 'selftest-invalid-negative' }
    );
    const invalidMissing = await http(
      'POST',
      '/api/v1/payments',
      { amount: 10, userId: 'selftest-invalid' },
      { 'Idempotency-Key': 'selftest-invalid-missing' }
    );
    record(
      4,
      'Invalid input',
      invalidNegative.status === 400 && invalidMissing.status === 400,
      `negative=${invalidNegative.status}, missing=${invalidMissing.status}`
    );

    const missingHeader = await http('POST', '/api/v1/payments', {
      amount: 10,
      currency: 'USD',
      userId: 'selftest-missing-header'
    });
    record(5, 'Missing Idempotency-Key header', missingHeader.status === 400, `status=${missingHeader.status}`);

    const webhookSeed = await Payment.create({
      amount: 75,
      currency: 'USD',
      userId: 'selftest-webhook',
      status: 'PROCESSING',
      gatewayReference: 'gw-selftest-webhook-success'
    });
    const webhookSuccess = await http('POST', '/api/v1/webhooks/payment', {
      gatewayReference: webhookSeed.gatewayReference,
      status: 'SUCCESS',
      payload: { source: 'selftest' }
    });
    const webhookUpdated = await Payment.findOne({ paymentId: webhookSeed.paymentId }).lean();
    record(
      6,
      'Webhook happy path',
      webhookSuccess.status === 200 && webhookUpdated.status === 'SUCCESS',
      `status=${webhookUpdated.status}`
    );

    const duplicateWebhook = await http('POST', '/api/v1/webhooks/payment', {
      gatewayReference: webhookSeed.gatewayReference,
      status: 'SUCCESS',
      payload: { source: 'selftest' }
    });
    record(
      7,
      'Duplicate webhook',
      duplicateWebhook.status === 200 && duplicateWebhook.body.duplicate === true,
      `duplicate=${duplicateWebhook.body.duplicate === true}`
    );

    const alreadySuccessSeed = await Payment.create({
      amount: 80,
      currency: 'USD',
      userId: 'selftest-webhook-conflict',
      status: 'SUCCESS',
      gatewayReference: 'gw-selftest-already-success'
    });
    const conflictWebhook = await http('POST', '/api/v1/webhooks/payment', {
      gatewayReference: alreadySuccessSeed.gatewayReference,
      status: 'SUCCESS',
      payload: { source: 'selftest' }
    });
    record(
      8,
      'Conflict webhook',
      conflictWebhook.status === 200 && conflictWebhook.body.ignored === true,
      `ignored=${conflictWebhook.body.ignored === true}`
    );

    const unknownWebhook = await http('POST', '/api/v1/webhooks/payment', {
      gatewayReference: 'gw-selftest-random-reference',
      status: 'FAILED',
      payload: {}
    });
    record(
      9,
      'Unknown gateway reference',
      unknownWebhook.status === 200 && unknownWebhook.body.ignored === true,
      `ignored=${unknownWebhook.body.ignored === true}`
    );

    const failedRetrySeed = await Payment.create({
      amount: 95,
      currency: 'USD',
      userId: 'selftest-retry',
      status: 'FAILED',
      failureReason: 'DECLINED'
    });
    const retryEndpoint = await http('POST', `/api/v1/payments/${failedRetrySeed.paymentId}/retry`);
    record(
      10,
      'Retry endpoint',
      retryEndpoint.status === 202,
      `status=${retryEndpoint.status}`
    );

    const retrySuccess = await http('POST', `/api/v1/payments/${happy.body.paymentId}/retry`);
    record(
      11,
      'Retry on SUCCESS',
      retrySuccess.status === 409,
      `status=${retrySuccess.status}`
    );

    const rateLimitResponses = await Promise.all(
      Array.from({ length: 110 }).map((_, index) =>
        http('GET', `/api/v1/payments?page=1&limit=1&_r=${index}`, null, {
          'x-user-id': 'selftest-rate-limit'
        })
      )
    );
    const tooMany = rateLimitResponses.filter((response) => response.status === 429).length;
    record(
      12,
      'Rate limit',
      tooMany > 0,
      `429_count=${tooMany}`
    );

    await Payment.insertMany(
      Array.from({ length: 15 }).map((_, index) => ({
        amount: 10 + index,
        currency: 'USD',
        userId: 'selftest-pagination',
        status: 'PENDING'
      }))
    );
    const pagination = await http('GET', '/api/v1/payments?userId=selftest-pagination&page=2&limit=5', null, {
      'x-user-id': 'selftest-pagination-view'
    });
    record(
      13,
      'Pagination',
      pagination.status === 200 &&
        pagination.body.payments.length === 5 &&
        pagination.body.page === 2 &&
        pagination.body.limit === 5,
      `count=${pagination.body.payments.length}, total=${pagination.body.total}`
    );

    const breakerStatuses = [];
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      const create = await http(
        'POST',
        '/api/v1/payments',
        {
          amount: 55 + attempt,
          currency: 'USD',
          userId: `selftest-breaker-${attempt}`,
          metadata: {
            gatewaySimulation: {
              forceOutcome: 'DECLINED'
            }
          }
        },
        { 'Idempotency-Key': `selftest-breaker-${attempt}` }
      );
      const finalState = await pollPayment(create.body.paymentId);
      breakerStatuses.push(finalState.failureReason);
    }
    record(
      14,
      'Circuit breaker',
      breakerStatuses[6] === 'CIRCUIT_OPEN',
      `reasons=${breakerStatuses.join(',')}`
    );

    printSummary();

    const failed = results.filter((result) => result.result === 'FAIL');
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Self-test failed to execute:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
};

main();
