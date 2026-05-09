const express = require('express');
const { validateRequest, schemas } = require('../middleware/validateRequest');
const { handlePaymentWebhook } = require('../controllers/webhookController');

const router = express.Router();

/**
 * @swagger
 * /api/v1/webhooks/payment:
 *   post:
 *     summary: Receive gateway webhook events
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookRequest'
 *     responses:
 *       200:
 *         description: Webhook accepted
 *       400:
 *         description: Validation failed
 */
router.post('/payment', validateRequest(schemas.webhookSchema), handlePaymentWebhook);

module.exports = router;
