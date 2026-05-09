const { paymentCircuitBreaker } = require('./src/services/circuitBreaker');

console.log('Circuit breaker state before reset:', paymentCircuitBreaker.getState());
paymentCircuitBreaker.reset();
console.log('Circuit breaker state after reset:', paymentCircuitBreaker.getState());