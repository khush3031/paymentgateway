const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDatabase = async (mongoUri = process.env.MONGODB_URI) => {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(mongoUri);
  logger.info('MongoDB connected', { uri: mongoUri });
  return mongoose.connection;
};

const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase
};
