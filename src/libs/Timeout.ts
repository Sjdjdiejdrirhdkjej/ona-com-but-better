import { logger } from '@/libs/Logger';

export class RequestTimeoutError extends Error {
  constructor(message = 'Request timeout') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new RequestTimeoutError(timeoutMessage ?? `Operation timed out after ${timeoutMs}ms`));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createTimeoutHandler(defaultTimeoutMs = 30000) {
  return async <T>(
    promise: Promise<T>,
    customTimeoutMs?: number,
    customMessage?: string
  ): Promise<T> => {
    const timeoutMs = customTimeoutMs ?? defaultTimeoutMs;
    return withTimeout(promise, timeoutMs, customMessage);
  };
}

export async function withTimeoutAndCleanup<T>(
  promise: Promise<T>,
  cleanup: () => void | Promise<void>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, timeoutMessage);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  }
}

export const DEFAULT_TIMEOUTS = {
  HEALTH_CHECK: 5000,
  DATABASE_QUERY: 30000,
  EXTERNAL_API: 120000,
  CHAT_STREAM: 300000,
  HEARTBEAT_PROCESSING: 60000,
} as const;
