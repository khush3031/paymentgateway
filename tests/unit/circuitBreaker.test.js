const { AppError, CircuitOpenError } = require('../../src/utils/AppError');
const { CircuitBreaker } = require('../../src/services/circuitBreaker');

describe('CircuitBreaker', () => {
  let currentTime;
  let breaker;

  beforeEach(() => {
    currentTime = 0;
    breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 1000,
      now: () => currentTime
    });
  });

  test('Starts in CLOSED state', () => {
    expect(breaker.getState().state).toBe('CLOSED');
  });

  test('Opens after failureThreshold consecutive failures', async () => {
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);

    expect(breaker.getState().state).toBe('OPEN');
  });

  test('Rejects all requests when OPEN', async () => {
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);

    await expect(breaker.execute(async () => 'ok')).rejects.toBeInstanceOf(CircuitOpenError);
  });

  test('Transitions to HALF_OPEN after resetTimeout', async () => {
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);

    currentTime = 1000;
    await expect(breaker.execute(async () => 'probe')).resolves.toBe('probe');
    expect(breaker.getState().state).toBe('CLOSED');
  });

  test('Returns to CLOSED on successful test request in HALF_OPEN', async () => {
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);

    currentTime = 1000;
    await breaker.execute(async () => 'success');

    expect(breaker.getState().state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(0);
  });

  test('Returns to OPEN on failed test request in HALF_OPEN', async () => {
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);
    await expect(breaker.execute(async () => Promise.reject(new AppError('fail', 500, 'FAIL')))).rejects.toBeInstanceOf(AppError);

    currentTime = 1000;
    await expect(
      breaker.execute(async () => Promise.reject(new AppError('probe fail', 500, 'FAIL')))
    ).rejects.toBeInstanceOf(AppError);

    expect(breaker.getState().state).toBe('OPEN');
  });
});
