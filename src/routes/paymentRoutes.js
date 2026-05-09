const express = require('express');
const idempotencyMiddleware = require('../middleware/idempotency');
const { validateRequest, schemas } = require('../middleware/validateRequest');
const {
  initiatePayment,
  getPaymentStatus,
  getAllPayments,
  retryPayment
} = require('../controllers/paymentController');

const router = express.Router();

/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Initiate a payment
 *     parameters:
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentCreateRequest'
 *     responses:
 *       202:
 *         description: Payment queued for processing
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       409:
 *         description: Concurrent processing conflict
 *       503:
 *         description: Downstream service unavailable
 *   get:
 *     summary: List payments
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, SUCCESS, FAILED]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated payment list
 */
router.post('/', idempotencyMiddleware, validateRequest(schemas.paymentCreationSchema), initiatePayment);
router.get('/', getAllPayments);

/**
 * @swagger
 * /api/v1/payments/{paymentId}:
 *   get:
 *     summary: Get payment by paymentId
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentResponse'
 *       404:
 *         description: Payment not found
 */
router.get('/:paymentId', getPaymentStatus);

/**
 * @swagger
 * /api/v1/payments/{paymentId}/retry:
 *   post:
 *     summary: Retry a failed payment
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       202:
 *         description: Payment queued for retry
 *       404:
 *         description: Payment not found
 *       409:
 *         description: Payment cannot be retried
 */
router.post('/:paymentId/retry', retryPayment);

module.exports = router;
