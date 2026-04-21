import { getCircuitBreaker, withRetry, CircuitBreakerError } from '@/libs/CircuitBreaker';
import { logger } from '@/libs/Logger';

const fireworksBreaker = getCircuitBreaker('fireworks', {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 2,
});

const daytonaBreaker = getCircuitBreaker('daytona', {
  failureThreshold: 3,
  resetTimeoutMs: 20000,
  halfOpenMaxCalls: 2,
});

export async function callWithResilience<T>(
  serviceName: 'fireworks' | 'daytona',
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelayMs?: number;
  }
): Promise<T> {
  const breaker = serviceName === 'fireworks' ? fireworksBreaker : daytonaBreaker;

  try {
    return await breaker.execute(() =>
      withRetry(operation, {
        ...options,
        maxRetries: options?.maxRetries ?? 2,
        initialDelayMs: options?.initialDelayMs ?? 1000,
        maxDelayMs: 10000,
      })
    );
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      logger.error(`${serviceName} circuit breaker is ${error.circuitState}`);
    }
    throw error;
  }
}

export function getResilienceMetrics() {
  return {
    fireworks: fireworksBreaker.getMetrics(),
    daytona: daytonaBreaker.getMetrics(),
  };
}

export { CircuitBreakerError };
