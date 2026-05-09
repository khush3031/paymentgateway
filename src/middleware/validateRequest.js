const Joi = require('joi');
const { ValidationError } = require('../utils/AppError');

const paymentCreationSchema = Joi.object({
  amount: Joi.number().required().min(0.01).max(10000000),
  currency: Joi.string().required().valid('INR', 'USD', 'EUR', 'GBP'),
  userId: Joi.string().required().min(1).max(100),
  description: Joi.string().max(500).optional(),
  metadata: Joi.object().optional()
});

const webhookSchema = Joi.object({
  gatewayReference: Joi.string().required(),
  status: Joi.string().required().valid('SUCCESS', 'FAILED'),
  payload: Joi.object().optional()
});

const validateRequest = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({
      error: 'Validation failed',
      details
    });
  }

  req.body = value;
  next();
};

module.exports = {
  validateRequest,
  schemas: {
    paymentCreationSchema,
    webhookSchema
  }
};
