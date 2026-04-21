import { logger } from '@/libs/Logger';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  consecutiveSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 3,
};

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private consecutiveSuccesses = 0;
  private halfOpenCalls = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = DEFAULT_CONFIG
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker for ${this.name} is OPEN`,
          this.name,
          this.state
        );
      }
    }

    if (this.state === 'half-open' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new CircuitBreakerError(
        `Circuit breaker for ${this.name} is HALF-OPEN and max calls reached`,
        this.name,
        this.state
      );
    }

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private transitionToHalfOpen(): void {
    logger.info(`Circuit breaker for ${this.name} transitioning to HALF-OPEN`);
    this.state = 'half-open';
    this.halfOpenCalls = 0;
    this.consecutiveSuccesses = 0;
  }

  private transitionToOpen(): void {
    logger.warn(`Circuit breaker for ${this.name} transitioning to OPEN after ${this.failures} failures`);
    this.state = 'open';
    this.lastFailureTime = Date.now();
  }

  private transitionToClosed(): void {
    logger.info(`Circuit breaker for ${this.name} transitioning to CLOSED`);
    this.state = 'closed';
    this.failures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = null;
  }

  private onSuccess(): void {
    this.consecutiveSuccesses++;

    if (this.state === 'half-open') {
      if (this.consecutiveSuccesses >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed();
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.consecutiveSuccesses = 0;

    if (this.state === 'half-open') {
      this.transitionToOpen();
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  getState(): CircuitState {
    return this.state;
  }
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly circuitState: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, {
      ...DEFAULT_CONFIG,
      ...config,
    }));
  }
  return circuitBreakers.get(name)!;
}

export function getAllCircuitBreakerMetrics(): Record<string, CircuitBreakerMetrics> {
  const metrics: Record<string, CircuitBreakerMetrics> = {};
  for (const [name, breaker] of circuitBreakers) {
    metrics[name] = breaker.getMetrics();
  }
  return metrics;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    retryableErrors?: Array<new (...args: unknown[]) => Error>;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    retryableErrors = [],
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt > maxRetries) {
        throw lastError;
      }

      const isRetryable = retryableErrors.length === 0 ||
        retryableErrors.some(ErrorClass => error instanceof ErrorClass);

      if (!isRetryable) {
        throw lastError;
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelayMs
      );

      logger.warn(`Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Operation failed after retries');
}

export { CircuitBreaker };
