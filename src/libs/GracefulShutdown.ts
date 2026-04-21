import { logger } from '@/libs/Logger';

export type ShutdownState = {
  isShuttingDown: boolean;
  shutdownDeadline: number;
  activeRequests: number;
};

export const shutdownState: ShutdownState = {
  isShuttingDown: false,
  shutdownDeadline: 0,
  activeRequests: 0,
};

const SHUTDOWN_GRACE_PERIOD_MS = 30000;

const shutdownCallbacks: Array<() => void | Promise<void>> = [];

export function registerShutdownCallback(callback: () => void | Promise<void>) {
  shutdownCallbacks.push(callback);
}

export function incrementActiveRequests(): void {
  if (!shutdownState.isShuttingDown) {
    shutdownState.activeRequests++;
  }
}

export function decrementActiveRequests(): void {
  shutdownState.activeRequests = Math.max(0, shutdownState.activeRequests - 1);
}

export function isShuttingDown(): boolean {
  return shutdownState.isShuttingDown;
}

export function canAcceptRequests(): boolean {
  return !shutdownState.isShuttingDown;
}

export function initiateShutdown(): void {
  if (shutdownState.isShuttingDown) {
    return;
  }

  shutdownState.isShuttingDown = true;
  shutdownState.shutdownDeadline = Date.now() + SHUTDOWN_GRACE_PERIOD_MS;

  logger.info('Shutdown initiated. Grace period:', SHUTDOWN_GRACE_PERIOD_MS, 'ms');

  Promise.all(shutdownCallbacks.map(async (cb) => {
    try {
      await cb();
    } catch (error) {
      logger.error('Shutdown callback error:', error);
    }
  })).then(() => {
    waitForDrain();
  });
}

function waitForDrain(): void {
  if (typeof setInterval === 'undefined') {
    return;
  }

  const checkInterval = setInterval(() => {
    const now = Date.now();
    const timeRemaining = shutdownState.shutdownDeadline - now;

    if (shutdownState.activeRequests === 0) {
      logger.info('All requests completed. Shutting down gracefully.');
      clearInterval(checkInterval);
      return;
    }

    if (timeRemaining <= 0) {
      logger.warn('Shutdown timeout reached with', shutdownState.activeRequests, 'active requests.');
      clearInterval(checkInterval);
      return;
    }

    logger.info(`Waiting for ${shutdownState.activeRequests} active requests. ${timeRemaining}ms remaining.`);
  }, 1000);
}

export function setupGracefulShutdown(): void {
  if (typeof process === 'undefined' || !process.on) {
    return;
  }

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    initiateShutdown();
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received');
    initiateShutdown();
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    initiateShutdown();
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
    initiateShutdown();
  });

  logger.info('Graceful shutdown handlers registered');
}

export function getShutdownStatus(): { shuttingDown: boolean; activeRequests: number; deadline: number | null } {
  return {
    shuttingDown: shutdownState.isShuttingDown,
    activeRequests: shutdownState.activeRequests,
    deadline: shutdownState.isShuttingDown ? shutdownState.shutdownDeadline : null,
  };
}
