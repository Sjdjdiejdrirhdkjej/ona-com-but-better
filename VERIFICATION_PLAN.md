# 24/7 Server Verification Runbook

## Overview
This document verifies the reliability configurations for continuous server operation with heavy workload.

## Implemented Components

### 1. Health Endpoints
- **File**: `/src/app/api/healthz/route.ts`
- **File**: `/src/app/api/readiness/route.ts`
- **QA**: `curl http://localhost:5000/api/healthz` returns JSON with status, dbHealthy, heartbeat, externalApis

### 2. Graceful Shutdown
- **File**: `/src/libs/GracefulShutdown.ts`
- **File**: `/src/instrumentation.ts` (initializes graceful shutdown)
- **File**: `/src/middleware.ts` (rejects new requests during shutdown)
- **QA**: Send SIGTERM and verify no new requests accepted and in-flight complete

### 3. DB Connection Retry
- **File**: `/src/libs/DB.ts`
- **QA**: Simulate DB failure and verify retries with backoff

### 4. External API Resilience
- **File**: `/src/libs/CircuitBreaker.ts`
- **File**: `/src/libs/ResilientApi.ts`
- **QA**: Induce failures and verify circuit breaker trips and recovers

### 5. Per-Request Timeouts
- **File**: `/src/libs/Timeout.ts`
- **QA**: Call with timeout and verify timeout error returned

### 6. Memory Monitoring
- **File**: `/src/libs/MemoryMonitor.ts`
- **QA**: GET /api/metrics shows memory stats, check alerts trigger at threshold

### 7. Log Rotation (stdout-based)
- **File**: `/src/libs/Logger.ts` (logs to stdout for collector integration)
- **QA**: Logs appear in stdout, rotation handled by container/log aggregator

### 8. Metrics Endpoint
- **File**: `/src/app/api/metrics/route.ts`
- **QA**: `curl http://localhost:5000/api/metrics` returns memory, circuit breakers, shutdown status

## Verification Commands

```bash
# 1. Health endpoint
curl -s http://localhost:5000/api/healthz | jq .

# 2. Readiness endpoint
curl -s http://localhost:5000/api/readiness | jq .

# 3. Metrics endpoint
curl -s http://localhost:5000/api/metrics | jq .

# 4. Graceful shutdown test
kill -SIGTERM $(pgrep -f "next start")

# 5. Memory monitoring (observe over time)
watch -n 5 'curl -s http://localhost:5000/api/metrics | jq .memory'

# 6. Circuit breaker test (requires service failure simulation)
# Use external tool to induce 5+ consecutive failures and observe circuit open
```

## Success Criteria

| Component | Criteria | Test Method |
|-----------|----------|-------------|
| Health | Returns 200 with all checks | `curl /api/healthz` |
| Readiness | Returns 200 when DB healthy, 503 when not | DB down simulation |
| Shutdown | Stops accepting new requests within 1s | SIGTERM test |
| DB Retry | Retries 5 times with backoff | Connection failure test |
| Circuit Breaker | Opens after threshold failures | Failure injection |
| Timeouts | Returns timeout error after limit | Long request test |
| Memory | Shows RSS/heap in metrics | `curl /api/metrics` |
| Logs | Output to stdout | Monitor container logs |

## Files Changed
- `src/libs/HealthCheck.ts` - Health check logic
- `src/app/api/healthz/route.ts` - Health endpoint
- `src/app/api/readiness/route.ts` - Readiness endpoint
- `src/libs/GracefulShutdown.ts` - Shutdown handlers
- `src/libs/DB.ts` - DB retry logic
- `src/libs/CircuitBreaker.ts` - Circuit breaker implementation
- `src/libs/ResilientApi.ts` - Resilient API wrapper
- `src/libs/Timeout.ts` - Timeout utilities
- `src/libs/MemoryMonitor.ts` - Memory monitoring
- `src/libs/Logger.ts` - Logger (unchanged, stdout-compatible)
- `src/app/api/metrics/route.ts` - Metrics endpoint
- `src/middleware.ts` - Shutdown-aware middleware
- `src/instrumentation.ts` - Initializes graceful shutdown