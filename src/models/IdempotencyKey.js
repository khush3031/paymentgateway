const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  paymentId: {
    type: String,
    required: true
  },
  response: {
    type: mongoose.Schema.Types.Mixed
  },
  statusCode: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400
  }
});

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
