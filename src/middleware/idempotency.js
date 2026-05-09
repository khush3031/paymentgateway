const IdempotencyKey = require('../models/IdempotencyKey');

const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.header('Idempotency-Key');

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Idempotency-Key header is required'
    });
  }

  const existingRecord = await IdempotencyKey.findOne({ key: idempotencyKey }).lean();
  if (existingRecord?.response) {
    return res.status(existingRecord.statusCode).json(existingRecord.response);
  }

  req.idempotencyKey = idempotencyKey;

  const originalJson = res.json.bind(res);
  let responseBody;

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', async () => {
    if (!req.idempotencyKey || !responseBody?.paymentId || res.statusCode >= 500) {
      return;
    }

    try {
      await IdempotencyKey.findOneAndUpdate(
        { key: req.idempotencyKey },
        {
          $setOnInsert: {
            key: req.idempotencyKey,
            paymentId: responseBody.paymentId,
            response: responseBody,
            statusCode: res.statusCode
          }
        },
        {
          upsert: true
        }
      );
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to persist idempotency key', error);
      }
    }
  });

  next();
};

module.exports = idempotencyMiddleware;
