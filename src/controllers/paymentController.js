const asyncWrapper = require('../utils/asyncWrapper');
const { paymentService } = require('../services/paymentService');

const initiatePayment = asyncWrapper(async (req, res) => {
  const response = await paymentService.initiatePayment(req.body, req.idempotencyKey);
  return res.status(202).json(response);
});

const getPaymentStatus = asyncWrapper(async (req, res) => {
  const payment = await paymentService.getPaymentStatus(req.params.paymentId);
  return res.status(200).json(payment);
});

const getAllPayments = asyncWrapper(async (req, res) => {
  const result = await paymentService.getAllPayments(
    {
      status: req.query.status,
      userId: req.query.userId
    },
    {
      page: req.query.page,
      limit: req.query.limit
    }
  );
  return res.status(200).json(result);
});

const retryPayment = asyncWrapper(async (req, res) => {
  const response = await paymentService.retryPayment(req.params.paymentId);
  return res.status(202).json(response);
});

module.exports = {
  initiatePayment,
  getPaymentStatus,
  getAllPayments,
  retryPayment
};
