const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      unique: true,
      index: true,
      default: uuidv4
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    currency: {
      type: String,
      required: true,
      enum: ['INR', 'USD', 'EUR', 'GBP']
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
      default: 'PENDING'
    },
    userId: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed
    },
    gatewayReference: {
      type: String
    },
    retryCount: {
      type: Number,
      default: 0
    },
    lastRetryAt: {
      type: Date
    },
    failureReason: {
      type: String
    },
    processedAt: {
      type: Date
    },
    webhookReceivedAt: {
      type: Date
    },
    webhookPayload: {
      type: mongoose.Schema.Types.Mixed
    },
    version: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

paymentSchema.pre('save', function incrementVersion(next) {
  if (!this.isNew) {
    this.version += 1;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
