const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Payment Processing API',
      version: '1.0.0',
      description: 'Production-grade payment processing system'
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Local server'
      }
    ],
    components: {
      parameters: {
        IdempotencyKey: {
          in: 'header',
          name: 'Idempotency-Key',
          required: true,
          schema: { type: 'string' },
          description: 'Unique idempotency key for payment creation'
        }
      },
      schemas: {
        PaymentCreateRequest: {
          type: 'object',
          required: ['amount', 'currency', 'userId'],
          properties: {
            amount: { type: 'number', minimum: 0.01, maximum: 10000000 },
            currency: { type: 'string', enum: ['INR', 'USD', 'EUR', 'GBP'] },
            userId: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            metadata: { type: 'object', additionalProperties: true }
          }
        },
        PaymentResponse: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            paymentId: { type: 'string' },
            idempotencyKey: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'] },
            userId: { type: 'string' },
            description: { type: 'string' },
            metadata: { type: 'object', additionalProperties: true },
            gatewayReference: { type: 'string' },
            retryCount: { type: 'number' },
            lastRetryAt: { type: 'string', format: 'date-time' },
            failureReason: { type: 'string' },
            processedAt: { type: 'string', format: 'date-time' },
            webhookReceivedAt: { type: 'string', format: 'date-time' },
            webhookPayload: { type: 'object', additionalProperties: true },
            version: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Validation failed' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        WebhookRequest: {
          type: 'object',
          required: ['gatewayReference', 'status'],
          properties: {
            gatewayReference: { type: 'string' },
            status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
            payload: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  },
  apis: [
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../controllers/*.js')
  ]
});

module.exports = swaggerSpec;
