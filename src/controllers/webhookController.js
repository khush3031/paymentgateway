const { webhookService } = require('../services/webhookService');

const handlePaymentWebhook = async (req, res) => {
  const result = await webhookService.handleWebhook(
    req.body.gatewayReference,
    req.body.status,
    req.body.payload
  );

  return res.status(200).json({
    received: true,
    ...result
  });
};

module.exports = {
  handlePaymentWebhook
};
