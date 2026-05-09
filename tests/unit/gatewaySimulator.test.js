const {
  GatewaySimulator
} = require('../../src/services/gatewaySimulator');
const {
  GatewayTimeoutError,
  GatewayUnavailableError
} = require('../../src/utils/AppError');

describe('GatewaySimulator', () => {
  test('Returns success within probability range', async () => {
    const simulator = new GatewaySimulator({
      random: () => 0.9,
      sleep: jest.fn().mockResolvedValue()
    });

    const result = await simulator.processPayment('pay_1', 100, 'USD');

    expect(result.success).toBe(true);
    expect(result.gatewayReference).toContain('gw_pay_1_');
    expect(result.processingTime).toBeGreaterThanOrEqual(0);
  });

  test('Returns declined result', async () => {
    const simulator = new GatewaySimulator({
      random: () => 0.1,
      sleep: jest.fn().mockResolvedValue()
    });

    const result = await simulator.processPayment('pay_2', 100, 'USD');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        reason: 'DECLINED'
      })
    );
  });

  test('Throws GatewayTimeoutError on timeout', async () => {
    const simulator = new GatewaySimulator({
      random: () => 0.01,
      sleep: jest.fn().mockResolvedValue()
    });

    await expect(simulator.processPayment('pay_3', 100, 'USD')).rejects.toBeInstanceOf(
      GatewayTimeoutError
    );
  });

  test('Throws GatewayUnavailableError on unavailability', async () => {
    const simulator = new GatewaySimulator({
      random: () => 0.04,
      sleep: jest.fn().mockResolvedValue()
    });

    await expect(simulator.processPayment('pay_4', 100, 'USD')).rejects.toBeInstanceOf(
      GatewayUnavailableError
    );
  });

  test('Handles delayed responses', async () => {
    const sleep = jest.fn().mockResolvedValue();
    const simulator = new GatewaySimulator({
      random: () => 0.47,
      sleep
    });

    const result = await simulator.processPayment('pay_5', 100, 'USD');

    expect(sleep).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.gatewayReference).toContain('gw_pay_5_');
  });
});
