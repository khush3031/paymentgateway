require('dotenv').config();

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { closeRedisConnections } = require('./config/redis');
const { closeQueueResources } = require('./config/queue');
const swaggerSpec = require('./config/swagger');
const createRateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const paymentRoutes = require('./routes/paymentRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const logger = require('./utils/logger');
const { startPaymentWorker, stopPaymentWorker } = require('./workers/paymentWorker');

const app = express();
let server;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'payment-system',
    status: 'ok'
  });
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', createRateLimiter());
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

app.use(errorHandler);

const startServer = async () => {
  await connectDatabase();
  if (process.env.NODE_ENV !== 'test') {
    await startPaymentWorker();
  }

  const port = Number(process.env.PORT || 3000);

  return new Promise((resolve) => {
    server = app.listen(port, () => {
      logger.info('Server started', { port });
      resolve(server);
    });
  });
};

const stopServer = async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
  }

  await stopPaymentWorker();
  await closeQueueResources();
  await closeRedisConnections();
  await disconnectDatabase();
};

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });

  const shutdown = async () => {
    try {
      await stopServer();
      process.exit(0);
    } catch (error) {
      logger.error('Failed during shutdown', { error: error.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  app,
  startServer,
  stopServer
};
