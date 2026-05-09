# Payment Processing System

## Project Overview

This project is a production-grade payment processing system built with Node.js, Express.js, MongoDB, Redis, and BullMQ. It supports asynchronous payment execution, idempotent payment creation, retry with exponential backoff, distributed locking, circuit breaking, webhook handling, rate limiting, Swagger documentation, Jest test coverage, and a live self-test runner.

## Prerequisites

- Node.js 18+
- MongoDB
- Redis

## Setup Instructions

```bash
npm install
cp .env.example .env
npm start
```

The API starts on `http://localhost:3000` by default.

## Environment Variables

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/payment_system
REDIS_URL=redis://localhost:6379
MAX_RETRY_ATTEMPTS=3
RETRY_BASE_DELAY_MS=1000
GATEWAY_TIMEOUT_MS=5000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=30000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
NODE_ENV=development
```

## How To Run Tests

```bash
npm test
```

## How To Run Self-Test

Start MongoDB, Redis, and the application first, then run:

```bash
node src/selfTest.js
```

The script prints a PASS/FAIL table for all 14 required scenarios.

## Swagger Documentation

Swagger UI is available at:

```bash
http://localhost:3000/api/docs
```

## API Reference

### Create Payment

```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-001" \
  -d '{
    "amount": 1500,
    "currency": "USD",
    "userId": "user-123",
    "description": "Order payment",
    "metadata": { "orderId": "ORD-1001" }
  }'
```

### Get Payment By ID

```bash
curl http://localhost:3000/api/v1/payments/<paymentId>
```

### List Payments

```bash
curl "http://localhost:3000/api/v1/payments?status=SUCCESS&userId=user-123&page=1&limit=10"
```

### Retry Failed Payment

```bash
curl -X POST http://localhost:3000/api/v1/payments/<paymentId>/retry
```

### Payment Webhook

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/payment \
  -H "Content-Type: application/json" \
  -d '{
    "gatewayReference": "gw_abc123",
    "status": "SUCCESS",
    "payload": { "source": "gateway" }
  }'
```

## Manual Testing Guide

### Happy Path

```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: happy-1" \
  -d '{"amount":100,"currency":"USD","userId":"manual-user"}'
```

Then poll:

```bash
curl http://localhost:3000/api/v1/payments/<paymentId>
```

### Invalid Input

```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: invalid-1" \
  -d '{"amount":-10,"currency":"USD","userId":"manual-user"}'
```

### Missing Idempotency-Key

```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"currency":"USD","userId":"manual-user"}'
```

### Idempotent Replay

Run the same create-payment request twice with the same `Idempotency-Key`.

### Retry Flow

Create or identify a `FAILED` payment, then:

```bash
curl -X POST http://localhost:3000/api/v1/payments/<paymentId>/retry
```

### Webhook Success

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/payment \
  -H "Content-Type: application/json" \
  -d '{"gatewayReference":"gw_ref","status":"SUCCESS","payload":{"source":"manual"}}'
```

### Webhook Failure

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/payment \
  -H "Content-Type: application/json" \
  -d '{"gatewayReference":"gw_ref","status":"FAILED","payload":{"reason":"DECLINED"}}'
```

### Pagination

```bash
curl "http://localhost:3000/api/v1/payments?page=2&limit=5"
```

## Architecture Decisions

### Why BullMQ

BullMQ gives Redis-backed persistence, reliable background job execution, job events, worker concurrency, and operational simplicity for payment processing tasks that should not block HTTP request latency.

### Why Optimistic Locking

Optimistic locking prevents double-processing during race conditions without serializing the entire application. Version checks make state changes safe across async workers, retries, and manual retry requests.

### Why Circuit Breaker

The circuit breaker stops repeated calls to an unhealthy gateway, protects downstream resources, and allows controlled recovery through the HALF_OPEN probe flow.

## Edge Cases Handled

- Duplicate payment creation using the same idempotency key
- Concurrent retry requests on the same payment
- Safe Redis lock release using a Lua script
- Gateway timeouts, unavailability, declines, delayed success, and network-style failures
- Retry with exponential backoff and jitter
- Non-retryable failures failing immediately
- Webhook duplicates, invalid transitions, unknown references, and conflict suppression
- Rate limiting for all `/api/v1/*` routes
- Global structured error responses with production-safe stack behavior

## Bonus Features Implemented

- Live self-test runner for 14 edge-case scenarios
- Forceable gateway simulation through `metadata.gatewaySimulation` for deterministic testing
- Winston file and console logging
- Swagger UI with request and response documentation
- In-memory MongoDB integration tests and mocked Redis/BullMQ dependencies
- Automatic inline-processing fallback when BullMQ detects a legacy Redis server without stream support
